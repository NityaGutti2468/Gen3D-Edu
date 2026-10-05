"""Small JSON Schema accepted by Gemini's structured-output endpoint.

The Pydantic AnimationPlan remains the authoritative validation model. This
wire schema intentionally uses only plain objects, arrays, scalar types,
enums, properties, and required lists; Pydantic applies the tighter local
constraints after the model returns.
"""


def _object(properties: dict, required: list[str] | None = None) -> dict:
    schema = {"type": "object", "properties": properties, "additionalProperties": False}
    if required:
        schema["required"] = required
    return schema


def _vector() -> dict:
    return _object({"x": {"type": "number"}, "y": {"type": "number"}, "z": {"type": "number"}})


def build_gemini_schema() -> dict:
    vector = _vector()
    object_properties = _object({
        "position": vector,
        "rotation": vector,
        "scale": vector,
        "values": {"type": "array", "items": {"type": "string"}},
        "spacing": {"type": "number"},
        "cell_size": {"type": "number"},
        "index": {"type": "integer"},
        "direction": {"type": "string"},
        "content": {"type": "string"},
        "font_size": {"type": "number"},
        "value": {"type": "string"},
        "source_id": {"type": "string"},
        "target_id": {"type": "string"},
    })
    action_parameters = _object({
        "index": {"type": "integer"},
        "value": {"type": "string"},
        "position": vector,
        "rotation": vector,
        "scale": vector,
        "duration_ms": {"type": "integer"},
        "text": {"type": "string"},
        "range_start": {"type": "integer"},
        "range_end": {"type": "integer"},
        "direction": {"type": "string"},
        "target_id": {"type": "string"},
    })
    action = _object({
        "action": {"type": "string", "enum": [
            "create", "remove", "show", "hide", "move", "rotate", "scale",
            "highlight", "focus", "compare", "update_value", "connect", "disconnect", "wait",
        ]},
        "target": {"type": "string"},
        "parameters": action_parameters,
    }, ["action"])
    animation_object = _object({
        "id": {"type": "string"},
        "type": {"type": "string", "enum": [
            "array", "array_cell", "pointer", "text", "node", "graph", "edge",
            "shape", "label", "equation", "chart",
        ]},
        "label": {"type": "string"},
        "properties": object_properties,
    }, ["id", "type", "label"])
    step = _object({
        "step": {"type": "integer"},
        "title": {"type": "string"},
        "explanation": {"type": "string"},
        "actions": {"type": "array", "items": action},
    }, ["step", "title", "explanation", "actions"])
    return _object({
        "concept": {"type": "string"},
        "domain": {"type": "string"},
        "learning_objective": {"type": "string"},
        "objects": {"type": "array", "items": animation_object},
        "steps": {"type": "array", "items": step},
    }, ["concept", "domain", "learning_objective", "objects", "steps"])
