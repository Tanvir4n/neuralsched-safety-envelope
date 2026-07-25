# NeuralSched: Full Project Explanation

**Team ShadowForge, Daffodil International University**
Abdullah Rubab (Team Leader and ML Architect) · Md. Tanvir Hasan (Backend and Infrastructure) · Sourov Kumar (Frontend and Dashboard) · Mentor: Md. Mezbaul Islam Zion (Dept. of CSE, DIU)

---

## 1. The one-line pitch

NeuralSched is an intelligence layer that sits on top of a GPU cluster scheduler (Kubernetes or SLURM) and makes four decisions smarter: **where** to place a job, **when** to run it to cut carbon, **which** node is about to fail, and **how much** GPU money is being wasted. Four machine-learning models power these four decisions, and they cooperate to keep jobs running when hardware starts to degrade.

## 2. The problem

Big GPU clusters are expensive, power-hungry, and fragile:
- Naive schedulers pack jobs poorly, so GPUs sit half-idle while queues grow.
- Training jobs run whenever they are submitted, often during high-carbon grid hours.
- A single GPU degrading (overheating, ECC memory errors, fan failure) can crash a multi-day job with no warning.
- Idle and underused GPUs quietly burn money.

NeuralSched attacks all four with dedicated ML models, and adds an automation loop that **moves a job off a node before that node fails**.

## 3. The four models: what each one actually does

Each model follows the same contract in code: `load_model()` loads the trained weights, `predict(input)` returns a decision. If the trained weights are missing, each model falls back to a transparent rule-based version so the system never breaks. All four were trained by the team on Kaggle and the real weights ship in `backend/app/models/*.pth`.

### 3.1 SmartPack: where to place a job (GNN + PPO)
- **Input:** the current cluster state (per node: GPU utilization, queue length, active jobs, and its NVLink/PCIe neighbors) plus the new job (how many GPUs it needs, and its tag).
- **Model:** a Graph Neural Network (GraphSAGE) reads the cluster **as a graph** (nodes are GPU servers, edges are the interconnect). A reinforcement-learning agent (PPO) trained on this graph chooses the best node.
- **Reward it was trained to maximize:** `R = alpha*Utilization + beta*(1/QueueLength) - gamma*Interference - delta*MigrationCost`. In plain words: fill GPUs efficiently, avoid long queues, avoid placing jobs next to noisy neighbors on the interconnect, and avoid needless moves.
- **Output:** `{assigned_node, placement_score, method: "gnn_ppo"}`.
- **Why a GNN:** placement quality depends on **neighbors** (interconnect contention), which is exactly what graph networks capture and a flat scheduler misses.
- **Baseline we compare against:** a naive FIFO "first free node" placement. The dashboard shows SmartPack vs FIFO average utilization and score side by side.

### 3.2 GreenSched: when to run a job (Carbon LSTM)
- **Input:** the job (tag: Urgent / Flexible / Best-Effort-Green, expected runtime, deadline) and a 24-hour carbon-intensity signal for the grid (gCO2 per kWh).
- **Model:** an LSTM (CarbonLSTM, 2 layers, 96 hidden units) forecasts carbon intensity 24 hours ahead.
- **Decision logic:** minimize `carbon(t) * runtime` subject to the deadline. Urgent jobs dispatch now; flexible jobs are shifted to the greenest hour that still meets the deadline.
- **Output:** `{decision, best_start_offset_min, carbon_now, carbon_at_best, co2_avoided_kg, forecast[24], method: "lstm_carbon_forecast"}`.
- **Why it matters:** this is the novel, sustainability-facing contribution. Shifting a flexible training job by a few hours can measurably cut its CO2 footprint. This maps directly to UN SDG 7 (clean energy) and SDG 13 (climate action).

### 3.3 SentinelAI: which node is about to fail (TCN + SHAP)
- **Input:** a 30-minute sliding window (180 samples at 10-second granularity) of 7 telemetry metrics per node: `temp, power_draw, ecc_errors, sm_clock, pcie_throughput, memory_util, fan_rpm`.
- **Model:** a Temporal Convolutional Network (TCN) with causal dilated convolutions and residual blocks reads the time-series window and outputs a **failure probability** plus a time-to-failure estimate.
- **Threshold:** when probability `P > 0.75`, it raises an alert.
- **Explainability:** SHAP (a GradientExplainer) attributes the alert to specific metrics, so the alert says, for example, "driven mostly by rising temperature and ECC errors," not just "node might fail."
- **Output:** `{node_id, failure_probability, alert, shap: {metric: percent}, ttf_estimate, method: "tcn_shap"}`.
- **Why a TCN:** failures show up as slow drift patterns over time (a fan slowly dying, temperature creeping up), which a temporal convolutional model captures well while staying fast on CPU.

### 3.4 CostCut: how much GPU money is wasted (Utilization LSTM)
- **Input:** the recent utilization history of a node (last 60 samples).
- **Model:** a small LSTM (UtilLSTM, 48 hidden units) forecasts the node's next-step utilization.
- **Decision logic:** if forecast utilization is low, the node is being wasted; it recommends an action (consolidate, downscale, or reclaim) and estimates the dollars wasted per hour at an assumed GPU price.
- **Output:** `{node_id, forecast_util, action, estimated_waste_usd_per_hr, method: "lstm_util_forecast"}`.

## 4. How it optimizes when a node gets overloaded or starts to fail

This is the closed loop that ties the models together. It is the "self-healing" story.

1. **Detect.** Every scan cycle, SentinelAI runs the TCN over each node's live 30-minute telemetry window. If a node's failure probability crosses 0.75, an **Alert** is created and persisted, with the SHAP explanation of why.
2. **Re-place.** The system asks SmartPack for the **healthiest destination node**, excluding the failing one. SmartPack scores candidate nodes with its GNN+PPO policy and returns the best target.
3. **Move.** The job on the failing node is checkpointed and its assignment is switched to the new node (`job.assigned_node = to_node`).
4. **Heal and load.** The simulator relieves the failing node (drains its load, clears the fault) and adds load to the destination node, mirroring what a real orchestrator would actuate.
5. **Log.** A migration event is recorded (`from_node -> to_node`, mode, failure probability, timestamp) and shown in the Health page migration log.

**Auto vs manual (operator control).** There is a toggle. In **manual** mode the operator clicks "Checkpoint and migrate" on an alert. In **auto** mode, the moment SentinelAI raises a new alert, the migration loop runs automatically. This is exactly the auto/manual switch on the Health page. The relevant code is `migrate_job()` and `run_health_scan()` in `backend/app/api/scheduler.py`.

So "when one node gets too busy or starts to fail," the answer is: **SentinelAI flags it, SmartPack picks a healthy home, the job is checkpoint-migrated there, and the old node is healed** — either on one click or fully automatically.

## 5. Where do the SentinelAI alerts come from?

An alert is **not** hand-scripted. The chain is:

1. The **telemetry simulator** (`backend/app/telemetry/simulator.py`) continuously produces the 7 metrics for every node, every 10 seconds, and keeps a rolling 30-minute window per node.
2. On each health scan, that raw window is fed **as-is** into the real trained **SentinelAI TCN**.
3. The TCN outputs a failure probability. If it exceeds the 0.75 threshold, `run_health_scan()` creates an `Alert` row in the database with the probability and the SHAP breakdown.

Alerts appear for two reasons:
- **Spontaneous faults:** the simulator rarely (about 0.04% per tick per node) starts a slow-degrading fault on a node. Its metrics then drift out of the healthy range (temperature climbs, ECC errors rise, fan RPM spikes), the TCN detects the pattern, and an alert fires. The rate is deliberately low so the cluster does not turn red constantly.
- **Injected faults (for demos):** you can force a node to fault on demand via `POST /dev/inject-fault?node_id=gpu-node-5`. This is how you trigger a live alert on stage and then show the migration.

Crucially, the alert probability is produced by the **actual trained model reading actual telemetry**, not a random flag. That is what makes the demo honest.

## 6. What is the "fake DCGM," and how are we using it?

**DCGM** (NVIDIA Data Center GPU Manager) is the real-world tool that streams GPU telemetry (temperature, power, ECC errors, clocks, PCIe throughput, memory, fan speed) from physical GPUs in a datacenter. In production, SentinelAI and CostCut would consume that live DCGM stream.

We do not have a physical GPU cluster for a hackathon, so we built a **DCGM-style telemetry simulator** (`simulator.py`) that emulates that same stream:
- It produces the **exact same 7 metrics, in the exact same order** the SentinelAI TCN was trained on.
- **Healthy nodes** are sampled to stay within about one standard deviation of the model's training "healthy" distribution, so the real model correctly reads them as healthy.
- **Faulting nodes** are pushed out of distribution in physically plausible directions (temperature and ECC errors up, clock speed down, fan RPM up), so the model detects a genuine degradation pattern.
- It maintains the rolling 30-minute window and exposes it exactly like a real metrics pipeline (Kafka or a DCGM exporter) would.

So "fake DCGM" means: **a faithful stand-in for the real GPU telemetry feed**, feeding the same schema into the same models. Swapping the simulator for a real DCGM/Kafka source in production is a drop-in change; the models and the whole pipeline stay identical. This is standard, honest prototyping practice, and the UI labels the data as "simulated" everywhere (the "SIM" badge).

## 7. About the 32 nodes and the topology view

SmartPack's PPO policy was trained for a **fixed 32-node cluster graph**, so the backend keeps 32 nodes internally (otherwise the trained placement model would not run). Rendering 32 GPU servers in 3D is cluttered and hard to read, so the **Cluster Topology visualization shows a clean, representative 8 nodes** for clarity, while the **GPU Load Heatmap still shows all 32**. Nothing about the models changed; only the number of nodes drawn in the 3D view did.

## 8. System architecture (how it all fits)

```
                         Browser (React + Vite + TypeScript)
   Homepage · Dashboard · SmartPack · GreenSched · SentinelAI · CostCut · About
         3D topology (React Three Fiber) · charts (recharts) · JWT auth
                                   |  REST + WebSocket
                                   v
                       FastAPI backend (Python)
   /auth  /jobs/submit  /health/predictions  /cost/analytics  /carbon ...
   scheduler.py  ->  the 4 model modules (load_model / predict)
                     smartpack (GNN+PPO)  greensched (Carbon LSTM)
                     sentinelai (TCN+SHAP)  costcut (Util LSTM)
   telemetry/simulator.py  ->  DCGM-style 7-metric stream, 32 nodes, 10s ticks
                                   |
                                   v
                       PostgreSQL (users, jobs, alerts)  [SQLite locally]
```

- **Frontend:** React + Vite + TypeScript. 3D via React Three Fiber and drei; charts via recharts; animations via framer-motion; state via Zustand.
- **Backend:** FastAPI + SQLAlchemy 2.0, JWT auth, a background telemetry loop, and the four model modules.
- **Data:** PostgreSQL in production (Supabase), SQLite locally. Tables auto-create on startup.
- **Models:** trained on Kaggle, shipped as PyTorch weights, run on CPU.

## 9. Why this is compelling for the hackathon

- **Four real trained models**, not mocks, each solving a distinct, real cluster problem.
- **They cooperate:** SentinelAI + SmartPack together form a self-healing migration loop.
- **Explainable:** SHAP tells you *why* a node was flagged.
- **Sustainability-first:** GreenSched targets UN SDG 7 and SDG 13 by cutting the carbon footprint of flexible jobs.
- **Honest engineering:** a DCGM-style simulator stands in for real telemetry with the exact training schema, and the UI labels it as simulated. It is a clean drop-in for a real feed.
- **Production-shaped:** middleware above Kubernetes/SLURM, JWT auth, a real database, and a documented online deployment path (Supabase + Hugging Face Spaces + Vercel).

## 10. Quick demo script (2 to 3 minutes)

1. Open the homepage, show the animated hero and the four modules and the SDG framing.
2. Go to the Dashboard: live telemetry streaming, the clean 8-node 3D topology, the full 32-node heatmap, and SmartPack vs FIFO comparison.
3. Submit a job: SmartPack places it (real GNN+PPO), GreenSched shows the carbon decision and CO2 avoided.
4. Go to SentinelAI (Health): show current failure probabilities and click a node to see its SHAP explanation.
5. Force a fault: `POST /dev/inject-fault?node_id=gpu-node-3`. Within a scan, an alert appears with its SHAP reason.
6. Turn on Auto-migrate (or click Checkpoint and migrate). Show the migration log: the job moved to a SmartPack-chosen healthy node and the old node healed.
7. Open CostCut: utilization forecast and the dollars-per-hour waste estimate.
