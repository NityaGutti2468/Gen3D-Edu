import json
import time

from app.schemas.animation import AnimationPlan
from app.services.algorithm_demos import deterministic_topic_demo
from app.services.llm_service import GeminiPlanService
from app.validators.animation_validator import validate_plan

MAX_CORRECTIONS = 1
MAX_GENERATION_SECONDS = 60


def generate_valid_plan(prompt: str) -> tuple[AnimationPlan, dict, int]:
    demo_plan = deterministic_topic_demo(prompt)
    if demo_plan is not None:
        validation = validate_plan(demo_plan)
        if not validation["valid"]:
            raise ValueError("The deterministic lesson did not pass its semantic checks: " + "; ".join(validation["errors"]))
        return demo_plan, validation, 0

    deadline = time.monotonic() + MAX_GENERATION_SECONDS
    llm = GeminiPlanService()
    plan = llm.generate(prompt, deadline=deadline)
    result = validate_plan(plan)
    attempts = 0
    while not result["valid"] and attempts < MAX_CORRECTIONS:
        attempts += 1
        context = json.dumps({"plan": plan.model_dump(), "validation_errors": result["errors"]}, ensure_ascii=False)
        plan = llm.generate(prompt, context, deadline=deadline)
        result = validate_plan(plan)
    if not result["valid"]:
        raise ValueError("The generated plan did not pass validation after one correction attempt. Try a narrower prompt.")
    return plan, result, attempts
