# Gen3D-Edu

Prompt → Gemini → typed AnimationPlan → semantic validation → bounded correction → interactive React lesson player. Users sign in or create an account first; generated lessons are saved in a private per-user SQLite history and can be reopened from the sidebar. Passwords are hashed, and the session is held in an HTTP-only cookie. The renderer includes reusable presentations for arrays, graph nodes and edges, charts, equations, labels, text, shapes, and other semantic objects.

## Structure
```text
Gen3D-Edu/
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── gen3d_edu.db (created on first run, ignored by Git)
│   └── app/{main.py,database.py,schemas/animation.py,schemas/auth.py,services/auth_service.py,services/llm_service.py,services/animation_service.py,validators/animation_validator.py}
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/{App.jsx,main.jsx,styles.css,services/api.js,hooks/usePlayback.js,components/PlanScene.jsx,components/StepList.jsx,components/PlaybackControls.jsx}
```

## Run
1. Copy `.env.example` into `backend/.env` and set `GEMINI_API_KEY`.
2. Backend: `cd backend`, `python -m venv .venv`, activate it, `pip install -r requirements.txt`, then `uvicorn app.main:app --reload --port 8000`.
3. Frontend in another terminal: `cd frontend`, `npm install`, `npm run dev`, then open the Vite URL.

The sample Binary Search lesson is visibly labeled as a sample. It is not represented as model output. Generation needs a configured Gemini key. The plan schema uses explicit typed fields; it has no free-form dictionary fields. Local accounts and lesson history live in `backend/gen3d_edu.db`; back up that file if you want to retain local history across machine changes.
