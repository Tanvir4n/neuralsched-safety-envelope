"""CostCut — LSTM forecasts per-node utilization 60 min ahead.

A rule-augmented policy hibernates / reassigns / defers idle GPU slots.

Model contract (matches neuralsched-training-v6/costcut Phase 3 exactly):
  load_model() -> loads costcut_lstm.pth (UtilLSTM) if present, else "analytic".
  predict(input) -> forecast + recommended action + estimated waste.

Real input schema:
  {
    "node_id": str,
    "util_history": [float],         # recent utilization samples (0..1)
  }
Real output schema:
  {
    "node_id": str,
    "forecast_util": float,          # scalar 60-min-ahead forecast (0..1)
    "action": "keep" | "hibernate" | "reassign" | "defer",
    "estimated_waste_usd_per_hr": float,
    "method": "lstm_util_forecast" | "analytic"
  }
"""
from __future__ import annotations

import os
from typing import Any

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "costcut_lstm.pth")

# --- constants copied verbatim from the training notebook (Phase 1/3) ---
SEQ_LEN = 60
HIDDEN_SIZE = 48
NUM_LAYERS = 1
THRESHOLD_HIBERNATE = 0.15
THRESHOLD_REASSIGN = 0.35
THRESHOLD_DEFER = 0.55
GPU_COST_USD_PER_HR = 1.5

_model = None  # None (unloaded) | "analytic" (mock) | torch model


def _build_torch_model():
    """UtilLSTM — identical architecture to costcut/phase1_setup_data_model.py."""
    import torch.nn as nn

    class UtilLSTM(nn.Module):
        def __init__(self, hidden_size=HIDDEN_SIZE, num_layers=NUM_LAYERS):
            super().__init__()
            self.lstm = nn.LSTM(input_size=1, hidden_size=hidden_size,
                                num_layers=num_layers, batch_first=True)
            self.head = nn.Linear(hidden_size, 1)

        def forward(self, x):
            out, (h_n, _) = self.lstm(x)
            return self.head(h_n[-1]).squeeze(-1)

    return UtilLSTM()


def load_model() -> Any:
    global _model
    if os.path.exists(MODEL_PATH):
        try:
            import torch
            ckpt = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
            model = _build_torch_model()
            model.load_state_dict(ckpt["model_state"])
            model.eval()
            _model = model
            return _model
        except Exception as exc:  # noqa: BLE001
            print(f"[costcut] real model load failed ({exc}); using analytic mock.")
    _model = "analytic"
    return _model


def _action_for(forecast_util: float) -> str:
    if forecast_util < THRESHOLD_HIBERNATE:
        return "hibernate"
    if forecast_util < THRESHOLD_REASSIGN:
        return "reassign"
    if forecast_util < THRESHOLD_DEFER:
        return "defer"
    return "keep"


def _accepts_util_history(input_data: dict) -> list[float]:
    # Backend historically used "recent_util"; the trained contract uses
    # "util_history". Accept either so callers don't have to change.
    hist = input_data.get("util_history")
    if hist is None:
        hist = input_data.get("recent_util", [])
    return [float(v) for v in hist]


def predict(input_data: dict) -> dict:
    if _model is None:
        load_model()

    node_id = input_data.get("node_id", "unknown")
    hist = _accepts_util_history(input_data)

    if _model != "analytic":
        # Real UtilLSTM path — mirrors costcut/phase3 predict() exactly.
        try:
            import numpy as np
            import torch
            arr = np.array(hist, dtype=np.float32)
            if len(arr) < SEQ_LEN:
                pad_val = arr[0] if len(arr) else 0.5
                arr = np.concatenate([np.full(SEQ_LEN - len(arr), pad_val), arr])
            else:
                arr = arr[-SEQ_LEN:]
            x = torch.tensor(arr, dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
            with torch.no_grad():
                forecast_util = float(np.clip(_model(x).item(), 0.0, 1.0))
            action = _action_for(forecast_util)
            waste = (round((1.0 - forecast_util) * GPU_COST_USD_PER_HR, 4)
                     if action in ("hibernate", "reassign") else 0.0)
            return {
                "node_id": node_id,
                "forecast_util": round(forecast_util, 4),
                "action": action,
                "estimated_waste_usd_per_hr": waste,
                "method": "lstm_util_forecast",
            }
        except Exception as exc:  # noqa: BLE001
            print(f"[costcut] real inference failed ({exc}); falling back to analytic.")

    # ---- analytic mock fallback (exponential smoothing) ----
    if not hist:
        hist = [0.5]
    alpha = 0.5
    level = hist[0]
    for v in hist[1:]:
        level = alpha * v + (1 - alpha) * level
    trend = (hist[-1] - hist[0]) / max(len(hist), 1)
    forecast_util = max(0.0, min(1.0, level + trend * 0.5 + (0.5 - level) * 0.1))
    action = _action_for(forecast_util)
    waste = (round((1.0 - forecast_util) * GPU_COST_USD_PER_HR, 4)
             if action in ("hibernate", "reassign") else 0.0)
    return {
        "node_id": node_id,
        "forecast_util": round(forecast_util, 4),
        "action": action,
        "estimated_waste_usd_per_hr": waste,
        "method": "analytic",
    }
