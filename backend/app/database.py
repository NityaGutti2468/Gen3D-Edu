import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.animation import AnimationPlan

DB_PATH = Path(__file__).resolve().parents[1] / "gen3d_edu.db"


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=20)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    connection = connect_db()
    try:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lessons (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                prompt TEXT NOT NULL,
                concept TEXT NOT NULL,
                domain TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_lessons_user_created
                ON lessons(user_id, created_at DESC);
        """)
        lesson_columns = {row["name"] for row in connection.execute("PRAGMA table_info(lessons)")}
        if "is_pinned" not in lesson_columns:
            connection.execute("ALTER TABLE lessons ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
        connection.commit()
    finally:
        connection.close()


def create_user(name: str, email: str, salt: bytes, password_hash: bytes) -> dict:
    connection = connect_db()
    try:
        cursor = connection.execute(
            "INSERT INTO users(name, email, password_salt, password_hash, created_at) VALUES(?,?,?,?,?)",
            (name, email, salt, password_hash, datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
        connection.commit()
        return {"id": cursor.lastrowid, "name": name, "email": email}
    finally:
        connection.close()


def get_user_by_email(email: str):
    connection = connect_db()
    try:
        return connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    finally:
        connection.close()


def get_user_by_id(user_id: int):
    connection = connect_db()
    try:
        return connection.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        connection.close()


def save_lesson(user_id: int, prompt: str, plan: AnimationPlan) -> dict:
    lesson_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection = connect_db()
    try:
        connection.execute(
            "INSERT INTO lessons(id, user_id, prompt, concept, domain, plan_json, created_at) VALUES(?,?,?,?,?,?,?)",
            (lesson_id, user_id, prompt, plan.concept, plan.domain, json.dumps(plan.model_dump(mode="json"), ensure_ascii=False), created_at),
        )
        connection.commit()
    finally:
        connection.close()
    return {"id": lesson_id, "concept": plan.concept, "domain": plan.domain, "created_at": created_at, "is_pinned": False}


def list_lessons(user_id: int) -> list[dict]:
    connection = connect_db()
    try:
        rows = connection.execute(
            "SELECT id, concept, domain, created_at, is_pinned FROM lessons WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def get_lesson(user_id: int, lesson_id: str) -> dict | None:
    connection = connect_db()
    try:
        row = connection.execute(
            "SELECT id, prompt, concept, domain, plan_json, created_at, is_pinned FROM lessons WHERE id = ? AND user_id = ?",
            (lesson_id, user_id),
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["plan"] = json.loads(result.pop("plan_json"))
        return result
    finally:
        connection.close()


def set_lesson_pinned(user_id: int, lesson_id: str, is_pinned: bool) -> bool:
    connection = connect_db()
    try:
        cursor = connection.execute(
            "UPDATE lessons SET is_pinned = ? WHERE id = ? AND user_id = ?",
            (int(is_pinned), lesson_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def delete_lessons(user_id: int, lesson_ids: list[str]) -> int:
    unique_ids = list(dict.fromkeys(lesson_ids))
    if not unique_ids:
        return 0
    placeholders = ",".join("?" for _ in unique_ids)
    connection = connect_db()
    try:
        cursor = connection.execute(
            f"DELETE FROM lessons WHERE user_id = ? AND id IN ({placeholders})",
            [user_id, *unique_ids],
        )
        connection.commit()
        return cursor.rowcount
    finally:
        connection.close()


init_db()
