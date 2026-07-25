"""SmartPack — GNN + PPO topology-aware job placement.

Reward: R = alpha*U_GPU + beta*(1/L_queue) - gamma*C_interference - delta*C_migration

Model contract (matches neuralsched-training-v6/smartpack Phase 3 exactly):
  load_model() -> PPO.load(smartpack_gnn_ppo.pth) if present, else "rule_based".
  predict(input) -> {assigned_node, placement_score, method}.

Real input schema (Phase 3 predict):
  {
    "job": {"gpu_requirement": int, "tag": str},
    "nodes": [
      {"id": str, "gpu_util": float, "queue_len": float,
       "active_jobs": int, "neighbors": [str]}     # up to 4 used
    ]
  }
The model is trained for a FIXED 32-node cluster (NUM_NODES=32). The simulator
now also runs 32 nodes, so ids map 1:1.

Output schema:
  {"assigned_node": str, "placement_score": float, "method": "gnn_ppo"|"rule_based"}
"""
from __future__ import annotations

import os
import random
from typing import Any

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "smartpack_gnn_ppo.pth")

# --- constants from smartpack/phase1_setup_data_model.py ---
NUM_NODES = 32
MAX_QUEUE = 64
GNN_HIDDEN = 64
GNN_LAYERS = 2
# Reward weights used by the mock scorer (training used 1.0/0.5/0.8/0.3).
ALPHA, BETA, GAMMA, DELTA = 1.0, 0.5, 0.8, 0.3

_model = None  # None | "rule_based" | SB3 PPO


# --------------------------------------------------------------------------
# The custom feature extractor must be importable for PPO.load() to rebuild
# the policy. Defined lazily so torch/SB3/torch_geometric are only imported
# when the real weights are present.
# --------------------------------------------------------------------------
def _register_policy_classes():
    import torch
    import torch.nn as nn
    from torch_geometric.nn import SAGEConv
    from stable_baselines3.common.torch_layers import BaseFeaturesExtractor

    class ClusterGNN(nn.Module):
        def __init__(self, node_feat_dim=7, hidden=GNN_HIDDEN, layers=GNN_LAYERS, num_nodes=NUM_NODES):
            super().__init__()
            self.num_nodes = num_nodes
            self.convs = nn.ModuleList()
            in_dim = node_feat_dim
            for _ in range(layers):
                self.convs.append(SAGEConv(in_dim, hidden))
                in_dim = hidden
            self.act = nn.ReLU()
            src = list(range(num_nodes))
            dst = [(i + 1) % num_nodes for i in range(num_nodes)]
            edges = list(zip(src, dst)) + list(zip(dst, src))
            self.register_buffer("edge_index", torch.tensor(edges, dtype=torch.long).t().contiguous())

        def forward(self, node_feats):
            b, n, d = node_feats.shape
            x = node_feats.reshape(b * n, d)
            ei = torch.cat([self.edge_index + i * n for i in range(b)], dim=1)
            for conv in self.convs:
                x = self.act(conv(x, ei))
            return x.reshape(b, n, -1).mean(dim=1)

    class SmartPackFeaturesExtractor(BaseFeaturesExtractor):
        def __init__(self, observation_space, num_nodes=NUM_NODES, node_feat_dim=7, job_feat_dim=3):
            super().__init__(observation_space, features_dim=GNN_HIDDEN + 32)
            self.num_nodes, self.node_feat_dim, self.job_feat_dim = num_nodes, node_feat_dim, job_feat_dim
            self.gnn = ClusterGNN(node_feat_dim=node_feat_dim, num_nodes=num_nodes)
            self.job_mlp = nn.Sequential(nn.Linear(job_feat_dim, 32), nn.ReLU())

        def forward(self, obs):
            node_part = obs[:, : self.num_nodes * self.node_feat_dim]
            job_part = obs[:, self.num_nodes * self.node_feat_dim:]
            node_feats = node_part.reshape(-1, self.num_nodes, self.node_feat_dim)
            return torch.cat([self.gnn(node_feats), self.job_mlp(job_part)], dim=1)

    # SB3 pickles the extractor by its qualified name; expose it on this module.
    globals()["ClusterGNN"] = ClusterGNN
    globals()["SmartPackFeaturesExtractor"] = SmartPackFeaturesExtractor
    import sys
    mod = sys.modules[__name__]
    setattr(mod, "ClusterGNN", ClusterGNN)
    setattr(mod, "SmartPackFeaturesExtractor", SmartPackFeaturesExtractor)


def load_model() -> Any:
    global _model
    if os.path.exists(MODEL_PATH):
        try:
            _register_policy_classes()
            from stable_baselines3 import PPO
            _model = PPO.load(MODEL_PATH, device="cpu")
            return _model
        except Exception as exc:  # noqa: BLE001
            print(f"[smartpack] real model load failed ({exc}); using rule_based mock.")
    _model = "rule_based"
    return _model


def _normalize_nodes(input_data: dict) -> tuple[list[dict], dict]:
    """Accept both the trained schema (id/queue_len/neighbors) and the backend
    schema (node_id/nvlink_peers). Returns (nodes_in_trained_form, job)."""
    raw = input_data.get("nodes", [])
    job = input_data.get("job")
    if job is None:
        job = {"gpu_requirement": input_data.get("gpu_requirement", 1),
               "tag": input_data.get("tag", "flexible")}
    nodes = []
    for nd in raw:
        nodes.append({
            "id": nd.get("id", nd.get("node_id")),
            "gpu_util": float(nd.get("gpu_util", 0.5)),
            "queue_len": float(nd.get("queue_len", nd.get("active_jobs", 0))),
            "active_jobs": int(nd.get("active_jobs", 0)),
            "neighbors": nd.get("neighbors", nd.get("nvlink_peers", [])),
        })
    return nodes, job


def _build_obs(nodes: list[dict], job: dict):
    """Mirror smartpack/phase3 _build_obs exactly (32-node observation)."""
    import numpy as np
    id_to_idx = {node["id"]: i for i, node in enumerate(nodes)}
    feats = []
    for node in nodes:
        neigh_ids = node.get("neighbors", [])[:4]
        neigh_utils = [nodes[id_to_idx[nid]]["gpu_util"] if nid in id_to_idx else 0.0 for nid in neigh_ids]
        while len(neigh_utils) < 4:
            neigh_utils.append(0.0)
        feats.extend([float(node["gpu_util"]), float(node["queue_len"]) / MAX_QUEUE,
                      float(node["active_jobs"]) / 10.0, *neigh_utils])
    tag_map = {"urgent": 0.0, "flexible": 0.5, "best_effort_green": 1.0}
    job_feats = [float(job["gpu_requirement"]) / 8.0, 0.5,
                 tag_map.get(job.get("tag", "flexible"), 0.5)]
    return np.array(feats + job_feats, dtype=np.float32), id_to_idx


def predict(input_data: dict) -> dict:
    if _model is None:
        load_model()

    nodes, job = _normalize_nodes(input_data)
    if not nodes:
        return {"assigned_node": "gpu-node-0", "placement_score": 0.5, "method": "rule_based"}

    if _model != "rule_based":
        try:
            import numpy as np
            import torch
            n = len(nodes)
            # Model observation is locked to 32 nodes; pad/truncate to match.
            work = nodes[:NUM_NODES]
            if len(work) < NUM_NODES:
                filler = {"id": None, "gpu_util": 1.0, "queue_len": MAX_QUEUE,
                          "active_jobs": 10, "neighbors": []}
                work = work + [dict(filler) for _ in range(NUM_NODES - len(work))]
            obs, id_to_idx = _build_obs(work, job)
            action, _ = _model.predict(obs, deterministic=True)
            action = int(action) % n  # map back into real node range
            idx_to_id = {v: k for k, v in id_to_idx.items() if k is not None}
            assigned = idx_to_id.get(action, nodes[action % n]["id"])
            obs_t = _model.policy.obs_to_tensor(obs[None, :])[0]
            with torch.no_grad():
                value = _model.policy.predict_values(obs_t).item()
            placement_score = float(1 / (1 + np.exp(-value)))
            return {"assigned_node": assigned,
                    "placement_score": round(placement_score, 4),
                    "method": "gnn_ppo"}
        except Exception as exc:  # noqa: BLE001
            print(f"[smartpack] real inference failed ({exc}); falling back to rule_based.")

    # ---- rule-based mock: reward-formula scoring ----
    gpu_req = job.get("gpu_requirement", 1)
    util_add = min(1.0, gpu_req / 8.0)
    best_node, best_score = None, -1e9
    for node in nodes:
        u_gpu = 1.0 - node["gpu_util"]
        l_queue = max(node["queue_len"], 1.0)
        neigh = node.get("neighbors", [])
        idmap = {nd["id"]: nd for nd in nodes}
        interference = 0.0
        for nid in neigh:
            if nid in idmap:
                interference += idmap[nid]["gpu_util"] * util_add
        interference /= max(1, len(neigh))
        migration = 0.2 if node["active_jobs"] > 3 else 0.0
        score = ALPHA * u_gpu + BETA * (1.0 / l_queue) - GAMMA * interference - DELTA * migration
        score += random.gauss(0, 0.02)
        if score > best_score:
            best_score, best_node = score, node["id"]
    return {"assigned_node": best_node or nodes[0]["id"],
            "placement_score": round(float(best_score), 4),
            "method": "rule_based"}
