# Safety Envelope & Shadow Test — Design Note

**Team ShadowForge · Daffodil International University**
Challenge module built on top of the NeuralSched **SmartPack** placement agent.

---

## 1. What the challenge asked for

Wrap a safety layer around the SmartPack scheduling agent so it can be trusted:

1. **Safety Envelope** — hard limits the agent may never break. Any action that
   would break a limit is **rejected**. Two required limits:
   - maximum node temperature
   - maximum job wait time
2. **Shadow Test** — run the agent *beside* the simple FIFO scheduler on the
   **same jobs**, compare completion time and failures, **without ever applying
   the agent's choice**.
3. **Blocked Log** — every rejected action, written as **one sentence** naming
   the exact limit it broke.

Constraints: simulated telemetry only, no long training, and it must be
**visible on the dashboard**.

---

## 2. Why we built it this way — the core design choice

> **SmartPack runs in shadow mode. It must prove itself before it controls real jobs.**

This is the whole idea. A brand-new RL/GNN scheduler is powerful but unproven.
Letting it place real GPU jobs on day one is a risk no cluster operator would
take. So we made the safe, honest choice:

- **FIFO is the only executor.** On *every* job — real or simulated — FIFO makes
  the placement that actually happens. No exceptions, no fallback path.
- **SmartPack is observed, never obeyed.** On every job it produces a
  *hypothetical* placement. That hypothesis is pushed through the Safety
  Envelope and recorded in the shadow scoreboard, but it is **never applied to
  the cluster**.

This turns the agent's rollout into a low-risk *audition*: we collect evidence
about how it would perform and how often it would try something unsafe, while
the real cluster keeps running on the boring, predictable baseline.

This module **extends the Phase-1 "SmartPack vs FIFO" comparison widget**: Phase 1
showed the agent's placement quality side-by-side with FIFO; this phase adds the
safety cage (hard limits + blocked log) and the honest "never applied" guarantee
on top of that same comparison.

---

## 3. How it works (data flow)

```
        job arrives (real submit  OR  auto synthetic stream)
                              │
              ┌───────────────┴───────────────┐
              ▼                                ▼
    SmartPack.predict()                   FIFO placement
   (hypothetical choice)                 (the REAL choice)
              │                                │
              ▼                                │
     Safety Envelope check                     │
   temp limit? wait limit?                      │
        │            │                          │
     allowed      BLOCKED                        │
        │            │                          │
        ▼            ▼                          ▼
  agent stats   blocked_log            FIFO stats + cluster
 (shadow only)  (one sentence)         (this actually runs)
```

- **Agent scoreboard — three numbers:** `completions`, `blocked`, `failures`.
  A **blocked** action is a *caught risk*, not a failure — the envelope stopped
  it before it could run, which is exactly what we want.
- **FIFO scoreboard — two numbers:** `completions`, `failures`. FIFO has no
  "blocked" count because FIFO is the executor, not a candidate being screened.

### The hard limits
| Limit | Default | Meaning |
|-------|---------|---------|
| `max_node_temp_c` | 82 °C | Reject placing a job on a node that would run hotter than this. |
| `max_job_wait_sec` | 120 s | Reject placing a job where the estimated queue wait exceeds this. |

Limits are **live-adjustable** from the dashboard (clamped to sane ranges:
temp 50–100 °C, wait 10–600 s). Tightening a limit immediately causes more
shadow actions to be rejected — proving the cage is real and not cosmetic.

### Honesty about data
Real submitted jobs and an **auto synthetic job stream** both feed the shadow
test. Every synthetic job is clearly flagged `simulated: true` and shown with a
"simulated" badge in the UI, so no one mistakes generated traffic for real load.

---

## 4. Where it lives in the code

| Concern | File |
|---------|------|
| Envelope, limits, shadow scoreboard, blocked log, synthetic stream | [`backend/app/modules/safety_envelope.py`](backend/app/modules/safety_envelope.py) |
| FIFO executes / SmartPack shadow wiring (`run_shadow_round`, `submit_job`) | [`backend/app/api/scheduler.py`](backend/app/api/scheduler.py) |
| API: `GET /safety/status`, `POST /safety/limits`, `POST /safety/force-block` | [`backend/app/api/routes.py`](backend/app/api/routes.py) |
| Limit defaults + synthetic stream config | [`backend/app/config.py`](backend/app/config.py) |
| Starts the synthetic stream on boot | [`backend/app/main.py`](backend/app/main.py) |
| Dashboard page (sliders, scoreboards, blocked log, force-block) | [`frontend/src/pages/Safety.tsx`](frontend/src/pages/Safety.tsx) |
| Animated "model is thinking" loader for the slow models | [`frontend/src/components/Loader.tsx`](frontend/src/components/Loader.tsx) |

---

## 5. How to verify it live (demo flow)

1. Open the **Safety** page. Note the "How this round works" steps and the
   "simulated data" badge.
2. Compare the two scoreboards — the agent has a **Blocked** count that FIFO
   does not. The agent never touched a real job.
3. Submit a real job → the response says *"Placed by FIFO (agent ran in
   shadow)"*, and the job's node equals FIFO's node, **not** the agent's.
4. Click **"Force a block"** → within seconds a new red entry appears in the
   Blocked Log with a one-sentence reason.
5. Drag the **temperature slider** down → watch the **Blocked** count climb in
   real time as more shadow placements get rejected.

A scripted end-to-end run of exactly this flow passes **16/16** functional
checks against the live API.

---

## 6. Honest limits of this build

- Telemetry is simulated (a "fake DCGM" in-memory simulator), as the challenge
  requires — no real cluster is attached.
- Completion times are estimated from a simple service-rate model, not measured
  on hardware, so the shadow comparison is directional, not a benchmark.
- Shadow state is in-memory and resets on backend restart, which is fine for a
  demo but would move to a store for production.
