# Gen3D-Edu

Prompt → LLM → typed `AnimationPlan` → semantic validation → bounded correction → interactive React lesson player. Gemini is the preferred generation provider. An optional OpenAI provider is used as an independent fallback if Gemini is unavailable, times out, or rejects the request. Both providers must return the same structured `AnimationPlan`; the app validates the result before saving or showing it. The model never supplies executable Blender or browser code.

Users sign in or create an account first; generated lessons are saved in a private per-user SQLite history and can be reopened from the sidebar. Passwords are hashed, and the session is held in an HTTP-only cookie. The renderer includes reusable presentations for arrays, graph nodes and edges, charts, equations, labels, text, shapes, and other semantic objects, with interactive 2D and 3D views.

## System architecture diagram

The report-ready architecture figure is available as [SVG](docs/system-architecture.svg). Its editable flowchart source is [Mermaid](docs/system-architecture.mmd).

## Structure

```text
Gen3D-Edu/
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── gen3d_edu.db (created on first run, ignored by Git)
│   └── app/{main.py,database.py,schemas/animation.py,schemas/auth.py,services/auth_service.py,services/llm_service.py,services/openai_service.py,services/animation_service.py,validators/animation_validator.py}
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/{App.jsx,main.jsx,styles.css,services/api.js,hooks/usePlayback.js,components/PlanScene.jsx,components/StepList.jsx,components/PlaybackControls.jsx}
```

## Run

1. Copy `.env.example` to `backend/.env`. Set `GEMINI_API_KEY` for Gemini. To enable independent provider failover, also set `OPENAI_API_KEY`; the application tries Gemini first and then OpenAI when needed. The OpenAI defaults are `OPENAI_MODEL=gpt-4o-mini` and a 20-second request timeout. Set provider model IDs to models enabled for your keys. API providers may require billing and can incur usage charges.
2. Backend: `cd backend`, `python -m venv .venv`, activate it, `python -m pip install -r requirements.txt`, then `python -m uvicorn app.main:app --reload --port 8000`.
3. Frontend in another terminal: `cd frontend`, `npm install`, `npm run dev`, then open the Vite URL.

The backend enforces a 65-second generation budget; the frontend waits up to 75 seconds for the response. Gemini uses a 12-second per-model timeout and tries at most three configured model IDs, leaving time for validation/correction or an OpenAI fallback. When both providers are configured, it reserves up to 25 seconds for OpenAI. Supported deterministic demo topics do not need either provider. The sample Binary Search lesson is visibly labeled as a sample and is not represented as model output. The plan schema uses explicit typed fields; it has no free-form dictionary fields. Local accounts and lesson history live in `backend/gen3d_edu.db`; back up that file if you want to retain local history across machine changes.

Keep `backend/.env` private and never commit API keys. `.env` files are ignored by Git; `.env.example` contains placeholders only.


## Lesson backups

From the dashboard, choose **Backup library** to download all saved lessons into one JSON file. The backup includes lesson prompts, plans, saved dates, and pin status. Choose **Import lesson / backup** to open a single lesson file or restore a library backup into the signed-in account. Restoring keeps existing lessons and adds the backup lessons as new entries.
