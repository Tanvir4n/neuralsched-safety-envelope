"""SentinelAI — TCN over 30-min sliding windows of 7 telemetry metrics.

Metrics @10s granularity: temp, power_draw, ecc_errors, sm_clock,
pcie_throughput, memory_util, fan_rpm. When failure probability P > 0.75 the
orchestrator checkpoints + migrates the job, and a SHAP attribution chart
explains which metric drove the alert.

Model contract (matches neuralsched-training-v6/sentinelai Phase 3 exactly):
  load_model() -> loads sentinelai_tcn.pth {model_state, mean, std} if present.
  predict(input) -> failure probability + alert + SHAP attribution.

Real input schema:
  {"node_id": str, "window": [[7 raw metrics] x up to 180]}   # raw, un-normalized
Real output schema:
  {"node_id", "failure_probability", "alert", "shap": {metric: pct}, "method"}
"""
from __future__ import annotations

import math
import os
from typing import Any

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "sentinelai_tcn.pth")

# --- constants copied verbatim from sentinelai/phase1_setup_data_model.py ---
WINDOW_LEN = 180
NUM_METRICS = 7
METRICS = ["temp", "power_draw", "ecc_errors", "sm_clock",
           "pcie_throughput", "memory_util", "fan_rpm"]
METRIC_NAMES = METRICS  # alias used elsewhere
TCN_CHANNELS = [32, 32, 64, 64, 128, 128]
TCN_KERNEL_SIZE = 3
TCN_DROPOUT = 0.2
ALERT_THRESHOLD = 0.75

HEALTHY_MEAN = [55.0, 180.0, 0.5, 1350.0, 12.0, 0.55, 2400.0]
HEALTHY_STD = [5.0, 20.0, 0.3, 60.0, 2.0, 0.15, 150.0]

# --- mock-fallback tuning (used only when no .pth present) ---
BASELINES = dict(zip(METRICS, HEALTHY_MEAN))
DIRECTION = {"temp": 1, "power_draw": 1, "ecc_errors": 1, "sm_clock": -1,
             "pcie_throughput": -1, "memory_util": 1, "fan_rpm": 1}
SCALE = dict(zip(METRICS, HEALTHY_STD))
WEIGHT = {"temp": 1.1, "power_draw": 0.8, "ecc_errors": 1.4, "sm_clock": 0.9,
          "pcie_throughput": 0.7, "memory_util": 0.8, "fan_rpm": 1.0}

_model = None          # None | "analytic" | torch model
_norm = (None, None)   # (mean[7], std[7]) numpy arrays from checkpoint
_explainer = None      # lazily-built shap explainer
_background = None      # normalized background tensor for shap


# --------------------------------------------------------------------------
# Architecture — identical to sentinelai/phase1 so the state_dict loads clean.
# --------------------------------------------------------------------------
def _build_torch_model():
    import torch.nn as nn

    class CausalConv1d(nn.Module):
        def __init__(self, in_ch, out_ch, kernel_size, dilation):
            super().__init__()
            self.pad = (kernel_size - 1) * dilation
            self.conv = nn.Conv1d(in_ch, out_ch, kernel_size, padding=self.pad, dilation=dilation)

        def forward(self, x):
            out = self.conv(x)
            return out[:, :, :-self.pad] if self.pad > 0 else out

    class ResidualBlock(nn.Module):
        def __init__(self, in_ch, out_ch, kernel_size, dilation, dropout):
            super().__init__()
            self.conv1 = CausalConv1d(in_ch, out_ch, kernel_size, dilation)
            self.conv2 = CausalConv1d(out_ch, out_ch, kernel_size, dilation)
            self.norm1 = nn.BatchNorm1d(out_ch)
            self.norm2 = nn.BatchNorm1d(out_ch)
            self.act = nn.ReLU()
            self.dropout = nn.Dropout(dropout)
            self.downsample = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else None

        def forward(self, x):
            res = x if self.downsample is None else self.downsample(x)
            out = self.dropout(self.act(self.norm1(self.conv1(x))))
            out = self.dropout(self.act(self.norm2(self.conv2(out))))
            return self.act(out + res)

    class SentinelTCN(nn.Module):
        def __init__(self, in_channels=NUM_METRICS, channels=TCN_CHANNELS,
                     kernel_size=TCN_KERNEL_SIZE, dropout=TCN_DROPOUT):
            super().__init__()
            layers, prev_ch = [], in_channels
            for i, ch in enumerate(channels):
                layers.append(ResidualBlock(prev_ch, ch, kernel_size, dilation=2 ** i, dropout=dropout))
                prev_ch = ch
            self.tcn = nn.Sequential(*layers)
            self.pool = nn.AdaptiveAvgPool1d(1)
            self.cls_head = nn.Linear(prev_ch, 1)
            self.ttf_head = nn.Linear(prev_ch, 1)

        def forward(self, x):
            feat = self.tcn(x)
            pooled = self.pool(feat).squeeze(-1)
            return self.cls_head(pooled).squeeze(-1), self.ttf_head(pooled).squeeze(-1), pooled

    return SentinelTCN()


def _build_background():
    """Synthetic healthy background (normalized) for the SHAP explainer.

    The Kaggle test split isn't shipped with the weights, so we reconstruct a
    small healthy background from the training HEALTHY_MEAN/STD — the same
    distribution the model saw as class 0.
    """
    import numpy as np
    import torch
    mean, std = _norm
    rng = np.random.default_rng(0)
    bg = []
    for _ in range(16):
        w = rng.normal(HEALTHY_MEAN, HEALTHY_STD, size=(WINDOW_LEN, NUM_METRICS))
        w = np.clip(w, 0, None)
        norm = (w - mean) / std
        bg.append(torch.tensor(norm, dtype=torch.float32).transpose(0, 1))
    return torch.stack(bg)


def load_model() -> Any:
    global _model, _norm
    if os.path.exists(MODEL_PATH):
        try:
            import numpy as np
            import torch
            ckpt = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
            model = _build_torch_model()
            model.load_state_dict(ckpt["model_state"])
            model.eval()
            _model = model
            _norm = (np.asarray(ckpt["mean"], dtype=np.float32),
                     np.asarray(ckpt["std"], dtype=np.float32))
            return _model
        except Exception as exc:  # noqa: BLE001
            print(f"[sentinelai] real model load failed ({exc}); using analytic mock.")
    _model = "analytic"
    return _model


def _preprocess(window_list):
    """Pad/truncate to 180, normalize, -> tensor (1, 7, 180). Mirrors Phase 3."""
    import numpy as np
    import torch
    mean, std = _norm
    arr = np.array(window_list, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != NUM_METRICS:
        arr = arr.reshape(-1, NUM_METRICS)
    if arr.shape[0] < WINDOW_LEN:
        pad = np.tile(arr[0:1], (WINDOW_LEN - arr.shape[0], 1))
        arr = np.concatenate([pad, arr], axis=0)
    else:
        arr = arr[-WINDOW_LEN:]
    norm = (arr - mean) / std
    return torch.tensor(norm, dtype=torch.float32).transpose(0, 1).unsqueeze(0)


def _shap_attribution(x) -> dict:
    """SHAP % attribution per metric for an alerting window.

    Uses shap.GradientExplainer over a synthetic healthy background; falls back
    to a gradient*input saliency if shap is unavailable or errors.
    """
    global _explainer, _background
    import numpy as np
    import torch
    try:
        import shap  # noqa: WPS433
        import torch.nn as nn

        class _Wrapped(nn.Module):
            def __init__(self, m):
                super().__init__()
                self.m = m

            def forward(self, t):
                logit, _, _ = self.m(t)
                return torch.sigmoid(logit).unsqueeze(-1)

        if _background is None:
            _background = _build_background()
        if _explainer is None:
            _explainer = shap.GradientExplainer(_Wrapped(_model), _background)
        shap_vals = _explainer.shap_values(x)
        attr = np.abs(np.array(shap_vals)).mean(axis=(0, 2)).flatten()
        total = attr.sum() + 1e-9
        return {m: float(round(100 * v / total, 1)) for m, v in zip(METRICS, attr)}
    except Exception as exc:  # noqa: BLE001
        print(f"[sentinelai] shap failed ({exc}); using gradient saliency.")

    # Gradient*input saliency fallback (still model-driven, not random).
    try:
        xg = x.clone().requires_grad_(True)
        logit, _, _ = _model(xg)
        prob = torch.sigmoid(logit)
        prob.sum().backward()
        sal = (xg.grad * xg).abs().mean(dim=2).squeeze(0).detach().numpy()
        total = sal.sum() + 1e-9
        return {m: float(round(100 * v / total, 1)) for m, v in zip(METRICS, sal)}
    except Exception:  # noqa: BLE001
        return {m: 0.0 for m in METRICS}


def predict_many(items: list[dict], with_shap: bool = True) -> list[dict]:
    """Batched health scan: run the TCN over every node's window in a SINGLE
    forward pass instead of one call per node.

    A per-node forward pass costs ~0.4s of torch/BatchNorm overhead on CPU, so
    scanning 32 nodes one-by-one takes ~13s. Stacking all windows into one
    (N, 7, 180) batch amortizes that to a fraction of a second. SHAP still runs
    only for the (few) alerting nodes.

    Input:  [{"node_id": str, "window": [[7]xL]}, ...]
    Output: same shape/keys as predict(), one dict per input item, order kept.
    """
    if _model is None:
        load_model()
    if not items:
        return []

    # Fall back to the per-item path if the real model is unavailable.
    if _model == "analytic":
        return [predict(it) for it in items]

    try:
        import numpy as np
        import torch

        mean, std = _norm
        batch = np.empty((len(items), NUM_METRICS, WINDOW_LEN), dtype=np.float32)
        for i, it in enumerate(items):
            arr = np.array(it.get("window", []), dtype=np.float32)
            if arr.ndim != 2 or arr.shape[1] != NUM_METRICS:
                arr = arr.reshape(-1, NUM_METRICS)
            if arr.shape[0] < WINDOW_LEN:
                pad = np.tile(arr[0:1], (WINDOW_LEN - arr.shape[0], 1))
                arr = np.concatenate([pad, arr], axis=0)
            else:
                arr = arr[-WINDOW_LEN:]
            batch[i] = ((arr - mean) / std).T  # (7, 180)

        xb = torch.from_numpy(batch)
        with torch.no_grad():
            logits, ttf, _ = _model(xb)
        probs = torch.sigmoid(logits).numpy().reshape(-1)
        ttfs = ttf.numpy().reshape(-1)

        out = []
        for i, it in enumerate(items):
            prob = float(probs[i])
            alert = prob > ALERT_THRESHOLD
            shap_dict = {m: 0.0 for m in METRICS}
            if alert and with_shap:
                # SHAP only for the handful of alerting nodes (keeps it cheap).
                shap_dict = _shap_attribution(xb[i : i + 1])
            out.append({
                "node_id": it.get("node_id", "unknown"),
                "failure_probability": round(prob, 4),
                "alert": bool(alert),
                "shap": shap_dict,
                "ttf_estimate": round(float(ttfs[i]), 1),
                "method": "tcn_shap",
            })
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"[sentinelai] batched inference failed ({exc}); falling back per-node.")
        return [predict(it) for it in items]


def explain(input_data: dict) -> dict:
    """SHAP % attribution for a single node window (the expensive path).

    Called only when a NEW alert is minted (or on demand from /shap/explain),
    never on every poll. Returns {metric: pct}.
    """
    if _model is None:
        load_model()
    window = input_data.get("window", [])
    if _model != "analytic":
        try:
            x = _preprocess(window)
            return _shap_attribution(x)
        except Exception as exc:  # noqa: BLE001
            print(f"[sentinelai] explain failed ({exc}); falling back to predict.")
    # Analytic fallback already returns a shap dict via predict().
    return predict(input_data).get("shap", {m: 0.0 for m in METRICS})


def predict(input_data: dict) -> dict:
    if _model is None:
        load_model()
    node_id = input_data.get("node_id", "unknown")
    window = input_data.get("window", [])

    if _model != "analytic":
        try:
            import torch
            x = _preprocess(window)
            with torch.no_grad():
                logit, ttf_pred, _ = _model(x)
            prob = float(torch.sigmoid(logit).item())
            alert = prob > ALERT_THRESHOLD
            shap_dict = {m: 0.0 for m in METRICS}
            if alert:
                shap_dict = _shap_attribution(x)
            return {
                "node_id": node_id,
                "failure_probability": round(prob, 4),
                "alert": bool(alert),
                "shap": shap_dict,
                "ttf_estimate": round(float(ttf_pred.item()), 1),
                "method": "tcn_shap",
            }
        except Exception as exc:  # noqa: BLE001
            print(f"[sentinelai] real inference failed ({exc}); falling back to analytic.")

    # ---- analytic mock fallback: logit over latest sample deviations ----
    if not window:
        return {"node_id": node_id, "failure_probability": 0.02, "alert": False,
                "shap": {m: 0.0 for m in METRICS}, "method": "analytic"}
    latest = window[-1]
    if isinstance(latest, dict):
        latest = [latest.get(m, BASELINES[m]) for m in METRICS]
    logit = -4.0
    contribs = {}
    for i, m in enumerate(METRICS):
        val = float(latest[i]) if i < len(latest) else BASELINES[m]
        dev = DIRECTION[m] * (val - BASELINES[m]) / SCALE[m]
        c = WEIGHT[m] * max(0.0, dev)
        contribs[m] = c
        logit += c
    prob = 1.0 / (1.0 + math.exp(-logit))
    alert = prob > ALERT_THRESHOLD
    total = sum(contribs.values()) + 1e-9
    shap_dict = ({m: round(100 * c / total, 1) for m, c in contribs.items()}
                 if alert else {m: 0.0 for m in METRICS})
    return {"node_id": node_id, "failure_probability": round(prob, 4),
            "alert": bool(alert), "shap": shap_dict, "method": "analytic"}
