"""Scheduler service — orchestrates the job lifecycle across all 4 modules.

Enforces the concept-book flow with no loopholes:
  Urgent            -> SmartPack direct placement
  Flexible / Green  -> GreenSched evaluation -> dispatch now OR queue-with-forecast
                       -> then SmartPack placement

Also runs the Cluster Orchestrator mock (accepts placements) and keeps a
FIFO baseline in parallel for the "SmartPack vs FIFO" comparison widget.
"""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import Job, JobStatus, JobTag, Alert
from app.modules import smartpack, greensched, sentinelai, costcut, safety_envelope
from app.telemetry.simulator import simulator

# In-memory comparison metrics (SmartPack vs naive FIFO).
comparison_state = {
    "smartpack": {"placed": 0, "avg_score": 0.0, "avg_util": 0.0},
    "fifo": {"placed": 0, "avg_score": 0.0, "avg_util": 0.0},
}

# Migration policy + audit log for the SentinelAI checkpoint+migrate loop.
migration_state = {
    "auto": False,          # operator toggles auto-migrate on/off
    "migrations": [],       # recent migration events (most recent first)
}


def set_auto_migrate(enabled: bool) -> dict:
    migration_state["auto"] = bool(enabled)
    return {"auto": migration_state["auto"]}


def _healthiest_node(exclude: str) -> dict | None:
    """Pick a safe destination: lowest failure risk, then lowest load."""
    snap = simulator.snapshot()
    candidates = [n for n in snap["nodes"] if n["node_id"] != exclude and not n["faulting"]]
    if not candidates:
        return None
    nodes = [
        {"id": n["node_id"], "gpu_util": n["gpu_util"], "queue_len": n["active_jobs"],
         "active_jobs": n["active_jobs"], "neighbors": n["nvlink_peers"]}
        for n in candidates
    ]
    return smartpack.predict({"job": {"gpu_requirement": 1, "tag": "urgent"}, "nodes": nodes})


def migrate_job(db: Session, alert: Alert, mode: str = "manual") -> dict:
    """Checkpoint + migrate the job off a failing node.

    detect (alert) -> SmartPack re-place on healthiest node -> move job ->
    heal the old node -> load the new node -> log the migration event.
    """
    from_node = alert.node_id
    placement = _healthiest_node(exclude=from_node)
    if not placement:
        return {"ok": False, "reason": "no healthy destination node available"}
    to_node = placement["assigned_node"]

    job = db.query(Job).filter(Job.id == alert.job_id).first() if alert.job_id else None
    if job:
        job.assigned_node = to_node
        job.placement_score = placement.get("placement_score")

    # Cluster-orchestrator mock actuation: relieve the failing node, load target.
    simulator.heal_node(from_node)
    simulator.add_load(to_node, 0.15)

    alert.resolved = 1
    alert.migrated = 1 if mode == "auto" else 2
    alert.migrated_to = to_node
    alert.migrated_at = datetime.utcnow()
    db.commit()

    event = {
        "alert_id": alert.id,
        "job_id": alert.job_id,
        "job_name": job.name if job else None,
        "from_node": from_node,
        "to_node": to_node,
        "failure_probability": alert.failure_probability,
        "mode": mode,
        "placement_score": placement.get("placement_score"),
        "ts": alert.migrated_at.isoformat(),
    }
    migration_state["migrations"].insert(0, event)
    del migration_state["migrations"][20:]
    return {"ok": True, "migration": event}



def _fifo_place() -> dict:
    """Naive baseline: first node in list order, ignores load/topology."""
    snap = simulator.snapshot()
    nodes = snap["nodes"]
    if not nodes:
        return {"assigned_node": "gpu-node-0", "placement_score": 0.0}
    first = nodes[0]
    # FIFO score reflects that it ignores interference => usually worse.
    score = round(0.4 * (1 - first["gpu_util"]) - 0.2 * first["gpu_util"], 4)
    return {"assigned_node": first["node_id"], "placement_score": score}


def _update_comparison(smart: dict, fifo: dict):
    snap = {n["node_id"]: n for n in simulator.snapshot()["nodes"]}

    s = comparison_state["smartpack"]
    s["placed"] += 1
    s["avg_score"] = round(
        (s["avg_score"] * (s["placed"] - 1) + smart["placement_score"]) / s["placed"], 4
    )
    smart_node = snap.get(smart["assigned_node"], {})
    s["avg_util"] = round(
        (s["avg_util"] * (s["placed"] - 1) + smart_node.get("gpu_util", 0.5)) / s["placed"], 4
    )

    f = comparison_state["fifo"]
    f["placed"] += 1
    f["avg_score"] = round(
        (f["avg_score"] * (f["placed"] - 1) + fifo["placement_score"]) / f["placed"], 4
    )
    fifo_node = snap.get(fifo["assigned_node"], {})
    f["avg_util"] = round(
        (f["avg_util"] * (f["placed"] - 1) + fifo_node.get("gpu_util", 0.5)) / f["placed"], 4
    )


def _nodes_for_smartpack(snap: dict) -> list[dict]:
    """SmartPack real schema: id/gpu_util/queue_len/active_jobs/neighbors."""
    return [
        {
            "id": n["node_id"],
            "gpu_util": n["gpu_util"],
            "queue_len": n["active_jobs"],
            "active_jobs": n["active_jobs"],
            "neighbors": n["nvlink_peers"],
        }
        for n in snap["nodes"]
    ]


def run_shadow_round(job_name: str, gpu_requirement: int, tag: str,
                     simulated: bool) -> dict:
    """One Safety-Envelope + Shadow-Test round for a single job.

    SmartPack produces a HYPOTHETICAL placement (shadow only) which the envelope
    validates; FIFO produces the placement that would really run. Nothing here
    mutates the cluster. Returns the envelope evaluation for this job.
    """
    snap = simulator.snapshot()
    nodes = _nodes_for_smartpack(snap)
    agent_choice = smartpack.predict({
        "job": {"gpu_requirement": gpu_requirement, "tag": tag},
        "nodes": nodes,
    })
    fifo_choice = _fifo_place()
    evaluation = safety_envelope.evaluate(job_name, agent_choice, fifo_choice, snap,
                                          simulated=simulated)
    return {"evaluation": evaluation, "agent": agent_choice, "fifo": fifo_choice}


def submit_job(db: Session, job: Job) -> dict:
    """Resolve a job to exactly one path and persist the outcome.

    SAFETY-ENVELOPE ROUND RULE: the simple FIFO scheduler is the ONLY thing that
    actually places a real job. SmartPack runs in shadow mode on the same job to
    produce a hypothetical decision (checked by the envelope, scored by the
    shadow test), but that decision is NEVER applied to the cluster. This is the
    sheet's "prove itself before it controls real jobs" requirement.
    """
    green_result = None
    if job.tag == JobTag.urgent:
        decision = "dispatch_now"
    else:
        green_result = greensched.predict({
            "tag": job.tag.value,
            "runtime_min": 60,
            "deadline_minutes": job.deadline_minutes,
        })
        decision = green_result["decision"]
        job.carbon_cost = green_result["carbon_at_best"]

    if decision == "queue_with_forecast":
        job.status = JobStatus.queued
        db.commit()
        db.refresh(job)
        return {
            "job": _job_dict(job),
            "path": "greensched_queue",
            "green": green_result,
            "message": "Queued for a lower-carbon window.",
        }

    # Shadow round: SmartPack (hypothetical) + FIFO (real) + envelope check.
    round_result = run_shadow_round(
        job_name=job.name, gpu_requirement=job.gpu_requirement,
        tag=job.tag.value, simulated=False,
    )
    smart = round_result["agent"]   # shadow only, NOT applied
    fifo = round_result["fifo"]     # the real placement
    _update_comparison(smart, fifo)

    # FIFO is the real executor: the orchestrator applies the FIFO placement.
    job.assigned_node = fifo["assigned_node"]
    job.placement_score = fifo["placement_score"]
    job.status = JobStatus.running
    node = simulator.nodes.get(fifo["assigned_node"])
    if node:
        node.active_jobs += 1
    db.commit()
    db.refresh(job)

    return {
        "job": _job_dict(job),
        "path": "urgent_direct" if job.tag == JobTag.urgent else "greensched_dispatch",
        "green": green_result,
        "smartpack": smart,          # shadow agent's hypothetical choice
        "fifo": fifo,                # what actually ran
        "safety": round_result["evaluation"],
        "message": f"Placed on {fifo['assigned_node']} by FIFO (agent ran in shadow).",
    }


def run_health_scan(db: Session) -> list[dict]:
    """Run SentinelAI over every node's window; persist alerts."""
    # Batched inference: one TCN forward pass for the whole cluster instead of
    # one call per node. SHAP is skipped here (it costs ~2s/node and is only
    # needed when we mint a NEW alert row); it is computed on demand below.
    items = [
        {"node_id": node_id, "window": simulator.get_window_matrix(node_id)}
        for node_id in simulator.nodes
    ]
    results = sentinelai.predict_many(items, with_shap=False)
    windows = {it["node_id"]: it["window"] for it in items}
    for pred in results:
        if pred["alert"]:
            node_id = pred["node_id"]
            # Trace back to a job on that node, if any.
            job = (
                db.query(Job)
                .filter(Job.assigned_node == node_id, Job.status == JobStatus.running)
                .first()
            )
            existing = (
                db.query(Alert)
                .filter(Alert.node_id == node_id, Alert.resolved == 0)
                .first()
            )
            if not existing:
                # New alert: compute SHAP once (expensive) so the row is
                # explainable, then persist it.
                shap = sentinelai.explain(
                    {"node_id": node_id, "window": windows[node_id]}
                )
                alert = Alert(
                    job_id=job.id if job else None,
                    node_id=node_id,
                    failure_probability=pred["failure_probability"],
                    shap_values=json.dumps(shap),
                )
                db.add(alert)
                db.commit()
                db.refresh(alert)
                # Auto-migrate loop: if the operator enabled auto mode, act now.
                if migration_state["auto"]:
                    migrate_job(db, alert, mode="auto")
    db.commit()
    return results


def run_cost_scan() -> list[dict]:
    results = []
    for node_id in simulator.nodes:
        history = simulator.get_util_history(node_id)
        pred = costcut.predict({"node_id": node_id, "util_history": history})
        # Attach the recent observed utilization so the UI can plot the
        # history leading into the single-step LSTM forecast point.
        pred["recent_util"] = [round(u, 4) for u in history[-30:]]
        results.append(pred)
    return results


def _job_dict(job: Job) -> dict:
    return {
        "id": job.id,
        "name": job.name,
        "tag": job.tag.value,
        "status": job.status.value,
        "gpu_requirement": job.gpu_requirement,
        "deadline_minutes": job.deadline_minutes,
        "assigned_node": job.assigned_node,
        "placement_score": job.placement_score,
        "carbon_cost": job.carbon_cost,
    }
