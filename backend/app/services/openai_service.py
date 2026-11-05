import logging
import os
import re
import time

from pydantic import ValidationError

from app.schemas.animation import AnimationPlan
from app.services.llm_service import LLMGenerationError, LLMUnavailable, SYSTEM_INSTRUCTION

logger = logging.getLogger(__name__)


class OpenAIPlanService:
    """Structured-output backup provider. It returns the same validated plan type as Gemini."""

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not self.api_key or self.api_key == "replace_with_your_key":
            raise LLMUnavailable("OpenAI backup is not configured.")
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LLMUnavailable("OpenAI backup package is missing. Run python -m pip install -r requirements.txt.") from exc

        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        self.request_timeout = max(1.0, int(os.getenv("OPENAI_REQUEST_TIMEOUT_MS", "20000")) / 1000)
        self.client = OpenAI(api_key=self.api_key, timeout=self.request_timeout, max_retries=0)

    def generate(self, prompt: str, correction_context: str | None = None, deadline: float | None = None) -> AnimationPlan:
        user_content = prompt
        if correction_context:
            user_content += "\n\nCorrect this invalid plan, preserve educational intent, and fix every validator error. Return only the corrected AnimationPlan:\n" + correction_context
        timeout = self.request_timeout
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0.5:
                raise LLMGenerationError("The shared lesson-generation time budget expired before OpenAI could respond.")
            timeout = min(timeout, remaining)
        try:
            logger.info("Requesting OpenAI model %s for structured AnimationPlan output", self.model)
            response = self.client.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_INSTRUCTION},
                    {"role": "user", "content": user_content},
                ],
                response_format=AnimationPlan,
                timeout=timeout,
            )
            message = response.choices[0].message
            if getattr(message, "refusal", None):
                raise LLMGenerationError("OpenAI declined this prompt. Rephrase it as an educational concept or process.")
            if message.parsed is not None:
                return message.parsed
            if message.content:
                return AnimationPlan.model_validate_json(message.content)
            raise LLMGenerationError("OpenAI returned no structured animation plan. Try rephrasing the prompt.")
        except LLMGenerationError:
            raise
        except ValidationError as exc:
            issues = [f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in exc.errors()[:3]]
            raise LLMGenerationError("OpenAI returned a plan that did not match the AnimationPlan schema: " + "; ".join(issues)) from exc
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            detail = str(exc).replace(self.api_key, "[redacted]")
            detail = re.sub(r"sk-[A-Za-z0-9_-]{16,}", "[redacted]", detail)[:240]
            logger.warning("OpenAI plan generation failed (model=%s, status=%s): %s", self.model, status, detail)
            if status in (401, 403):
                message = "OpenAI rejected the configured key or model access. Check OPENAI_API_KEY and OPENAI_MODEL in backend/.env."
            elif status == 429:
                message = "OpenAI rate limit or quota reached. Check the OpenAI project billing and usage, then retry."
            elif (status is not None and status >= 500) or "timeout" in type(exc).__name__.lower():
                message = "OpenAI is temporarily unavailable or timed out. Wait briefly and retry."
            elif status == 400:
                message = "OpenAI rejected the structured-output request. Check that the selected model supports structured outputs. Provider detail: " + detail
            else:
                message = "OpenAI request failed. Provider detail: " + (detail or type(exc).__name__)
            raise LLMGenerationError(message) from exc
