import os
import logging
import re
import time

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.schemas.animation import AnimationPlan
from app.schemas.gemini_output import build_gemini_schema

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are an educational animation planner for a broad range of subjects. Return only an AnimationPlan matching the JSON schema, with 3–8 clear teaching steps. First identify what the learner should understand, then select visual objects that naturally fit the topic. Use arrays and pointers only for array-like ideas; use nodes and edges for relationships or processes; use equations and shapes for mathematics and physics; use charts for quantities and comparisons; use labelled shapes, nodes, and concise text for biology, chemistry, geography, history, language, and other subjects. For sliding-window algorithm lessons, show one fixed array with 7–9 values, not a four-item toy array. Create distinct left/start and right/end pointer objects initialized to the correct indices. In every step, highlight the current window using range_start and range_end; when it slides, move the pointers with the new index values so the visible boundaries advance. Explain the current window contents and update the running sum/count when relevant. Do not repeat the same range and pointer positions across steps unless the algorithm truly holds them. Keep array indices zero-based and within bounds. For computer networking lessons, build a clear packet journey: use a small set of device nodes (such as client, switch/router, and server) arranged in communication order; represent each important transmission as a directed edge whose label names the actual packet/message (for example SYN, SYN-ACK, ACK, DNS query, or Ethernet frame). Add only a few short notes for essential details such as ports or layer changes. Never create separate duplicate labels for devices or packets. Each step should focus on one event, highlight its relevant edge/device, and explain what is sent, where it goes, and why. Keep diagram labels concise and specific, avoid overlapping or decorative filler, and make the visual agree with the explanation. Each step must explain the idea and include actions that visibly advance it. Prefer several small, meaningful objects over one large block of text. Use only supported semantic object types and actions. Never output code or renderer instructions. Every target and object endpoint must reference an existing object ID. Keep all array indices and ranges in bounds. For a question outside an academic subject, provide a concise explanatory lesson using text, label, and shape objects rather than refusing."""


class LLMUnavailable(Exception):
    pass


class LLMGenerationError(Exception):
    pass


class GeminiPlanService:
    def __init__(self):
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key or key == "replace_with_your_key":
            raise LLMUnavailable("Gemini is not configured. Add GEMINI_API_KEY to backend/.env and restart the API.")
        self.client = genai.Client(api_key=key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        fallback_models = os.getenv("GEMINI_FALLBACK_MODELS", "")
        if fallback_models.strip():
            self.fallback_models = [model.strip() for model in fallback_models.split(",") if model.strip()]
        else:
            legacy_fallback = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash")
            self.fallback_models = [model.strip() for model in legacy_fallback.split(",") if model.strip()]
        logger.info("Gemini model order: %s", " -> ".join(dict.fromkeys([self.model, *self.fallback_models])))

    def generate(self, prompt: str, correction_context: str | None = None) -> AnimationPlan:
        contents = prompt
        if correction_context:
            contents += "\n\nCorrect this invalid plan, preserve educational intent, and fix every validator error. Return only the corrected AnimationPlan:\n" + correction_context
        try:
            response = None
            model_candidates = list(dict.fromkeys([self.model, *self.fallback_models]))
            for index, model in enumerate(model_candidates):
                try:
                    logger.info("Requesting Gemini model %s", model)
                    response = self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=SYSTEM_INSTRUCTION,
                            response_mime_type="application/json",
                            response_json_schema=build_gemini_schema(),
                        ),
                    )
                    break
                except Exception as exc:
                    detail = str(exc)
                    unavailable = getattr(exc, "code", None) == 503 or "UNAVAILABLE" in detail
                    if unavailable and index + 1 < len(model_candidates):
                        logger.warning("Gemini model %s is unavailable; retrying with fallback %s", model, model_candidates[index + 1])
                        time.sleep(1)
                        continue
                    if unavailable:
                        raise LLMGenerationError("Gemini models are temporarily at capacity. Wait a minute and submit the prompt again.") from exc
                    raise
            if not response.text:
                block_reason = getattr(getattr(response, "prompt_feedback", None), "block_reason", None)
                reason = f" Safety/block reason: {block_reason}." if block_reason else ""
                raise LLMGenerationError("Gemini returned no plan." + reason + " Try rephrasing the prompt.")
            try:
                return AnimationPlan.model_validate_json(response.text)
            except ValidationError as exc:
                problems = [f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}" for issue in exc.errors()[:3]]
                raise LLMGenerationError("Gemini returned a plan that did not match the AnimationPlan schema: " + "; ".join(problems)) from exc
        except LLMGenerationError:
            raise
        except Exception as exc:
            logger.exception("Gemini plan generation failed (model=%s)", self.model)
            detail = str(exc).replace(os.getenv("GEMINI_API_KEY", "__no_key__"), "[redacted]")
            detail = re.sub(r"AIza[0-9A-Za-z_-]{20,}", "[redacted]", detail)[:320]
            code = getattr(exc, "code", None)
            if code == 429 or "RESOURCE_EXHAUSTED" in detail or "quota" in detail.lower():
                message = "Gemini quota/rate limit reached. Check API usage and billing, then retry."
            elif code in (401, 403) or "PERMISSION_DENIED" in detail or "API_KEY_INVALID" in detail:
                message = "Gemini rejected this key or model access. Check backend/.env and choose a model available to your key."
            elif code == 404 or "NOT_FOUND" in detail:
                message = f"Gemini model '{self.model}' was not found or is unavailable to this key. Set GEMINI_MODEL in backend/.env to an available model."
            elif code == 400 or "INVALID_ARGUMENT" in detail:
                message = "Gemini rejected the structured-output request. Check that the configured model supports structured output. Provider detail: " + detail
            else:
                message = "Gemini request failed. Provider detail: " + (detail or type(exc).__name__)
            raise LLMGenerationError(message) from exc
