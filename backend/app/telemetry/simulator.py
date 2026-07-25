"""Synthetic GPU telemetry generator.

Ticks every N seconds (default 10s), producing plausible values for the 7
SentinelAI metrics per simulated GPU node. Occasionally injects a slow
degrading fault so SentinelAI has a real, explainable signal to catch live.

This is a deliberate, standard prototyping approach: there is no physical
cluster, so we emulate a DCGM/Kafka-style telemetry stream. Documented as
"simulated data" throughout the UI.
"""
from __future__ import annotations

import asyncio
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from app.config import settings

# Metric order MUST match sentinelai training (phase1 METRIC_NAMES) exactly.
METRICS = ["temp", "power_draw", "ecc_errors", "sm_clock",
           "pcie_throughput", "memory_util", "fan_rpm"]
WINDOW_SAMPLES = 180  # 30 min at 10s granularity


@dataclass
class NodeState:
    node_id: str
    gpu_util: float = 0.4
    active_jobs: int = 0
    faulting: bool = False
    fault_progress: float = 0.0
    nvlink_peers: list[str] = field(default_factory=list)
    window: Deque[dict] = field(default_factory=lambda: deque(maxlen=WINDOW_SAMPLES))
    util_history: Deque[float] = field(default_factory=lambda: deque(maxlen=WINDOW_SAMPLES))


class TelemetrySimulator:
    def __init__(self, num_nodes: int | None = None):
        self.num_nodes = num_nodes or settings.num_gpu_nodes
        self.nodes: dict[str, NodeState] = {}
        self._task: asyncio.Task | None = None
        self._running = False
        self.subscribers: set[asyncio.Queue] = set()
        self._init_nodes()

    def _init_nodes(self):
        ids = [f"gpu-node-{i}" for i in range(self.num_nodes)]
        for i, nid in enumerate(ids):
            # Ring + cross NVLink topology for a believable graph.
            peers = [ids[(i + 1) % self.num_nodes], ids[(i - 1) % self.num_nodes]]
            if self.num_nodes > 4:
                peers.append(ids[(i + self.num_nodes // 2) % self.num_nodes])
            state = NodeState(node_id=nid, gpu_util=random.uniform(0.2, 0.7))
            state.nvlink_peers = list(set(p for p in peers if p != nid))
            self.nodes[nid] = state
            # Pre-fill the FULL 180-sample window so SentinelAI sees a complete
            # 30-min window immediately (matches the TCN's training length;
            # short padded windows produce false-positive ramp artifacts).
            for _ in range(WINDOW_SAMPLES):
                self._sample_node(state)

    def _sample_node(self, node: NodeState) -> dict:
        # Healthy telemetry stays within ~1 std of the SentinelAI training
        # HEALTHY_MEAN/STD across the full load range, so the real TCN reads
        # healthy nodes as healthy. Load nudges values only mildly; a fault (f)
        # is what drives metrics out of distribution.
        load = node.gpu_util          # 0..1
        lc = load - 0.5               # centered load, -0.5..0.5
        f = node.fault_progress if node.faulting else 0.0

        sample = {
            "temp": round(55 + lc * 6 + f * 35 + random.gauss(0, 1.5), 1),
            "power_draw": round(180 + lc * 24 + f * 90 + random.gauss(0, 6), 1),
            "ecc_errors": round(max(0.0, 0.5 + f * 10 + random.gauss(0, 0.3)), 2),
            "sm_clock": round(1350 + lc * 20 - f * 260 + random.gauss(0, 12), 1),
            "pcie_throughput": round(12 + lc * 2 - f * 6 + random.gauss(0, 0.6), 2),
            "memory_util": round(min(0.99, max(0.05, 0.55 + lc * 0.18 + f * 0.3 + random.gauss(0, 0.03))), 3),
            "fan_rpm": round(2400 + lc * 150 + f * 1800 + random.gauss(0, 45), 0),
            "ts": time.time(),
        }
        node.window.append(sample)
        node.util_history.append(load)
        return sample

    def _tick(self):
        for node in self.nodes.values():
            # Random-walk the utilization.
            node.gpu_util = max(0.02, min(0.98, node.gpu_util + random.gauss(0, 0.05)))

            # Fault lifecycle: rare spontaneous onset, then slow degrade. Kept
            # rare on purpose — at a 10s tick a higher rate turns the whole
            # cluster red within minutes (nodes go "red one by one" with no
            # jobs submitted). Operators can still force faults via inject_fault.
            if node.faulting:
                node.fault_progress = min(1.0, node.fault_progress + random.uniform(0.02, 0.05))
                if node.fault_progress >= 1.0 and random.random() < 0.1:
                    self._recover(node)
            elif random.random() < 0.0004:
                node.faulting = True
                node.fault_progress = 0.05

            self._sample_node(node)

    def _recover(self, node: NodeState):
        """Clear a fault and flush the degraded window so the node reads healthy
        again immediately (otherwise the 30-min window keeps it red long after
        recovery)."""
        node.faulting = False
        node.fault_progress = 0.0
        node.window.clear()
        for _ in range(WINDOW_SAMPLES):
            self._sample_node(node)

    def inject_fault(self, node_id: str) -> bool:
        node = self.nodes.get(node_id)
        if node:
            node.faulting = True
            node.fault_progress = max(node.fault_progress, 0.1)
            return True
        return False

    def heal_node(self, node_id: str) -> bool:
        """Clear a fault and drain load after a job is migrated off the node.

        Refills the window with healthy samples so SentinelAI immediately reads
        the node as recovered (no lingering fault ramp in the 30-min window).
        """
        node = self.nodes.get(node_id)
        if not node:
            return False
        node.faulting = False
        node.fault_progress = 0.0
        node.gpu_util = max(0.15, node.gpu_util * 0.4)
        node.active_jobs = max(0, node.active_jobs - 1)
        node.window.clear()
        for _ in range(WINDOW_SAMPLES):
            self._sample_node(node)
        return True

    def add_load(self, node_id: str, delta: float = 0.15) -> bool:
        node = self.nodes.get(node_id)
        if not node:
            return False
        node.gpu_util = min(0.98, node.gpu_util + delta)
        node.active_jobs += 1
        return True

    def snapshot(self) -> dict:
        return {
            "nodes": [
                {
                    "node_id": n.node_id,
                    "gpu_util": round(n.gpu_util, 3),
                    "active_jobs": n.active_jobs,
                    "nvlink_peers": n.nvlink_peers,
                    "faulting": n.faulting,
                    "latest": n.window[-1] if n.window else {},
                }
                for n in self.nodes.values()
            ],
            "ts": time.time(),
            "simulated": True,
        }

    def get_window(self, node_id: str) -> list[dict]:
        node = self.nodes.get(node_id)
        return list(node.window) if node else []

    def get_window_matrix(self, node_id: str) -> list[list[float]]:
        """Raw window as [[7 metrics] x N] in the exact SentinelAI metric order.

        This is the shape the trained TCN's predict() expects (un-normalized).
        """
        node = self.nodes.get(node_id)
        if not node:
            return []
        return [[float(s[m]) for m in METRICS] for s in node.window]

    def get_util_history(self, node_id: str) -> list[float]:
        node = self.nodes.get(node_id)
        return list(node.util_history) if node else []

    async def _run(self):
        self._running = True
        while self._running:
            self._tick()
            snap = self.snapshot()
            for q in list(self.subscribers):
                try:
                    q.put_nowait(snap)
                except asyncio.QueueFull:
                    pass
            await asyncio.sleep(settings.telemetry_tick_seconds)

    def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)


# Global singleton used by the API layer.
simulator = TelemetrySimulator()
