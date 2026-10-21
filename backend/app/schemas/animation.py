from enum import Enum
import math
import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictPlanModel(BaseModel):
    """Reject fields outside the declared animation-plan contract."""

    model_config = ConfigDict(extra="forbid")


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
    set_geometry = "set_geometry"
    set_material = "set_material"
    connect = "connect"
    disconnect = "disconnect"
    wait = "wait"


class Vector3(StrictPlanModel):
    """World-space values; rotations are expressed in degrees."""
    x: float = 0
    y: float = 0
    z: float = 0

    @field_validator("x", "y", "z")
    @classmethod
    def finite_coordinate(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("3D coordinates must be finite numbers")
        return value


class GeometryType(str, Enum):
    box = "box"
    sphere = "sphere"
    cylinder = "cylinder"
    cone = "cone"
    plane = "plane"
    torus = "torus"
    capsule = "capsule"
    arrow = "arrow"
    line = "line"


def _safe_color(value: str | None) -> str | None:
    if value is None:
        return value
    value = value.strip()
    if not (re.fullmatch(r"#[0-9a-fA-F]{6}", value) or re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,31}", value)):
        raise ValueError("Color must be a six-digit hex value or a simple color name")
    return value


class MaterialProperties(StrictPlanModel):
    color: Optional[str] = None
    roughness: Optional[float] = None
    metalness: Optional[float] = None
    opacity: Optional[float] = None

    @field_validator("color")
    @classmethod
    def safe_color(cls, value: str | None) -> str | None:
        return _safe_color(value)

    @field_validator("roughness", "metalness", "opacity")
    @classmethod
    def unit_interval(cls, value: float | None) -> float | None:
        if value is not None and (not math.isfinite(value) or not 0 <= value <= 1):
            raise ValueError("Material roughness, metalness, and opacity must be between 0 and 1")
        return value


def _positive_scale(value: Vector3 | None) -> Vector3 | None:
    if value is not None and any(component <= 0 for component in (value.x, value.y, value.z)):
        raise ValueError("Scale components must be greater than zero")
    return value


class SceneSettings(StrictPlanModel):
    camera_position: Optional[Vector3] = None
    camera_target: Optional[Vector3] = None
    background_color: Optional[str] = None

    @field_validator("background_color")
    @classmethod
    def safe_background(cls, value: str | None) -> str | None:
        return _safe_color(value)


class ObjectProperties(StrictPlanModel):
    geometry: Optional[GeometryType] = None
    material: Optional[MaterialProperties] = None
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

    @field_validator("scale")
    @classmethod
    def positive_scale(cls, value: Vector3 | None) -> Vector3 | None:
        return _positive_scale(value)


class ActionParameters(StrictPlanModel):
    index: Optional[int] = Field(default=None, ge=0)
    value: Optional[str] = None
    position: Optional[Vector3] = None
    rotation: Optional[Vector3] = None
    scale: Optional[Vector3] = None
    geometry: Optional[GeometryType] = None
    material: Optional[MaterialProperties] = None
    duration_ms: Optional[int] = Field(default=None, ge=0, le=30000)
    text: Optional[str] = None
    range_start: Optional[int] = Field(default=None, ge=0)
    range_end: Optional[int] = Field(default=None, ge=0)
    direction: Optional[str] = None
    target_id: Optional[str] = None

    @field_validator("scale")
    @classmethod
    def positive_scale(cls, value: Vector3 | None) -> Vector3 | None:
        return _positive_scale(value)


class AnimationObject(StrictPlanModel):
    id: str = Field(min_length=1, max_length=80)
    type: ObjectType
    label: str = Field(min_length=1, max_length=120)
    properties: ObjectProperties = Field(default_factory=ObjectProperties)

    @field_validator("id", "label")
    @classmethod
    def nonblank_identity(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Object IDs and labels must not be blank")
        return value


class AnimationAction(StrictPlanModel):
    action: ActionType
    target: Optional[str] = None
    parameters: ActionParameters = Field(default_factory=ActionParameters)


class AnimationStep(StrictPlanModel):
    step: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=160)
    explanation: str = Field(min_length=1, max_length=1200)
    actions: list[AnimationAction] = Field(min_length=1, max_length=30)


class AnimationPlan(StrictPlanModel):
    concept: str = Field(min_length=1, max_length=160)
    domain: str = Field(min_length=1, max_length=120)
    learning_objective: str = Field(min_length=1, max_length=400)
    render_mode: Literal["2d", "3d"] = Field(
        default="2d",
        description="Generated lessons use a 3D scene by default; the browser also provides a learner-selectable 2D view. Legacy deterministic demo plans may retain 2d.",
    )
    scene: Optional[SceneSettings] = None
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
