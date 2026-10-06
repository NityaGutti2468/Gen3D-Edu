from app.schemas.animation import ActionType, AnimationPlan, ObjectType

TARGETLESS_ACTIONS = {ActionType.wait}


def validate_plan(plan: AnimationPlan) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    ids = [obj.id for obj in plan.objects]
    known = set(ids)
    if len(known) != len(ids):
        errors.append("Object IDs must be unique.")
    arrays = [obj for obj in plan.objects if obj.type == ObjectType.array]
    for obj in arrays:
        if not obj.properties.values:
            errors.append(f"Array '{obj.id}' must define values.")
    for obj in plan.objects:
        if obj.type == ObjectType.pointer and obj.properties.index is None:
            errors.append(f"Pointer '{obj.id}' must define an index.")
        for endpoint in (obj.properties.source_id, obj.properties.target_id):
            if endpoint and endpoint not in known:
                errors.append(f"Object '{obj.id}' references missing object '{endpoint}'.")

    for expected, step in enumerate(plan.steps, 1):
        if step.step != expected:
            errors.append(f"Step numbering must be sequential: expected {expected}, got {step.step}.")
        if not step.actions:
            errors.append(f"Step {expected} must include actions.")
        for act in step.actions:
            p = act.parameters
            if act.action not in TARGETLESS_ACTIONS and not act.target:
                errors.append(f"Step {expected}: action '{act.action.value}' requires a target.")
            if act.target and act.target not in known:
                errors.append(f"Step {expected}: target '{act.target}' does not exist.")
            if act.action in {ActionType.connect, ActionType.disconnect} and (not p.target_id or p.target_id not in known):
                errors.append(f"Step {expected}: {act.action.value} requires parameters.target_id referencing an existing object.")
            if act.action == ActionType.update_value and p.value is None:
                errors.append(f"Step {expected}: update_value requires parameters.value.")
            if act.action == ActionType.move:
                target_object = next((obj for obj in plan.objects if obj.id == act.target), None)
                if target_object is not None and target_object.type == ObjectType.pointer:
                    if p.index is None:
                        errors.append(f"Step {expected}: pointer move requires parameters.index so its array marker can move.")
                elif p.position is None:
                    errors.append(f"Step {expected}: move requires parameters.position.")
            if act.action == ActionType.wait and p.duration_ms is None:
                warnings.append(f"Step {expected}: wait has no duration_ms; renderer uses a short pause.")
            if p.index is not None and arrays and any(p.index >= len(a.properties.values or []) for a in arrays):
                errors.append(f"Step {expected}: index {p.index} is outside the array bounds.")
            if p.range_start is not None or p.range_end is not None:
                if p.range_start is None or p.range_end is None or p.range_start > p.range_end:
                    errors.append(f"Step {expected}: range_start and range_end must form a valid range.")
                elif not arrays:
                    errors.append(f"Step {expected}: array range specified, but there is no array object.")
                elif any(p.range_end >= len(a.properties.values or []) for a in arrays):
                    errors.append(f"Step {expected}: array range is outside the array bounds.")
    return {"valid": not errors, "errors": errors, "warnings": warnings}
