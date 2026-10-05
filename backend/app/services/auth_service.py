import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from app.database import get_user_by_id

SESSION_COOKIE = "gen3d_session"
SESSION_SECONDS = 60 * 60 * 24 * 7
_secret_cache: str | None = None


def _secret() -> bytes:
    global _secret_cache
    if _secret_cache:
        return _secret_cache.encode("utf-8")
    secret = os.getenv("AUTH_SECRET_KEY", "").strip()
    secret_path = Path(__file__).resolve().parents[2] / ".auth_secret"
    if not secret:
        if secret_path.exists():
            secret = secret_path.read_text(encoding="utf-8").strip()
        else:
            secret = secrets.token_urlsafe(48)
            secret_path.write_text(secret, encoding="utf-8")
    _secret_cache = secret
    return secret.encode("utf-8")


def hash_password(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    salt = salt or secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return salt, password_hash


def verify_password(password: str, salt: bytes, expected_hash: bytes) -> bool:
    _, actual_hash = hash_password(password, salt)
    return hmac.compare_digest(actual_hash, expected_hash)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def create_session(user: dict) -> str:
    payload = {"sub": int(user["id"]), "exp": int(time.time()) + SESSION_SECONDS}
    encoded = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def get_session_user(token: str | None):
    if not token or "." not in token:
        return None
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected_signature = _b64(hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return None
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        user = get_user_by_id(int(payload["sub"]))
        return dict(user) if user else None
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None
