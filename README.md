<div align="center">

# NeuralSched — Safety Envelope & Shadow Test

### Making a new AI GPU scheduler prove itself before it controls real jobs

A safety layer wrapped around the **SmartPack** placement agent of NeuralSched.
FIFO stays the only real executor while SmartPack runs in **shadow mode** — every
decision is checked against hard limits, scored against FIFO, and logged, but
**never applied**.

Built by **Team ShadowForge**, Daffodil International University.

</div>

---

## Start here

| Document | What it is |
|----------|-----------|
| **[SAFETY_ENVELOPE.md](./SAFETY_ENVELOPE.md)** | The design note — what the challenge asked, the core design choice, data flow, and how to verify it. |
| **[slides/safety-envelope-slides.html](./slides/safety-envelope-slides.html)** | Presentation deck (open in any browser; `←/→` to navigate, `P` to print to PDF). |
| [PROJECT.md](./PROJECT.md) | Full NeuralSched architecture, model cards, API reference. |
| [PROJECT_EXPLANATION.md](./PROJECT_EXPLANATION.md) | Plain-language walkthrough of the whole platform. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Step-by-step online deploy (Supabase → Render → Vercel). |

---

## The idea in one line

> **SmartPack runs in shadow mode — it must prove itself before it controls real jobs.**

- **FIFO** is the only thing that places a real job. Every job, no exceptions.
- **SmartPack** produces a *hypothetical* placement on every job. It passes
  through the **Safety Envelope** (max node temp, max job wait); any breaking
  action is **rejected** and written to the **Blocked Log** in one sentence. Its
  choice is scored against FIFO but **never applied to the cluster**.
- Real submitted jobs **and** an auto synthetic stream feed the shadow test;
  synthetic jobs are clearly flagged `simulated`.

This extends the Phase-1 "SmartPack vs FIFO" comparison widget with a real
safety cage and an honest "never applied" guarantee.

---

## Where the module lives

| Concern | File |
|---------|------|
| Envelope, limits, shadow scoreboard, blocked log, synthetic stream | `backend/app/modules/safety_envelope.py` |
| FIFO-executes / SmartPack-shadow wiring | `backend/app/api/scheduler.py` |
| API: `/safety/status`, `/safety/limits`, `/safety/force-block` | `backend/app/api/routes.py` |
| Dashboard page (sliders, scoreboards, blocked log, force-block) | `frontend/src/pages/Safety.tsx` |
| Animated loader for the slow models | `frontend/src/components/Loader.tsx` |

---

## Run locally

Backend (Python 3.11+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
# local SQLite so you don't need Postgres:
#   PowerShell:  $env:DATABASE_URL="sqlite:///./neuralsched.db"
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 18+), second terminal:

```bash
cd frontend
npm install
npm run dev                       # Vite proxies /api to :8000
```

Then sign up, log in, and open the **Safety** page.

### Verify it (5-step demo)

1. Open **Safety** — two scoreboards; only the agent has a "Blocked" count.
2. Submit a real job → message reads *"Placed by FIFO (agent ran in shadow)."*
3. Click **Force a block** → a red one-sentence entry appears in the log.
4. Drag the **temperature slider** down → the blocked count climbs live.
5. Scroll the **Blocked Log** — each line names the exact limit broken.

---

## Tech stack

**Backend:** Python, FastAPI, SQLAlchemy 2.0, PyTorch, torch-geometric,
stable-baselines3, SHAP.
**Frontend:** React 18, Vite, TypeScript, Zustand, Framer Motion, Recharts,
React Three Fiber.

---

## Team ShadowForge

- **Abdullah Rubab** — Team Leader & ML Architect
- **Md. Tanvir Hasan** — Backend & Infrastructure
- **Sourov Kumar** — Frontend & Dashboard

Mentor: **Md. Mezbaul Islam Zion**, Department of CSE, Daffodil International University.

Released under the [MIT License](./LICENSE).
