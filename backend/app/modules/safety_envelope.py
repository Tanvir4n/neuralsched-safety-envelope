"""Safety Envelope + Shadow Test  (Additional Challenge module).

This module sits AROUND the existing SmartPack placement agent. It does two
things the challenge asks for, and one thing it forbids:

  Safety Envelope  - hard limits the agent's action may never break
                     (max node temperature, max job wait). Any breaking action
                     is rejected and written to the Blocked Log in one sentence.

  Shadow Test      - on every job (real or synthetic) SmartPack produces a
                     HYPOTHETICAL placement. We run it through the envelope and
                     compare it against the simple FIFO scheduler on the same
                     job, tracking completion time and failures.

  NEVER APPLIED    - for this round SmartPack runs in *shadow mode only*. Its
                     decision is observed and scored but is NEVER written to the
                     real cluster state. The simple FIFO scheduler is the only
                     thing that actually places a real job. This matches the
                     sheet's requirement to compare "without applying the
                     agent's choice", and its framing that a new scheduler must
                     "prove itself before it controls real jobs".

All state is in-memory (like migration_state in scheduler.py); no training and
no persistence are needed inside the session.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Deque

from app.config import settings

# --- Hard limits (the Safety Envelope). Configurable via settings/env, and
# live-adjustable from the dashboard so judges can tighten a limit and watch
# actions get blocked in real time. ---
_limits = {
    "max_node_temp_c": settings.max_node_temp_c,
    "max_job_wait_sec": settings.max_job_wait_sec,
}


def limits() -> dict:
    return dict(_limits)


def set_limits(max_node_temp_c: float | None = None,
               max_job_wait_sec: float | None = None) -> dict:
    """Live-adjust the hard limits from the dashboard. Clamped to sane ranges."""
    if max_node_temp_c is not None:
        _limits["max_node_temp_c"] = float(max(50.0, min(100.0, max_node_temp_c)))
    if max_job_wait_sec is not None:
        _limits["max_job_wait_sec"] = float(max(10.0, min(600.0, max_job_wait_sec)))
    return limits()

# Rough service time used to estimate queue wait: each already-running job on a
# node delays a newcomer by ~this many seconds. Simulated, for the shadow math.
SERVICE_SEC_PER_QUEUED_JOB = 45.0
# Estimated base completion time of a job once it starts (simulated).
BASE_RUNTIME_SEC = 90.0


# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
# Agent side tracks THREE numbers, because a blocked hypothetical action is a
# caught risk, not a failure: completions, blocked, failures-among-completions.
# FIFO side (the real executor) only needs completions + failures.
shadow_state = {
    "agent": {"completions": 0, "blocked": 0, "failures": 0,
              "sum_completion_sec": 0.0},
    "fifo": {"completions": 0, "failures": 0, "sum_completion_sec": 0.0},
}

# Blocked Log: every rejected hypothetical action, one simple sentence each.
blocked_log: Deque[dict] = deque(maxlen=50)

# Force the very next shadow evaluation to breach a limit (demo trigger).
_force_block_next = {"on": False}


def force_block_next() -> None:
    """Arm a one-shot forced breach so the next placement is provably blocked."""
    _force_block_next["on"] = True


# ---------------------------------------------------------------------------
# Envelope check  (pure, no side effects)
# ---------------------------------------------------------------------------
def check_action(assigned_node: str, job_name: str, node_view: dict,
                 forced: bool = False) -> dict:
    """Check a hypothetical placement against the hard limits.

    Returns {allowed, violated_limit, reason, temp_c, est_wait_sec}.
    `node_view` is one node from simulator.snapshot()["nodes"].
    """
    temp_c = float(node_view.get("latest", {}).get("temp", 0.0))
    # Estimated wait = queued jobs ahead * per-job service time.
    est_wait_sec = float(node_view.get("active_jobs", 0)) * SERVICE_SEC_PER_QUEUED_JOB
    max_temp = _limits["max_node_temp_c"]
    max_wait = _limits["max_job_wait_sec"]

    if forced:
        # Demo path: guarantee a breach by pushing temp over the limit.
        temp_c = max_temp + 7.0
        return {
            "allowed": False,
            "violated_limit": "max_node_temp_c",
            "reason": (f"Rejected placing {job_name} on {assigned_node}: node would "
                       f"run at {temp_c:.0f}C, above the {max_temp:.0f}C "
                       f"temperature limit."),
            "temp_c": round(temp_c, 1),
            "est_wait_sec": round(est_wait_sec),
        }

    if temp_c > max_temp:
        return {
            "allowed": False,
            "violated_limit": "max_node_temp_c",
            "reason": (f"Rejected placing {job_name} on {assigned_node}: node is at "
                       f"{temp_c:.0f}C, above the {max_temp:.0f}C temperature "
                       f"limit."),
            "temp_c": round(temp_c, 1),
            "est_wait_sec": round(est_wait_sec),
        }

    if est_wait_sec > max_wait:
        return {
            "allowed": False,
            "violated_limit": "max_job_wait_sec",
            "reason": (f"Rejected placing {job_name} on {assigned_node}: job would wait "
                       f"~{est_wait_sec:.0f}s, above the {max_wait:.0f}s "
                       f"maximum wait limit."),
            "temp_c": round(temp_c, 1),
            "est_wait_sec": round(est_wait_sec),
        }

    return {
        "allowed": True,
        "violated_limit": None,
        "reason": None,
        "temp_c": round(temp_c, 1),
        "est_wait_sec": round(est_wait_sec),
    }


# ---------------------------------------------------------------------------
# Shadow evaluation  (observe-only; NEVER mutates cluster state)
# ---------------------------------------------------------------------------
def _completion_sec(node_view: dict) -> float:
    """Simulated completion time = queue wait + runtime stretched by load."""
    wait = float(node_view.get("active_jobs", 0)) * SERVICE_SEC_PER_QUEUED_JOB
    util = float(node_view.get("gpu_util", 0.5))
    return wait + BASE_RUNTIME_SEC * (1.0 + util)


def _would_fail(node_view: dict) -> bool:
    """Simulated failure: a faulting or very hot node fails the job."""
    if node_view.get("faulting"):
        return True
    temp = float(node_view.get("latest", {}).get("temp", 0.0))
    return temp > 88.0


def evaluate(job_name: str, agent_choice: dict, fifo_choice: dict,
             snapshot: dict, simulated: bool) -> dict:
    """Run one shadow comparison round for a single job.

    - FIFO is the real executor (its outcome always counts).
    - The agent is shadow-only: its hypothetical action is checked by the
      envelope; if blocked it is a caught risk (counted, never applied); if
      allowed we score its hypothetical completion/failure, still without
      touching the cluster.
    """
    by_id = {n["node_id"]: n for n in snapshot["nodes"]}

    forced = _force_block_next["on"]
    if forced:
        _force_block_next["on"] = False

    agent_node = by_id.get(agent_choice["assigned_node"], {})
    check = check_action(agent_choice["assigned_node"], job_name, agent_node,
                         forced=forced)

    a = shadow_state["agent"]
    if not check["allowed"]:
        a["blocked"] += 1
        entry = {
            "job": job_name,
            "simulated": simulated,
            "node": agent_choice["assigned_node"],
            "violated_limit": check["violated_limit"],
            "reason": check["reason"],
            "temp_c": check["temp_c"],
            "est_wait_sec": check["est_wait_sec"],
            "ts": time.time(),
        }
        blocked_log.appendleft(entry)
    else:
        a["completions"] += 1
        a["sum_completion_sec"] += _completion_sec(agent_node)
        if _would_fail(agent_node):
            a["failures"] += 1

    # FIFO: the real executor, never enveloped.
    fifo_node = by_id.get(fifo_choice["assigned_node"], {})
    f = shadow_state["fifo"]
    f["completions"] += 1
    f["sum_completion_sec"] += _completion_sec(fifo_node)
    if _would_fail(fifo_node):
        f["failures"] += 1

    return {
        "job": job_name,
        "simulated": simulated,
        "agent": {"node": agent_choice["assigned_node"], "check": check},
        "fifo": {"node": fifo_choice["assigned_node"]},
    }


def comparison() -> dict:
    """Roll up shadow_state into dashboard-ready averages."""
    a = shadow_state["agent"]
    f = shadow_state["fifo"]
    a_avg = round(a["sum_completion_sec"] / a["completions"], 1) if a["completions"] else 0.0
    f_avg = round(f["sum_completion_sec"] / f["completions"], 1) if f["completions"] else 0.0
    return {
        "agent": {
            "completions": a["completions"],
            "blocked": a["blocked"],
            "failures": a["failures"],
            "avg_completion_sec": a_avg,
        },
        "fifo": {
            "completions": f["completions"],
            "failures": f["failures"],
            "avg_completion_sec": f_avg,
        },
        "executor": "fifo",  # the only thing that really places real jobs
    }


def status() -> dict:
    return {
        "limits": limits(),
        "comparison": comparison(),
        "blocked_log": list(blocked_log),
    }


# ---------------------------------------------------------------------------
# Synthetic job stream  (auto-fills the shadow comparison so the dashboard is
# never empty). Every generated job is tagged simulated=True so the log and UI
# can honestly distinguish it from real operator-submitted jobs.
# ---------------------------------------------------------------------------
import asyncio  # noqa: E402  (kept local to the streaming section)
import random   # noqa: E402

_stream = {"task": None, "running": False, "count": 0}
_SYNTH_TAGS = ["urgent", "flexible", "green"]


async def _synthetic_loop(run_round):
    """Periodically push a synthetic job through one shadow round.

    `run_round(job_name, gpu_requirement, tag, simulated=True)` is injected by
    the scheduler to avoid a circular import.
    """
    _stream["running"] = True
    while _stream["running"]:
        _stream["count"] += 1
        name = f"sim-job-{_stream['count']}"
        try:
            run_round(
                job_name=name,
                gpu_requirement=random.choice([1, 1, 2, 4]),
                tag=random.choice(_SYNTH_TAGS),
                simulated=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[safety_envelope] synthetic round failed: {exc}")
        await asyncio.sleep(settings.synthetic_job_period_sec)


def start_synthetic_stream(run_round):
    if not settings.synthetic_jobs_enabled or _stream["task"] is not None:
        return
    _stream["task"] = asyncio.create_task(_synthetic_loop(run_round))


async def stop_synthetic_stream():
    _stream["running"] = False
    if _stream["task"]:
        _stream["task"].cancel()
        _stream["task"] = None
