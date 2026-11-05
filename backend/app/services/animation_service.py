import json
import logging
import time

from app.schemas.animation import AnimationPlan
from app.services.algorithm_demos import deterministic_topic_demo
from app.services.llm_service import GeminiPlanService, LLMGenerationError, LLMUnavailable
from app.services.openai_service import OpenAIPlanService
from app.validators.animation_validator import validate_plan

logger = logging.getLogger(__name__)
MAX_GENERATION_SECONDS = 65
OPENAI_RESERVE_SECONDS = 25


def _configured_providers():
    providers = []
    for provider_class in (GeminiPlanService, OpenAIPlanService):
        try:
            providers.append(provider_class())
        except LLMUnavailable as exc:
            logger.info("%s provider skipped: %s", provider_class.__name__, exc)
    if not providers:
        raise LLMUnavailable(
            "No LLM provider is configured. Add GEMINI_API_KEY and/or OPENAI_API_KEY to backend/.env, then restart the API."
        )
    return providers


def _generate_validated_with_fallback(providers, prompt, deadline):
    errors = []
    correction_attempts = 0
    for index, provider in enumerate(providers):
        remaining = deadline - time.monotonic()
        if remaining <= 0.5:
            errors.append(f"{provider.__class__.__name__}: shared generation deadline expired")
            break
        provider_deadline = deadline
        # Keep enough wall-clock budget for the independent provider after Gemini's
        # model-ID retries have had their allotted time.
        if isinstance(provider, GeminiPlanService) and index + 1 < len(providers):
            if remaining <= OPENAI_RESERVE_SECONDS:
                errors.append("Gemini: skipped to preserve the OpenAI backup time budget")
                continue
            provider_deadline = deadline - OPENAI_RESERVE_SECONDS
        provider_name = provider.__class__.__name__.replace("PlanService", "")
        try:
            plan = provider.generate(prompt, deadline=provider_deadline)
            result = validate_plan(plan)
            if not result["valid"]:
                correction_attempts += 1
                context = json.dumps(
                    {"plan": plan.model_dump(), "validation_errors": result["errors"]},
                    ensure_ascii=False,
                )
                plan = provider.generate(prompt, context, deadline=provider_deadline)
                result = validate_plan(plan)
            if result["valid"]:
                return plan, result, correction_attempts
            errors.append(
                f"{provider_name}: generated plan still failed semantic validation after correction: "
                + "; ".join(result["errors"][:5])
            )
        except (LLMGenerationError, LLMUnavailable) as exc:
            errors.append(f"{provider_name}: {exc}")
            logger.warning("%s provider could not produce a validated plan; trying next configured provider", provider_name)
    details = " | ".join(errors)
    if len(providers) > 1:
        raise LLMGenerationError("All configured lesson-generation providers failed. " + details)
    raise LLMGenerationError(details or "No configured provider could generate a validated lesson.")


def generate_valid_plan(prompt: str) -> tuple[AnimationPlan, dict, int]:
    demo_plan = deterministic_topic_demo(prompt)
    if demo_plan is not None:
        validation = validate_plan(demo_plan)
        if not validation["valid"]:
            raise ValueError("The deterministic lesson did not pass its semantic checks: " + "; ".join(validation["errors"]))
        return demo_plan, validation, 0

    deadline = time.monotonic() + MAX_GENERATION_SECONDS
    providers = _configured_providers()
    return _generate_validated_with_fallback(providers, prompt, deadline)
