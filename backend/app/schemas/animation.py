from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ObjectType(str, Enum):
    array = "array"
    array_cell = "array_cell"
    pointer = "pointer"
    text = "text"
    node = "node"
    graph = "graph"
    edge = "edge"
    shape = "shape"
    label = "label"
    equation = "equation"
    chart = "chart"


class ActionType(str, Enum):
    create = "create"
    remove = "remove"
    show = "show"
    hide = "hide"
    move = "move"
    rotate = "rotate"
    scale = "scale"
    highlight = "highlight"
    focus = "focus"
    compare = "compare"
    update_value = "update_value"
    connect = "connect"
    disconnect = "disconnect"
    wait = "wait"


class Vector3(BaseModel):
    x: float = 0
    y: float = 0
    z: float = 0


class ObjectProperties(BaseModel):
    position: Optional[Vector3] = None
    rotation: Optional[Vector3] = None
    scale: Optional[Vector3] = None
    values: Optional[list[str]] = None
    spacing: Optional[float] = Field(default=None, ge=0.000001)
    cell_size: Optional[float] = Field(default=None, ge=0.000001)
    index: Optional[int] = Field(default=None, ge=0)
    direction: Optional[str] = None
    content: Optional[str] = None
    font_size: Optional[float] = Field(default=None, ge=0.000001)
    value: Optional[str] = None
    source_id: Optional[str] = None
    target_id: Optional[str] = None


class ActionParameters(BaseModel):
    index: Optional[int] = Field(default=None, ge=0)
    value: Optional[str] = None
    position: Optional[Vector3] = None
    rotation: Optional[Vector3] = None
    scale: Optional[Vector3] = None
    duration_ms: Optional[int] = Field(default=None, ge=0, le=30000)
    text: Optional[str] = None
    range_start: Optional[int] = Field(default=None, ge=0)
    range_end: Optional[int] = Field(default=None, ge=0)
    direction: Optional[str] = None
    target_id: Optional[str] = None


class AnimationObject(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    type: ObjectType
    label: str = Field(min_length=1, max_length=120)
    properties: ObjectProperties = Field(default_factory=ObjectProperties)


class AnimationAction(BaseModel):
    action: ActionType
    target: Optional[str] = None
    parameters: ActionParameters = Field(default_factory=ActionParameters)


class AnimationStep(BaseModel):
    step: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=160)
    explanation: str = Field(min_length=1, max_length=1200)
    actions: list[AnimationAction] = Field(min_length=1, max_length=30)


class AnimationPlan(BaseModel):
    concept: str = Field(min_length=1, max_length=160)
    domain: str = Field(min_length=1, max_length=120)
    learning_objective: str = Field(min_length=1, max_length=400)
    objects: list[AnimationObject] = Field(min_length=1, max_length=80)
    steps: list[AnimationStep] = Field(min_length=1, max_length=40)

    @field_validator("concept", "domain", "learning_objective")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Must not be blank")
        return value


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1500)

    @field_validator("prompt")
    @classmethod
    def clean_prompt(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter an educational prompt")
        return value


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]


class GenerateResponse(BaseModel):
    message: str
    plan: AnimationPlan
    validation: ValidationResult
    correction_attempts: int
    lesson_id: str
    created_at: str
