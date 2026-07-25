# NeuralSched — Phase 3 Deployment Guide

Deploy the full stack online, for free, with the **real trained models** running:

| Layer      | Host                       | Cost | URL you'll get                          |
|------------|----------------------------|------|-----------------------------------------|
| Database   | Supabase (Postgres)        | Free | `postgresql://...` connection string    |
| Backend    | Render (Docker web service)| Free | `https://neuralsched-backend.onrender.com` |
| Frontend   | Vercel                     | Free | `https://neuralsched.vercel.app`        |

> **Why Render, not Hugging Face?** HF now requires a paid PRO plan for Docker
> and Gradio Spaces (only Static Spaces stay free), so it can no longer host a
> Python/torch backend for free. Render still has a genuine free web-service tier
> (no credit card).

Deploy in this order: **Database → Backend → Frontend** (each needs the previous one's URL).

---

## 0. Prerequisites

- A GitHub account with this repo pushed to it — https://github.com
- A Render account — https://render.com (sign in with GitHub)
- A Vercel account — https://vercel.com/signup
- A Supabase account — https://supabase.com/dashboard

The 4 trained weights (`backend/app/models/*.pth`, ~2 MB total) are **committed to
the repo**, so they ship inside the backend image automatically — no extra hosting step.

---

## 1. Database — Supabase Postgres

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it `neuralsched`, pick a strong DB password (save it), choose the region closest to you, click **Create new project** (wait ~2 min).
3. Left sidebar → **Project Settings** (gear) → **Database**.
4. Under **Connection string** choose **URI** and copy it. It looks like:
   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password from step 2. **Save this full string** — it's your `DATABASE_URL`.

> Use the **Session pooler** (port 6543) connection string — it's the one that works from a container host like Render.

---

## 2. Put the code on GitHub

If the project isn't on GitHub yet, from the clean repo folder:

```powershell
cd "d:/AI Hackathon/neuralsched"
git remote add origin https://github.com/<your-user>/neuralsched.git
git branch -M main
git push -u origin main
```

> The `.pth` weight files are small (~2 MB) and are committed normally — no Git LFS needed.

---

## 3. Backend — Render (Docker web service)

Render reads the `render.yaml` blueprint at the repo root, builds `backend/Dockerfile`, and gives you an HTTPS URL. The Dockerfile binds to Render's injected `$PORT` automatically.

### 3a. Create the service (Blueprint — easiest)

1. Go to https://dashboard.render.com → **New +** → **Blueprint**.
2. Connect your GitHub account and select the **`neuralsched`** repo.
3. Render detects `render.yaml` and shows a service named **`neuralsched-backend`** (Docker, free plan). Click **Apply**.

> If you prefer to skip the blueprint: **New + → Web Service → connect repo →
> Runtime: Docker → Root Directory: `backend` → Dockerfile Path: `./Dockerfile` →
> Instance Type: Free.** Then add the env vars in 3b.

### 3b. Set the backend environment variables

In the service → **Environment** tab, add:

| Key                     | Value                                              |
|-------------------------|----------------------------------------------------|
| `DATABASE_URL`          | the Supabase URI from step 1                        |
| `JWT_SECRET`            | a long random string (any 32+ char secret)          |
| `NUM_GPU_NODES`         | `32`                                               |
| `TELEMETRY_TICK_SECONDS`| `10`                                               |
| `ENVIRONMENT`           | `production`                                        |

Click **Save, rebuild, and deploy**. The first build takes ~5-10 min (installing torch). When it shows **Live**, open:

- `https://neuralsched-backend.onrender.com/` → JSON with all four models showing `gnn_ppo` / `lstm` / `tcn` / `lstm` (NOT `mock`).
- `https://neuralsched-backend.onrender.com/healthz` → `{"status":"ok"}`

**Copy this Render URL** — it's your `VITE_API_BASE` for the frontend.

> Your exact URL is shown at the top of the Render service page. It's
> `https://<service-name>.onrender.com`.

---

## 4. Frontend — Vercel

1. Go to https://vercel.com/new and **Import** your GitHub repo.
2. **Root Directory**: click **Edit** → select `frontend`.
3. **Framework Preset**: Vite (auto-detected). Build command `npm run build`, output `dist` (defaults are fine).
4. Expand **Environment Variables** and add:

   | Name             | Value                                                 |
   |------------------|-------------------------------------------------------|
   | `VITE_API_BASE`  | `https://neuralsched-backend.onrender.com`            |
   | `VITE_WS_BASE`   | `wss://neuralsched-backend.onrender.com`              |

   > No trailing slash, no `/api`. The backend routes live at the root (`/auth/login`, `/health/predictions`, …). Note `VITE_WS_BASE` uses **`wss://`** (secure WebSocket), not `https://`.

5. Click **Deploy**. After ~1 min you get `https://neuralsched.vercel.app`.

---

## 5. Verify end-to-end

1. Open the Vercel URL. The homepage should load with the 3D hero.
2. **Sign up** → you should get redirected into the dashboard.
3. Dashboard telemetry should stream (WebSocket via `VITE_WS_BASE`), nodes mostly green.
4. **Submit a job** → SmartPack places it (real `gnn_ppo`), GreenSched shows carbon decision.
5. **Health** view → SentinelAI predictions; toggle **Auto-migrate**; use the demo helper to force a fault:
   ```
   POST https://neuralsched-backend.onrender.com/dev/inject-fault?node_id=gpu-node-5
   ```
   Then watch the alert + migration (auto or manual) appear.

---

## 6. Notes & gotchas

- **Cold start**: the free Render service **sleeps after 15 min of inactivity**;
  the first request after that takes ~30-60 s to wake. Before a live demo, open
  `/healthz` once to warm it, or set a free cron ping (e.g. cron-job.org hitting
  `/healthz` every 10 min).
- **Free instance hours**: Render gives 750 free instance-hours per month per
  workspace — plenty for one service. If exhausted, the service is suspended
  until the next month.
- **Memory (512 MB)**: the torch stack is heavy. If a deploy is killed with an
  out-of-memory error during startup, the models fall back to their mock paths
  and the demo still works end-to-end; the app never goes blank. (Upgrading to a
  paid instance removes the limit if you need the real models guaranteed.)
- **CORS** is already open (`allow_origins=["*"]` in `app/main.py`), so Vercel → Render works out of the box.
- **DB tables** are auto-created on backend startup (`init_db()` in `app/main.py`) — nothing to run manually.
- **Model check**: if `/` shows `mock(...)` instead of real methods, the `.pth` files didn't ship — confirm `backend/app/models/*.pth` are committed and not caught by `.gitignore`/`.dockerignore`.
- **Redeploy**: push to GitHub → Vercel redeploys the frontend and Render rebuilds the backend automatically.
- **Supabase paused project**: free projects pause after inactivity — open the dashboard once to resume before demoing.
