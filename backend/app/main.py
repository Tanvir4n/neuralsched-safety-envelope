"""NeuralSched FastAPI application entrypoint."""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.auth.router import router as auth_router
from app.config import settings
from app.database import init_db
from app.modules import smartpack, greensched, sentinelai, costcut
from app.telemetry.simulator import simulator


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB may not be ready instantly in docker-compose; retry a few times.
    for attempt in range(10):
        try:
            init_db()
            break
        except Exception as exc:  # noqa: BLE001
            if attempt == 9:
                print(f"[startup] DB init failed after retries: {exc}")
            time.sleep(2)

    # Load all models (mock or real depending on presence of .pth files).
    for mod in (smartpack, greensched, sentinelai, costcut):
        mod.load_model()

    simulator.start()

    # Safety Envelope + Shadow Test: start the auto synthetic job stream so the
    # shadow comparison and blocked log fill in live (real submitted jobs feed
    # it too). run_shadow_round is injected to avoid a circular import.
    from app.api import scheduler
    from app.modules import safety_envelope
    safety_envelope.start_synthetic_stream(scheduler.run_shadow_round)

    yield
    await safety_envelope.stop_synthetic_stream()
    await simulator.stop()


app = FastAPI(
    title="NeuralSched API",
    version="1.0.0",
    description="GPU-cluster-intelligence middleware — SmartPack, GreenSched, SentinelAI, CostCut.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(api_router)


@app.get("/")
def root():
    return {
        "app": settings.app_name,
        "status": "online",
        "modules": ["SmartPack", "GreenSched", "SentinelAI", "CostCut"],
        "models": {
            "smartpack": "gnn_ppo" if smartpack._model not in (None, "rule_based") else "mock(rule_based)",
            "greensched": "lstm" if greensched._model not in (None, "analytic") else "mock(analytic)",
            "sentinelai": "tcn" if sentinelai._model not in (None, "analytic") else "mock(analytic)",
            "costcut": "lstm" if costcut._model not in (None, "analytic") else "mock(analytic)",
        },
    }


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/dev/inject-fault")
def inject_fault(node_id: str):
    """Demo helper: force a degrading fault on a node for SentinelAI."""
    ok = simulator.inject_fault(node_id)
    return {"ok": ok, "node_id": node_id}
