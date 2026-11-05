import re

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.animation import AnimationPlan


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter your name")
        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        value = value.strip().casefold()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        value = value.strip().casefold()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value


class UserResponse(BaseModel):
    id: int
    name: str
    email: str


class AuthResponse(BaseModel):
    message: str
    user: UserResponse


class LessonSummary(BaseModel):
    id: str
    concept: str
    domain: str
    created_at: str
    is_pinned: bool = False


class PinLessonRequest(BaseModel):
    is_pinned: bool


class DeleteLessonsRequest(BaseModel):
    lesson_ids: list[str] = Field(min_length=1, max_length=100)


class LessonResponse(BaseModel):
    id: str
    prompt: str
    concept: str
    domain: str
    created_at: str
    is_pinned: bool = False
    plan: AnimationPlan


class BackupLesson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=1500)
    plan: AnimationPlan
    is_pinned: bool = False
    created_at: str | None = Field(default=None, max_length=40)


class RestoreLessonsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["gen3d-edu-library"]
    version: Literal[1]
    exported_at: str | None = None
    lessons: list[BackupLesson] = Field(min_length=1, max_length=500)
