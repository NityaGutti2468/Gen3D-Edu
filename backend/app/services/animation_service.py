import json

from app.schemas.animation import AnimationPlan
from app.services.llm_service import GeminiPlanService
from app.validators.animation_validator import validate_plan

MAX_CORRECTIONS = 2


def generate_valid_plan(prompt: str) -> tuple[AnimationPlan, dict, int]:
    llm = GeminiPlanService()
    plan = llm.generate(prompt)
    result = validate_plan(plan)
    attempts = 0
    while not result["valid"] and attempts < MAX_CORRECTIONS:
        attempts += 1
        context = json.dumps({"plan": plan.model_dump(), "validation_errors": result["errors"]}, ensure_ascii=False)
        plan = llm.generate(prompt, context)
        result = validate_plan(plan)
    if not result["valid"]:
        raise ValueError("The generated plan did not pass validation after two correction attempts. Try a narrower prompt.")
    return plan, result, attempts
