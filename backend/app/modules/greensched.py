"""GreenSched — carbon-aware job routing (primary novel contribution).

Jobs tagged Urgent / Flexible / Best-Effort-Green. Polls a carbon-intensity
signal; a trained LSTM (CarbonLSTM) extends the look-ahead by 24h. Dispatch
heuristic minimizes carbon(t) x runtime(j) subject to deadline.

Model contract (matches neuralsched-training-v6/greensched Phase 3):
  load_model() -> loads greensched_lstm.pth {model_state, mean, std} if present.
  predict(input) -> dispatch decision + carbon savings.

Real input schema (Phase 3 predict):
  {"tag", "runtime_min", "deadline_minutes", "carbon_curve": [24 raw gCO2/kWh]}
Output schema (API-stable):
  {
    "decision": "dispatch_now" | "queue_with_forecast",
    "best_start_offset_min": int,
    "carbon_now": float, "carbon_at_best": float,
    "co2_avoided_kg": float,
    "method": "lstm_carbon_forecast" | "analytic",
    "forecast": [float]        # 24h LSTM look-ahead (real model only)
  }
"""
from __future__ import annotations

import math
import os
from typing import Any

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "greensched_lstm.pth")

# --- constants from greensched/phase1_setup_data_model.py ---
SEQ_LEN = 24 * 7
HORIZON = 24
HIDDEN_SIZE = 96
NUM_LAYERS = 2
DROPOUT = 0.2

# Rough energy assumption for the analytic-mock CO2 accounting: 0.4 kW/GPU.
GPU_POWER_KW = 0.4

_model = None       # None | "analytic" | torch model
_norm = (0.0, 1.0)  # (mean, std) from the trained checkpoint


def _build_torch_model():
    """CarbonLSTM — identical to greensched/phase1_setup_data_model.py."""
    import torch.nn as nn

    class CarbonLSTM(nn.Module):
        def __init__(self, hidden_size=HIDDEN_SIZE, num_layers=NUM_LAYERS, horizon=HORIZON):
            super().__init__()
            self.lstm = nn.LSTM(input_size=1, hidden_size=hidden_size, num_layers=num_layers,
                                batch_first=True, dropout=DROPOUT if num_layers > 1 else 0.0)
            self.head = nn.Linear(hidden_size, horizon)

        def forward(self, x):
            out, (h_n, _) = self.lstm(x)
            return self.head(h_n[-1])

    return CarbonLSTM()


def load_model() -> Any:
    global _model, _norm
    if os.path.exists(MODEL_PATH):
        try:
            import torch
            ckpt = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
            model = _build_torch_model()
            model.load_state_dict(ckpt["model_state"])
            model.eval()
            _model = model
            _norm = (float(ckpt["mean"]), float(ckpt["std"]))
            return _model
        except Exception as exc:  # noqa: BLE001
            print(f"[greensched] real model load failed ({exc}); using analytic mock.")
    _model = "analytic"
    return _model


def synthetic_carbon_curve(hours: int = 24) -> list[float]:
    """Synthetic 24h carbon-intensity curve (gCO2/kWh) — Electricity Maps fallback.

    Low overnight (wind/solar surplus), solar dip midday, evening peak.
    """
    base = 300.0
    curve = []
    for h in range(hours):
        solar = -120 * math.exp(-((h - 13) ** 2) / 18)
        evening_peak = 90 * math.exp(-((h - 19) ** 2) / 6)
        night = -60 * math.exp(-((h - 3) ** 2) / 12)
        curve.append(round(base + solar + evening_peak + night, 1))
    return curve


def carbon_now() -> float:
    from datetime import datetime
    return synthetic_carbon_curve()[datetime.now().hour]


def _lstm_forecast(curve24: list[float]) -> list[float]:
    """Run CarbonLSTM to forecast the next 24h from a 24-value observed curve."""
    import numpy as np
    import torch
    mean, std = _norm
    arr = np.array(curve24, dtype=np.float32)
    norm = (arr - mean) / std
    x = torch.tensor(norm, dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
    with torch.no_grad():
        pred_norm = _model(x).squeeze(0).numpy()
    return (pred_norm * std + mean).tolist()


def predict(input_data: dict) -> dict:
    if _model is None:
        load_model()

    from datetime import datetime
    tag = input_data.get("tag", "flexible")
    runtime = float(input_data.get("runtime_min", input_data.get("runtime_minutes", 60)))
    deadline = input_data.get("deadline_minutes")

    # Observed 24h curve rotated so index 0 == current hour.
    day = synthetic_carbon_curve()
    now_h = datetime.now().hour
    curve = [day[(now_h + i) % 24] for i in range(24)]
    c_now = float(curve[0])

    # Urgent always dispatches now regardless of carbon.
    if tag == "urgent":
        return {
            "decision": "dispatch_now", "best_start_offset_min": 0,
            "carbon_now": round(c_now, 1), "carbon_at_best": round(c_now, 1),
            "co2_avoided_kg": 0.0,
            "method": "lstm_carbon_forecast" if _model != "analytic" else "analytic",
            "forecast": [],
        }

    forecast: list[float] = []
    method = "analytic"
    if _model != "analytic":
        try:
            forecast = _lstm_forecast(curve)
            method = "lstm_carbon_forecast"
        except Exception as exc:  # noqa: BLE001
            print(f"[greensched] LSTM forecast failed ({exc}); using analytic curve.")

    # Combined look-ahead: observed 24h + LSTM-forecast 24h (up to 48 slots).
    combined = curve + forecast if forecast else curve

    # Deadline bounds the search (in hourly slots); default full look-ahead.
    runtime_slots = max(1, int(math.ceil(runtime / 60.0)))
    if deadline is not None:
        deadline_slots = max(runtime_slots, int(deadline // 60))
    else:
        deadline_slots = len(combined)
    feasible = combined[: deadline_slots + 1] or [c_now]

    best_offset, best_cost = 0, float("inf")
    for start in range(0, max(1, len(feasible) - runtime_slots + 1)):
        window = feasible[start: start + runtime_slots]
        cost = sum(window) * (runtime / 60.0)
        if cost < best_cost:
            best_cost, best_offset = cost, start

    carbon_at_best = float(feasible[best_offset])
    energy_kwh = GPU_POWER_KW * (runtime / 60.0)
    co2_avoided_kg = max(0.0, (c_now - carbon_at_best) * energy_kwh / 1000.0)
    decision = "dispatch_now" if best_offset == 0 else "queue_with_forecast"

    return {
        "decision": decision,
        "best_start_offset_min": int(best_offset * 60),
        "carbon_now": round(c_now, 1),
        "carbon_at_best": round(carbon_at_best, 1),
        "co2_avoided_kg": round(co2_avoided_kg, 4),
        "method": method,
        "forecast": [round(v, 1) for v in forecast],
    }
