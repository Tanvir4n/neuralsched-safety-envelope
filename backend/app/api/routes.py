"""FastAPI routers matching the concept-book API surface exactly.

  POST /jobs/submit        POST /jobs/defer
  GET  /cluster/status     GET  /health/predictions
  GET  /carbon/intensity   GET  /cost/analytics
  GET  /shap/explain       WS   /stream/telemetry
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import scheduler
from app.auth.auth import get_current_user
from app.database import get_db
from app.models.db_models import Alert, Job, JobStatus, JobTag, User
from app.modules import greensched
from app.telemetry.simulator import simulator

router = APIRouter()


# ------------------------- Jobs -------------------------
class JobSubmitRequest(BaseModel):
    name: str
    tag: JobTag
    gpu_requirement: int = 1
    deadline_minutes: int | None = None


@router.post("/jobs/submit", tags=["jobs"])
def submit_job(
    req: JobSubmitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = Job(
        name=req.name,
        tag=req.tag,
        gpu_requirement=req.gpu_requirement,
        deadline_minutes=req.deadline_minutes,
        owner_id=user.id,
        status=JobStatus.queued,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return scheduler.submit_job(db, job)


class DeferRequest(BaseModel):
    job_id: int
    defer_minutes: int = 60


@router.post("/jobs/defer", tags=["jobs"])
def defer_job(
    req: DeferRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = db.query(Job).filter(Job.id == req.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.assigned_node:
        node = simulator.nodes.get(job.assigned_node)
        if node and node.active_jobs > 0:
            node.active_jobs -= 1
    job.status = JobStatus.deferred
    job.assigned_node = None
    db.commit()
    db.refresh(job)
    return {"job": scheduler._job_dict(job), "message": f"Deferred {req.defer_minutes} min."}


@router.get("/jobs", tags=["jobs"])
def list_jobs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(100).all()
    return {"jobs": [scheduler._job_dict(j) for j in jobs]}


# ------------------------- Cluster -------------------------
@router.get("/cluster/status", tags=["cluster"])
def cluster_status(user: User = Depends(get_current_user)):
    snap = simulator.snapshot()
    total = len(snap["nodes"])
    avg_util = sum(n["gpu_util"] for n in snap["nodes"]) / total if total else 0
    faulting = sum(1 for n in snap["nodes"] if n["faulting"])
    return {
        **snap,
        "summary": {
            "total_nodes": total,
            "avg_util": round(avg_util, 3),
            "faulting_nodes": faulting,
        },
        "comparison": scheduler.comparison_state,
    }


# ------------------------- Health / SentinelAI -------------------------
@router.get("/health/predictions", tags=["health"])
def health_predictions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    results = scheduler.run_health_scan(db)
    alerts = (
        db.query(Alert).filter(Alert.resolved == 0).order_by(Alert.created_at.desc()).all()
    )
    return {
        "predictions": results,
        "alerts": [
            {
                "id": a.id,
                "job_id": a.job_id,
                "node_id": a.node_id,
                "failure_probability": a.failure_probability,
                "shap": json.loads(a.shap_values) if a.shap_values else {},
            }
            for a in alerts
        ],
        "auto_migrate": scheduler.migration_state["auto"],
        "migrations": scheduler.migration_state["migrations"],
        "simulated": True,
    }


class AutoMigrateBody(BaseModel):
    enabled: bool


@router.post("/migrate/auto", tags=["health"])
def toggle_auto_migrate(body: AutoMigrateBody, user: User = Depends(get_current_user)):
    """Turn the SentinelAI auto checkpoint+migrate loop on or off."""
    return scheduler.set_auto_migrate(body.enabled)


@router.post("/migrate/{alert_id}", tags=["health"])
def migrate_alert(alert_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Manually checkpoint + migrate the job for a specific open alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    result = scheduler.migrate_job(db, alert, mode="manual")
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["reason"])
    return result


@router.get("/shap/explain", tags=["health"])
def shap_explain(node_id: str, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    from app.modules import sentinelai
    window = simulator.get_window_matrix(node_id)
    if not window:
        raise HTTPException(status_code=404, detail="No telemetry for node")
    pred = sentinelai.predict_many(
        [{"node_id": node_id, "window": window}], with_shap=False
    )[0]
    # SHAP is expensive (~2s). Reuse the value cached on an open alert row when
    # one exists; only recompute when the node is genuinely alerting and unseen.
    open_alert = (
        db.query(Alert)
        .filter(Alert.node_id == node_id, Alert.resolved == 0)
        .order_by(Alert.created_at.desc())
        .first()
    )
    if open_alert and open_alert.shap_values:
        shap = json.loads(open_alert.shap_values)
    elif pred["alert"]:
        shap = sentinelai.explain({"node_id": node_id, "window": window})
    else:
        shap = pred["shap"]
    # Sort SHAP contributions by absolute impact for the chart.
    ranked = sorted(shap.items(), key=lambda kv: abs(kv[1]), reverse=True)
    return {
        "node_id": node_id,
        "failure_probability": pred["failure_probability"],
        "alert": pred["alert"],
        "shap_ranked": [{"metric": m, "contribution": c} for m, c in ranked],
        "method": pred["method"],
    }


# ------------------------- Carbon / GreenSched -------------------------
@router.get("/carbon/intensity", tags=["carbon"])
def carbon_intensity(user: User = Depends(get_current_user)):
    from datetime import datetime
    curve = greensched.synthetic_carbon_curve()
    now_h = datetime.now().hour
    # Total CO2 avoided across all green-routed jobs (from carbon costs).
    return {
        "curve": [{"hour": h, "gco2_kwh": v} for h, v in enumerate(curve)],
        "current_hour": now_h,
        "current_intensity": curve[now_h],
        "min_intensity": min(curve),
        "max_intensity": max(curve),
        "source": "synthetic_fallback",
        "simulated": True,
    }


# ------------------------- Cost / CostCut -------------------------
@router.get("/cost/analytics", tags=["cost"])
def cost_analytics(user: User = Depends(get_current_user)):
    results = scheduler.run_cost_scan()
    total_waste = sum(r["estimated_waste_usd_per_hr"] for r in results)
    actionable = [r for r in results if r["action"] != "keep"]
    return {
        "nodes": results,
        "total_waste_usd_per_hr": round(total_waste, 2),
        "total_waste_usd_per_month": round(total_waste * 24 * 30, 2),
        "actionable_nodes": len(actionable),
        "simulated": True,
    }


# ------------------------- Safety Envelope + Shadow Test -------------------------
@router.get("/safety/status", tags=["safety"])
def safety_status(user: User = Depends(get_current_user)):
    """Live envelope limits, shadow comparison (agent vs FIFO), and blocked log."""
    from app.modules import safety_envelope
    return safety_envelope.status()


class SafetyLimitsRequest(BaseModel):
    max_node_temp_c: float | None = None
    max_job_wait_sec: float | None = None


@router.post("/safety/limits", tags=["safety"])
def safety_set_limits(req: SafetyLimitsRequest,
                      user: User = Depends(get_current_user)):
    """Live-adjust the hard limits so tightening one blocks actions in real time."""
    from app.modules import safety_envelope
    return safety_envelope.set_limits(req.max_node_temp_c, req.max_job_wait_sec)


@router.post("/safety/force-block", tags=["safety"])
def safety_force_block(user: User = Depends(get_current_user)):
    """Demo trigger: force the next shadow action to breach the envelope so a
    block is provably shown live (Section 5 deliverable)."""
    from app.modules import safety_envelope
    safety_envelope.force_block_next()
    return {"ok": True, "message": "Next shadow placement will be blocked by the envelope."}


# ------------------------- Telemetry WebSocket -------------------------
@router.websocket("/stream/telemetry")
async def stream_telemetry(ws: WebSocket):
    await ws.accept()
    q = simulator.subscribe()
    try:
        # Push an immediate snapshot so the UI is never blank.
        await ws.send_json(simulator.snapshot())
        while True:
            snap = await q.get()
            await ws.send_json(snap)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        simulator.unsubscribe(q)
