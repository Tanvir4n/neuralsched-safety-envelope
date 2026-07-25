# NeuralSched

**GPU-Cluster-Intelligence Middleware** — a middleware layer that sits above
Kubernetes/SLURM and makes GPU-cluster scheduling *topology-aware, carbon-aware,
failure-aware, and cost-aware* using four ML modules.

> Built for the ShadowForge hackathon. This repo is Phase 1 (fully working
> locally with realistic mock models) and is wired so that Phase 2 (dropping in
> trained `.pth` weights) and Phase 3 (free-tier deployment) are drop-in steps,
> not rewrites.

---

## 1. What each module does (plain language)

| Module | Layer | Job | Model (Phase 2) | Mock (Phase 1) |
|--------|-------|-----|-----------------|----------------|
| **SmartPack** | Scheduling Intelligence | Places a job on the *best* GPU node using a topology-aware score | GNN + PPO deep-RL agent | Rule-based reward scoring |
| **GreenSched** | Scheduling Intelligence | Routes flexible jobs to the *greenest* time window | LSTM 24h carbon forecaster | Synthetic 24h carbon curve |
| **SentinelAI** | Predictive Operations | Predicts GPU failure from telemetry, explains *why* | TCN over sliding windows | Sigmoid-logit risk model |
| **CostCut** | Predictive Operations | Forecasts idle GPUs and reclaims them | LSTM 60-min utilization forecast | Exponential smoothing |

### SmartPack — topology-aware placement
Scores every candidate node with the concept-book reward:

```
R = α·U_GPU + β·(1/L_queue) − γ·C_interference − δ·C_migration
    α=0.4      β=0.3          γ=0.2             δ=0.1
```

Returns `{assigned_node, placement_score, method}`. **Urgent** jobs go straight
here. The 3D topology graph on the dashboard *is* the GNN's graph representation.

### GreenSched — carbon-aware routing *(primary novel contribution)*
Polls a carbon-intensity signal (Electricity Maps in Phase 3, synthetic 24h
fallback always). An LSTM extends look-ahead to 24h. The dispatch heuristic
minimizes `carbon(t) × runtime(j)` subject to the job deadline. Emits
`co2_avoided_kg` which drives the live "kg CO₂ avoided" counter.

- **Urgent** → always `dispatch_now`.
- **Flexible / Best-Effort-Green** → find the lowest-carbon start offset inside
  the deadline; either dispatch now or queue-with-forecast.

### SentinelAI — predictive failure detection
Consumes 30-min sliding windows (180 samples @ 10s) of **7 telemetry metrics**:
`temp, power_draw, ecc_errors, sm_clock, pcie_throughput, memory_util, fan_rpm`.
When failure probability **P > 0.75** it raises an alert → checkpoint + migrate
the job, and produces a **SHAP attribution** so an operator can click into
*which metric* drove the alert.

### CostCut — idle-GPU reclamation
Forecasts per-node utilization 60 min ahead, then a rule-augmented policy picks:
`hibernate` (<0.15), `reassign` (<0.35), `defer` (<0.55), else `keep`. Reports
wasted `$/hr` and projected `$/month`.

---

## 2. Six-layer architecture

```
A. Input Gateway         POST /jobs/submit  (tags: urgent | flexible | best-effort-green)
        │
B. Scheduling Intel      SmartPack  +  GreenSched
        │
C. Cluster Orchestrator  mock K8s/SLURM interface (accepts placement)
        │
D. Telemetry Pipeline    synthetic DCGM/Kafka-style stream (10s tick, 7 metrics/node)
        │
E. Predictive Ops        SentinelAI  +  CostCut
        │
F. Operator Dashboard    real-time WebSocket-driven React UI (5 views + comparison)
```

> **On synthetic telemetry:** there is no physical GPU cluster attached to this
> demo, so Layer D generates plausible DCGM-style telemetry. This is a standard,
> accepted prototyping approach — the ML contracts are identical to what a real
> DCGM/Kafka feed would deliver, so swapping in a real stream requires no model
> changes.

### End-to-end demo flow

1. **Log in** (Operator or Admin). Unauthenticated users only see Landing/Login/Signup.
2. **Submit a job** with a tag on the Job Submission portal.
   - `urgent` → SmartPack direct placement.
   - `flexible` / `best_effort_green` → GreenSched evaluation → immediate
     dispatch *or* queued-with-forecast → then SmartPack placement.
3. Every dispatched job's node emits telemetry every 10s (Layer D).
4. **SentinelAI** continuously scans windows; when P>0.75 it raises an alert
     traceable to the job + node, with a clickable SHAP explanation (Health view).
5. **CostCut** forecasts idle nodes and lists reclaim actions (Cost view).
6. **GreenSched** shows the live carbon curve + kg CO₂ avoided (Carbon view).
7. The **Operator Dashboard** shows the 3D topology, a load heatmap, and a live
   **SmartPack vs FIFO** comparison widget.

No dashboard ever shows a blank/broken state — the frontend falls back to local
synthetic telemetry with a small **"simulated data"** badge instead of erroring.

---

## 3. API surface (all 8 endpoints, matching the concept book)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/jobs/submit` | Submit + route a job (Input Gateway) |
| POST | `/jobs/defer` | Defer a queued/running job |
| GET | `/cluster/status` | Cluster snapshot + summary + SmartPack-vs-FIFO |
| GET | `/health/predictions` | SentinelAI predictions + open alerts |
| GET | `/shap/explain?node_id=` | SHAP attribution for a node |
| GET | `/carbon/intensity` | 24h carbon curve + current intensity |
| GET | `/cost/analytics` | CostCut waste report + reclaim actions |
| WS | `/stream/telemetry` | Live 10s telemetry push |

Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` (JWT, roles
Operator/Admin). All non-auth routes require a bearer token.

---

## 4. Mock-model contract (why Phase 2 is a drop-in)

Every module (`smartpack.py`, `greensched.py`, `sentinelai.py`, `costcut.py`)
exposes the **same two functions with a fixed, documented schema**:

```python
def load_model():
    """If /backend/app/models/<name>.pth exists -> torch.load(...).
       Otherwise -> return a realistic rule-based/statistical mock.
       Same code path runs the whole demo either way."""

def predict(input: dict) -> dict:
    """Fixed input/output schema (see model cards in §6)."""
```

`load_model()` checks for the weight file at import/startup. When you drop real
weights into `/backend/app/models/`, the module automatically switches to the
trained model — **no other code changes**. Until then the mock produces
believable output (e.g. SentinelAI emits a *rising* failure-probability curve on
a degrading node, not pure noise).

---

## 5. Run locally

### Option A — one command (recommended)

```bash
docker compose up --build
```

- Frontend → http://localhost:5173
- Backend API + docs → http://localhost:8000/docs
- Postgres → localhost:5432 (`neuralsched` / `neuralsched`)

The backend waits for Postgres to be healthy, creates tables, loads all four
models (mock or real), and starts the telemetry simulator automatically.

### Option B — dev mode (hot reload)

```bash
# Backend
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000            # needs a local Postgres or set DATABASE_URL to sqlite

# Frontend (new terminal)
cd frontend
npm install
npm run dev                                          # proxies /api -> :8000
```

### First run
1. Open the frontend, click **Sign up**, create an Operator or Admin account.
2. Log in → land on the Operator Dashboard (3D topology + heatmap).
3. Submit a job on the Job Submission portal and watch it route.
4. Trigger a fault for the demo: `POST http://localhost:8000/dev/inject-fault`
   (helper) then open the Health view to see SentinelAI + SHAP react.

### Environment variables (see `.env.example` in each service)
| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | postgres on `db:5432` | DB connection |
| `JWT_SECRET` | dev secret | change in prod |
| `TELEMETRY_TICK_SECONDS` | 10 | simulator tick |
| `NUM_GPU_NODES` | 8 | simulated cluster size |
| `ELECTRICITY_MAPS_TOKEN` | "" | optional real carbon signal |
| `ELECTRICITY_MAPS_ZONE` | DE | carbon zone |

---

## 6. Phase 2 — plugging in the trained models

Drop weights here (they are git-ignored, never committed):

```
/backend/app/models/smartpack_gnn_ppo.pth
/backend/app/models/greensched_lstm.pth
/backend/app/models/sentinelai_tcn.pth
/backend/app/models/costcut_lstm.pth
```

`load_model()` picks them up on next startup. Verify the trained I/O shape
matches the mock schema below **before** swapping.

### Model cards

**SmartPack — `smartpack_gnn_ppo.pth`**
- Arch: GNN encoder over the cluster graph + PPO policy head.
- Train data: (synthetic) placement episodes; reward = the R formula above.
- Input: `{job: {gpu_requirement, tag}, nodes: [{id, gpu_util, queue_len, active_jobs, neighbors}]}`
- Output: `{assigned_node: str, placement_score: float, method: str}`

**GreenSched — `greensched_lstm.pth`**
- Arch: LSTM sequence model forecasting carbon intensity 24h ahead.
- Train data: historical carbon-intensity series (per zone).
- Input: `{tag, runtime_min, deadline_minutes, carbon_curve: float[24]}`
- Output: `{decision, best_start_offset_min, carbon_now, carbon_at_best, co2_avoided_kg, method}`

**SentinelAI — `sentinelai_tcn.pth`**
- Arch: Temporal Convolutional Network over 180×7 windows; SHAP for attribution.
- Train data: labeled GPU telemetry windows (healthy vs pre-failure).
- Input: `{node_id, window: [[7 metrics] × up to 180]}`
- Output: `{node_id, failure_probability, alert, shap: {metric: contribution}, method}`

**CostCut — `costcut_lstm.pth`**
- Arch: LSTM forecasting per-node utilization 60 min ahead.
- Train data: per-node utilization time series.
- Input: `{node_id, util_history: float[]}`
- Output: `{node_id, forecast_util, action, estimated_waste_usd_per_hr, method}`

---

## 7. Phase 3 — deployment (free-tier)

> Free-tier terms change often — verify current limits before a live demo.

| Piece | Target | Notes |
|-------|--------|-------|
| Frontend | Cloudflare Pages / Vercel Hobby | static build of `/frontend` |
| Backend | Render free web service | FastAPI + WebSocket; **sleeps after 15 min idle** |
| Auth + DB | Supabase free tier | migrate local Postgres schema as-is |
| Model weights | Hugging Face Hub | fetched at container startup, not committed |
| Carbon signal | Electricity Maps free tier | + synthetic 24h fallback (always on) |
| CI/CD | GitHub Actions | auto-deploy on push to `main` |

Config files in the repo:
- `render.yaml` — Render backend service definition.
- `.github/workflows/deploy.yml` — build frontend + trigger deploys on push to main.
- `backend/scripts/fetch_models.py` — pull `.pth` weights from HF Hub at startup.

### Troubleshooting free-tier quirks
- **Render cold start / spin-down:** free instances sleep after 15 min idle and
  take ~30–60s to wake. Add a keep-alive ping (e.g. cron-job.org hitting
  `/healthz` every 10 min) **before** any live demo.
- **WebSocket drops on wake:** the frontend `useTelemetry` hook auto-reconnects
  and falls back to local synthetic telemetry, so the UI never goes blank.
- **Electricity Maps down / rate-limited:** GreenSched falls back to the
  synthetic 24h curve automatically (`source: synthetic_fallback`).
- **Supabase paused project:** free projects pause after inactivity — open the
  dashboard once to resume before demoing.
- **HF weights missing:** any module without its `.pth` transparently runs its
  mock, so the demo still works end-to-end.

---

## 8. Tech stack

Backend: Python 3.11, FastAPI, SQLAlchemy 2.0, Postgres, python-jose (JWT),
bcrypt, PyTorch + SHAP (optional at runtime — mock path is dependency-light).
Frontend: React 18 + Vite + TypeScript, React Router, Zustand, Framer Motion,
Recharts, React Three Fiber + drei (3D topology). Docker Compose for the full
stack.
