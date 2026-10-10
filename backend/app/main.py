from pathlib import Path
import os
import sqlite3

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_user, delete_lessons, get_lesson, get_user_by_email, list_lessons, save_lesson, set_lesson_pinned
from app.schemas.animation import GenerateRequest, GenerateResponse, ValidationResult
from app.schemas.auth import AuthResponse, DeleteLessonsRequest, LessonResponse, LessonSummary, LoginRequest, PinLessonRequest, SignupRequest, UserResponse
from app.services.auth_service import SESSION_COOKIE, SESSION_SECONDS, create_session, get_session_user, hash_password, verify_password
from app.services.animation_service import generate_valid_plan
from app.services.llm_service import LLMGenerationError, LLMUnavailable

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)
app = FastAPI(title="Gen3D-Edu API", version="1.0.0", description="Validated educational AnimationPlan generation")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def require_user(request: Request) -> dict:
    user = get_session_user(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user


def set_session_cookie(response: Response, user: dict) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session(user),
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "false").casefold() == "true",
        samesite="lax",
        max_age=SESSION_SECONDS,
        path="/",
    )


@app.get("/")
def root():
    return {"name": "Gen3D-Edu", "message": "Educational animation planning API", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "gen3d-edu-api"}


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(data: SignupRequest, response: Response):
    salt, password_hash = hash_password(data.password)
    try:
        user = create_user(data.name, data.email, salt, password_hash)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.") from exc
    set_session_cookie(response, user)
    return AuthResponse(message="Account created. Welcome to Gen3D-Edu.", user=UserResponse(**user))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(data: LoginRequest, response: Response):
    user_row = get_user_by_email(data.email)
    if not user_row or not verify_password(data.password, user_row["password_salt"], user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    user = {"id": user_row["id"], "name": user_row["name"], "email": user_row["email"]}
    set_session_cookie(response, user)
    return AuthResponse(message="Signed in successfully.", user=UserResponse(**user))


@app.get("/api/auth/me", response_model=UserResponse)
def me(user: dict = Depends(require_user)):
    return UserResponse(**user)


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(key=SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return {"message": "Signed out."}


@app.get("/api/lessons", response_model=list[LessonSummary])
def lesson_history(user: dict = Depends(require_user)):
    return list_lessons(user["id"])


@app.get("/api/lessons/{lesson_id}", response_model=LessonResponse)
def saved_lesson(lesson_id: str, user: dict = Depends(require_user)):
    lesson = get_lesson(user["id"], lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    return lesson


@app.patch("/api/lessons/{lesson_id}/pin", response_model=LessonSummary)
def pin_lesson(lesson_id: str, data: PinLessonRequest, user: dict = Depends(require_user)):
    if not set_lesson_pinned(user["id"], lesson_id, data.is_pinned):
        raise HTTPException(status_code=404, detail="Lesson not found.")
    lesson = next((item for item in list_lessons(user["id"]) if item["id"] == lesson_id), None)
    return lesson


@app.post("/api/lessons/bulk-delete")
def remove_lessons(data: DeleteLessonsRequest, user: dict = Depends(require_user)):
    deleted_count = delete_lessons(user["id"], data.lesson_ids)
    return {"deleted_count": deleted_count}


@app.post("/api/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest, user: dict = Depends(require_user)):
    try:
        plan, validation, attempts = generate_valid_plan(request.prompt)
        lesson = save_lesson(user["id"], request.prompt, plan)
        return GenerateResponse(message="Animation plan generated, validated, and saved.", plan=plan, validation=ValidationResult(**validation), correction_attempts=attempts, lesson_id=lesson["id"], created_at=lesson["created_at"])
    except LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="The lesson could not be generated. Please try again.") from exc
