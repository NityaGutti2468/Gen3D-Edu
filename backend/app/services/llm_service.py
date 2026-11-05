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

SYSTEM_INSTRUCTION = """You are an educational animation planner for a broad range of subjects. Return only an AnimationPlan matching the JSON schema, with 3–8 clear teaching steps. First identify what the learner should understand, then select visual objects that naturally fit the topic. Use arrays and pointers only for array-like ideas; use nodes and edges for relationships or processes; use equations and shapes for mathematics and physics; use charts for quantities and comparisons; use labelled shapes, nodes, and concise text for biology, chemistry, geography, history, language, and other subjects. Always set render_mode to 3d for every topic so every generated lesson opens as an interactive 3D scene; the learner can switch to the 2D view in the player controls. Specify scene.camera_position and scene.camera_target for every plan. Give every visual object its existing concise human-readable label plus a supported geometry enum, position, rotation in degrees, positive scale, and structured material (color, roughness, metalness, opacity). Positions use world coordinates; scale values are positive multipliers. Give 3D edges geometry=line, valid source_id/target_id endpoints, and the same explicit transform/material fields. Each step action mutates only the named object's structured state: move replaces position, rotate replaces rotation in degrees, scale replaces scale, set_geometry replaces the geometry enum, and set_material replaces the material object; create/show and remove/hide control visibility. Provide the full values needed by each action. Never emit shader code, scripts, expressions, or arbitrary Blender code. For sliding-window algorithm lessons, show one fixed array with 7–9 values, not a four-item toy array. Create distinct left/start and right/end pointer objects initialized to the correct indices. In every step, highlight the current window using range_start and range_end; when it slides, move the pointers with the new index values so the visible boundaries advance. Explain the current window contents and update the running sum/count when relevant. Do not repeat the same range and pointer positions across steps unless the algorithm truly holds them. Keep array indices zero-based and within bounds. For computer networking lessons, build a clear packet journey: use a small set of device nodes (such as client, switch/router, and server) arranged in communication order; represent each important transmission as a directed edge whose label names the actual packet/message (for example SYN, SYN-ACK, ACK, DNS query, or Ethernet frame). Add only a few short notes for essential details such as ports or layer changes. Never create separate duplicate labels for devices or packets. Each step should focus on one event, highlight its relevant edge/device, and explain what is sent, where it goes, and why. Keep diagram labels concise and specific, avoid overlapping or decorative filler, and make the visual agree with the explanation. Each step must explain the idea and include actions that visibly advance it. Prefer several small, meaningful objects over one large block of text. Use only supported semantic object types and actions. Every target and object endpoint must reference an existing object ID. Keep all array indices and ranges in bounds. For a question outside an academic subject, provide a concise explanatory lesson using text, label, and shape objects rather than refusing."""


class LLMUnavailable(Exception):
    pass


class LLMGenerationError(Exception):
    pass


class GeminiPlanService:
    def __init__(self):
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key or key == "replace_with_your_key":
            raise LLMUnavailable("Gemini is not configured. Add GEMINI_API_KEY to backend/.env and restart the API.")
        # Bound each provider call and disable the SDK's multi-minute retry
        # backoff. The service owns a single end-to-end budget across fallbacks.
        self.api_key = key
        self.request_timeout_ms = int(os.getenv("GEMINI_REQUEST_TIMEOUT_MS", "12000"))
        self.max_model_attempts = max(1, int(os.getenv("GEMINI_MAX_MODEL_ATTEMPTS", "3")))
        self.client = self._make_client(self.request_timeout_ms)
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        fallback_models = os.getenv("GEMINI_FALLBACK_MODELS", "")
        if fallback_models.strip():
            self.fallback_models = [model.strip() for model in fallback_models.split(",") if model.strip()]
        else:
            legacy_fallback = os.getenv(
                "GEMINI_FALLBACK_MODEL",
                "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite",
            )
            self.fallback_models = [model.strip() for model in legacy_fallback.split(",") if model.strip()]
        model_order = list(dict.fromkeys([self.model, *self.fallback_models]))[: self.max_model_attempts]
        logger.info("Gemini model attempts (max=%s): %s", self.max_model_attempts, " -> ".join(model_order))

    def _make_client(self, timeout_ms: int):
        return genai.Client(
            api_key=self.api_key,
            http_options=types.HttpOptions(
                timeout=max(1000, timeout_ms),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )

    def generate(
        self,
        prompt: str,
        correction_context: str | None = None,
        deadline: float | None = None,
    ) -> AnimationPlan:
        contents = prompt
        if correction_context:
            contents += "\n\nCorrect this invalid plan, preserve educational intent, and fix every validator error. Return only the corrected AnimationPlan:\n" + correction_context
        try:
            response = None
            model_candidates = list(dict.fromkeys([self.model, *self.fallback_models]))[: self.max_model_attempts]
            for index, model in enumerate(model_candidates):
                remaining_ms = int((deadline - time.monotonic()) * 1000) if deadline is not None else None
                if remaining_ms is not None and remaining_ms <= 0:
                    raise LLMGenerationError(
                        "Gemini's allotted time expired while trying its configured model fallbacks. "
                        "The request will be handed to the backup provider if one is configured."
                    )
                try:
                    logger.info("Requesting Gemini model %s", model)
                    call_client = self.client
                    if remaining_ms is not None and remaining_ms < self.request_timeout_ms:
                        call_client = self._make_client(remaining_ms)
                    response = call_client.models.generate_content(
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
                    error_code = getattr(exc, "code", None)
                    model_not_found = error_code == 404 or "NOT_FOUND" in detail
                    temporarily_unavailable = error_code == 503 or "UNAVAILABLE" in detail
                    deadline_exceeded = (
                        error_code in (408, 504)
                        or "DEADLINE_EXCEEDED" in detail
                        or "timed out" in detail.lower()
                    )
                    transient_network = (
                        type(exc).__name__ in {
                            "RemoteProtocolError",
                            "ConnectError",
                            "ReadError",
                            "WriteError",
                            "PoolTimeout",
                            "ConnectTimeout",
                            "ReadTimeout",
                            "WriteTimeout",
                            "TimeoutException",
                        }
                        or "server disconnected without sending a response" in detail.lower()
                    )
                    if (model_not_found or temporarily_unavailable or deadline_exceeded or transient_network) and index + 1 < len(model_candidates):
                        reason = (
                            "model not found" if model_not_found
                            else "temporarily unavailable" if temporarily_unavailable
                            else "deadline exceeded" if deadline_exceeded
                            else "connection interrupted"
                        )
                        logger.warning(
                            "Gemini model %s request %s (provider code %s); retrying with %s",
                            model,
                            reason,
                            error_code or "unknown",
                            model_candidates[index + 1],
                        )
                        if deadline is None or deadline - time.monotonic() > 1:
                            time.sleep(1)
                        continue
                    if temporarily_unavailable:
                        raise LLMGenerationError(
                            "Gemini is temporarily at capacity (503) across the configured models. "
                            "This is a provider availability issue, not evidence that the API key is invalid. "
                            "Wait briefly and retry; if it continues, choose a model available to your key in Google AI Studio."
                        ) from exc
                    if model_not_found:
                        raise LLMGenerationError(
                            "None of the configured Gemini model IDs was found for this API key. "
                            "Check backend/.env and use model IDs listed for your key in Google AI Studio."
                        ) from exc
                    if transient_network:
                        raise LLMGenerationError(
                            "The connection to Gemini was interrupted while generating this lesson. "
                            "Check your internet connection and submit the prompt again."
                        ) from exc
                    if deadline_exceeded:
                        raise LLMGenerationError(
                            "Gemini took too long to generate this lesson across the configured models. "
                            "Wait briefly and try again, or choose a currently responsive model in backend/.env."
                        ) from exc
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
            logger.exception("Gemini plan generation failed (model=%s)", model)
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
