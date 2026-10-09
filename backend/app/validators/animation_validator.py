import math
import re

from app.schemas.animation import ActionType, AnimationPlan, ObjectType

TARGETLESS_ACTIONS = {ActionType.wait}


def _semantic_errors(plan: AnimationPlan) -> list[str]:
    errors: list[str] = []
    concept = plan.concept.casefold()
    objects = {obj.id: obj for obj in plan.objects}

    if concept.startswith("tcp three-way handshake"):
        endpoints = {obj.label.casefold(): obj.id for obj in plan.objects if obj.type == ObjectType.node}
        if "client" not in endpoints or "server" not in endpoints:
            errors.append("TCP handshake needs distinct Client and Server nodes.")
        expected = [("syn-ack", endpoints.get("server"), endpoints.get("client")), ("syn", endpoints.get("client"), endpoints.get("server")), ("ack", endpoints.get("client"), endpoints.get("server"))]
        # Check each packet by exact flag family; test SYN-ACK before SYN.
        packet_ids = {}
        for obj in plan.objects:
            if obj.type != ObjectType.edge:
                continue
            label = obj.label.casefold().replace("–", "-")
            if "syn-ack" in label:
                packet_ids["syn-ack"] = obj.id
            elif re.search(r"\bsyn\b", label):
                packet_ids["syn"] = obj.id
            elif re.search(r"\back\b", label):
                packet_ids["ack"] = obj.id
        if set(packet_ids) != {"syn", "syn-ack", "ack"}:
            errors.append("TCP handshake must contain separate SYN, SYN-ACK, and ACK packet edges.")
        elif all(name in endpoints for name in ("client", "server")):
            for name, source, target in expected:
                packet = objects[packet_ids[name]]
                if packet.properties.source_id != source or packet.properties.target_id != target:
                    errors.append(f"TCP {name.upper()} packet has the wrong direction.")
        if len(packet_ids) == 3:
            syn_label = objects[packet_ids["syn"]].label
            syn_ack_label = objects[packet_ids["syn-ack"]].label
            ack_label = objects[packet_ids["ack"]].label
            syn_seq = re.search(r"\bseq\s+(\d+)\b", syn_label, re.IGNORECASE)
            reply_seq = re.search(r"\bseq\s+(\d+)\b", syn_ack_label, re.IGNORECASE)
            reply_ack = re.search(r"\back\s+(\d+)\b", syn_ack_label, re.IGNORECASE)
            final_ack = re.search(r"\back\s+(\d+)\b", ack_label, re.IGNORECASE)
            if syn_seq and reply_seq and reply_ack and final_ack:
                if int(reply_ack.group(1)) != (int(syn_seq.group(1)) + 1) % (2**32) or int(final_ack.group(1)) != (int(reply_seq.group(1)) + 1) % (2**32):
                    errors.append("TCP handshake acknowledgment numbers must acknowledge the peer sequence number plus one.")
            intro_steps = []
            visible = {obj.id for obj in plan.objects if not any(a.target == obj.id and a.action == ActionType.create for step in plan.steps for a in step.actions)}
            for step in plan.steps:
                for action in step.actions:
                    if action.action in {ActionType.create, ActionType.show} and action.target in packet_ids.values():
                        if action.target not in intro_steps:
                            intro_steps.append(action.target)
                        visible.add(action.target)
                    elif action.action in {ActionType.remove, ActionType.hide}:
                        visible.discard(action.target)
            expected_order = [packet_ids[name] for name in ("syn", "syn-ack", "ack")]
            if intro_steps != expected_order:
                errors.append("TCP packet edges must appear in SYN, SYN-ACK, ACK order.")
            if not set(expected_order).issubset(visible):
                errors.append("The final TCP handshake frame must keep all three packet edges visible.")

    if concept.startswith("stack data structure operations"):
        stack_item_ids = {obj.id for obj in plan.objects if obj.type == ObjectType.shape and re.fullmatch(r"-?\d+(?:\.\d+)?", obj.label.strip())}
        if stack_item_ids:
            created_item_ids = {action.target for step in plan.steps for action in step.actions if action.action in {ActionType.create, ActionType.show} and action.target in stack_item_ids}
            if created_item_ids != stack_item_ids:
                errors.append("Each stack item must appear through a visible push action.")
            state: list[str] = []
            for step in plan.steps:
                for action in step.actions:
                    if action.target not in stack_item_ids:
                        continue
                    if action.action in {ActionType.create, ActionType.show}:
                        if action.target not in state:
                            state.append(action.target)
                    elif action.action in {ActionType.remove, ActionType.hide}:
                        if not state or state[-1] != action.target:
                            errors.append(f"Step {step.step}: stack pop must remove the current top item.")
                        elif state:
                            state.pop()

    if concept.startswith("sliding window · fixed-size"):
        array = next((obj for obj in plan.objects if obj.type == ObjectType.array), None)
        pointers = {}
        for obj in plan.objects:
            if obj.type == ObjectType.pointer:
                label = obj.label.casefold()
                if re.search(r"left|low|start|begin", label):
                    pointers[obj.id] = ["left", obj.properties.index]
                elif re.search(r"right|high|end", label):
                    pointers[obj.id] = ["right", obj.properties.index]
        previous_start = None
        window_size = None
        for step in plan.steps:
            current_range = None
            for action in step.actions:
                if action.action in {ActionType.move, ActionType.focus} and action.target in pointers and action.parameters.index is not None:
                    pointers[action.target][1] = action.parameters.index
                if action.parameters.range_start is not None and action.parameters.range_end is not None:
                    current_range = (action.parameters.range_start, action.parameters.range_end)
            if current_range:
                left, right = current_range
                if window_size is None:
                    window_size = right - left + 1
                elif right - left + 1 != window_size:
                    errors.append(f"Step {step.step}: fixed window size changed.")
                if previous_start is not None and left != previous_start + 1:
                    errors.append(f"Step {step.step}: fixed window must advance by exactly one index.")
                previous_start = left
                states_by_side = {side: index for side, index in pointers.values()}
                if states_by_side.get("left") != left or states_by_side.get("right") != right:
                    errors.append(f"Step {step.step}: pointer indices do not match the highlighted window.")
                if array and right >= len(array.properties.values or []):
                    errors.append(f"Step {step.step}: window extends past the array end.")

    if concept.startswith("binary search · target"):
        array = next((obj for obj in plan.objects if obj.type == ObjectType.array), None)
        target_match = re.search(r"target\s+(-?\d+)", plan.concept, re.IGNORECASE)
        if array and target_match:
            try:
                values = [int(value) for value in array.properties.values or []]
                target = int(target_match.group(1))
                low, high = 0, len(values) - 1
                expected_comparisons = []
                while low <= high:
                    middle = (low + high) // 2
                    expected_comparisons.append((middle, low, high))
                    if values[middle] == target:
                        break
                    if values[middle] < target:
                        low = middle + 1
                    else:
                        high = middle - 1
                actual_comparisons = []
                for step in plan.steps:
                    compared = next((action for action in step.actions if action.action == ActionType.compare and action.target == array.id), None)
                    if compared:
                        range_action = next((action for action in step.actions if action.parameters.range_start is not None), None)
                        actual_comparisons.append((compared.parameters.index, range_action.parameters.range_start if range_action else None, range_action.parameters.range_end if range_action else None))
                if actual_comparisons != expected_comparisons:
                    errors.append("Binary-search comparison indices and ranges do not match the sorted-array search simulation.")
            except (TypeError, ValueError):
                errors.append("Binary-search simulation requires an integer array and target.")

    if concept.startswith("light refraction:"):
        surface = objects.get("surface")
        incident = objects.get("incident")
        refracted = objects.get("refracted")
        if surface and incident and refracted and surface.properties.content and incident.properties.content and refracted.properties.content:
            try:
                _medium_a, n1_raw, _medium_b, n2_raw = surface.properties.content.split("|")
                n1, n2 = float(n1_raw), float(n2_raw)
                angle = float(incident.properties.content)
                ratio = n1 / n2 * math.sin(math.radians(angle))
                if ratio > 1:
                    if refracted.properties.content != "TIR":
                        errors.append("Refraction result should be total internal reflection for these values.")
                else:
                    expected_angle = math.degrees(math.asin(ratio))
                    actual_angle = float(refracted.properties.content)
                    if abs(expected_angle - actual_angle) > 0.15:
                        errors.append("Refracted angle does not satisfy Snell’s law for the supplied indices and incidence angle.")
            except (ValueError, TypeError):
                errors.append("Refraction plan is missing valid media indices or ray angles.")
        ray_steps = {}
        for step in plan.steps:
            for action in step.actions:
                if action.target in {"incident", "refracted"} and action.action in {ActionType.create, ActionType.show, ActionType.focus, ActionType.highlight}:
                    ray_steps.setdefault(action.target, step.step)
        if "incident" not in ray_steps or "refracted" not in ray_steps or ray_steps.get("refracted", 0) < ray_steps.get("incident", 0):
            errors.append("Refraction animation must show the incoming ray before the transmitted or reflected ray.")
    return errors


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
    errors.extend(_semantic_errors(plan))
    return {"valid": not errors, "errors": errors, "warnings": warnings}
