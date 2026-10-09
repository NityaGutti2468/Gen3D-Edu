import math
import re

from app.schemas.animation import AnimationPlan


def deterministic_topic_demo(prompt: str) -> AnimationPlan | None:
    normalized = re.sub(r"[^a-z0-9]+", " ", prompt.lower()).strip()
    if "tcp" in normalized and ("handshake" in normalized or "syn" in normalized):
        return tcp_handshake_demo(prompt)
    if any(word in normalized for word in ("light", "ray")) and any(word in normalized for word in ("refraction", "refract", "snell")):
        return refraction_demo(prompt)
    if "stack" in normalized and any(word in normalized for word in ("push", "pop", "lifo", "data structure")):
        return stack_demo(prompt)
    if "binary search" in normalized:
        return binary_search_demo(prompt)
    return generic_sliding_window_demo(prompt)


def _integer_array(prompt: str, default: list[int]) -> list[int]:
    match = re.search(r"\[([^\]]+)\]", prompt)
    if not match:
        return default
    values = [int(value) for value in re.findall(r"-?\d+", match.group(1))]
    return values if 1 <= len(values) <= 40 else default


def binary_search_demo(prompt: str) -> AnimationPlan | None:
    values = _integer_array(prompt, [2, 5, 8, 12, 16, 23, 38])
    if values != sorted(values):
        return None
    target_match = re.search(r"\btarget\s*(?:value\s*)?(?:is|=|:)?\s*(-?\d+)", prompt, re.IGNORECASE)
    if not target_match:
        target_match = re.search(r"\b(?:find|search\s+for)\s+(-?\d+)", prompt, re.IGNORECASE)
    target = int(target_match.group(1)) if target_match else values[len(values) // 2]
    lo, hi = 0, len(values) - 1
    initial_mid = (lo + hi) // 2
    objects = [
        {"id": "sorted_values", "type": "array", "label": "Sorted Array", "properties": {"values": [str(value) for value in values]}},
        {"id": "low", "type": "pointer", "label": "Low", "properties": {"index": lo}},
        {"id": "high", "type": "pointer", "label": "High", "properties": {"index": hi}},
        {"id": "mid", "type": "pointer", "label": "Mid", "properties": {"index": initial_mid}},
        {"id": "target", "type": "text", "label": f"Target: {target}", "properties": {"content": f"Target = {target}"}},
    ]
    steps = []
    while lo <= hi:
        mid = (lo + hi) // 2
        value = values[mid]
        if value == target:
            explanation = f"The middle value is {value}, which equals the target. The search stops at index {mid}."
        elif value < target:
            explanation = f"The middle value {value} is below {target}. Discard indices {lo}–{mid}; continue from index {mid + 1}."
        else:
            explanation = f"The middle value {value} is above {target}. Discard indices {mid}–{hi}; continue through index {mid - 1}."
        steps.append({
            "step": len(steps) + 1,
            "title": f"Compare index {mid} · value {value}",
            "explanation": explanation,
            "actions": [
                {"action": "focus", "target": "sorted_values", "parameters": {"range_start": lo, "range_end": hi}},
                {"action": "focus", "target": "low", "parameters": {"index": lo}},
                {"action": "focus", "target": "high", "parameters": {"index": hi}},
                {"action": "focus", "target": "mid", "parameters": {"index": mid}},
                {"action": "compare", "target": "sorted_values", "parameters": {"index": mid}},
            ],
        })
        if value == target:
            break
        if value < target:
            lo = mid + 1
        else:
            hi = mid - 1
    if lo > hi:
        steps.append({
            "step": len(steps) + 1,
            "title": f"Target {target} not found",
            "explanation": f"The search range became empty, so {target} is not in this sorted array.",
            "actions": [{"action": "remove", "target": pointer} for pointer in ("low", "high", "mid")],
        })
    return AnimationPlan.model_validate({
        "concept": f"Binary Search · target {target}",
        "domain": "Computer Science · Algorithms",
        "learning_objective": "Find a value in a sorted array by halving the remaining search range.",
        "objects": objects,
        "steps": steps,
    })


def _sequence_number(prompt: str, role: str, default: int) -> int:
    match = re.search(
        rf"\b{role}\b.{{0,36}}?\b(?:isn|seq(?:uence)?(?:\s+number)?)\b\s*(?:is|=|:)?\s*(\d+)",
        prompt,
        re.IGNORECASE,
    )
    return int(match.group(1)) % (2**32) if match else default


def tcp_handshake_demo(prompt: str) -> AnimationPlan:
    client_isn = _sequence_number(prompt, "client", 1000)
    server_isn = _sequence_number(prompt, "server", 5000)
    objects = [
        {"id": "client", "type": "node", "label": "Client", "properties": {"position": {"x": 12, "y": 50}}},
        {"id": "server", "type": "node", "label": "Server", "properties": {"position": {"x": 88, "y": 50}}},
        {"id": "syn", "type": "edge", "label": f"1 · SYN · seq {client_isn}", "properties": {"source_id": "client", "target_id": "server"}},
        {"id": "syn_ack", "type": "edge", "label": f"2 · SYN-ACK · seq {server_isn}, ack {(client_isn + 1) % (2**32)}", "properties": {"source_id": "server", "target_id": "client"}},
        {"id": "ack", "type": "edge", "label": f"3 · ACK · ack {(server_isn + 1) % (2**32)}", "properties": {"source_id": "client", "target_id": "server"}},
    ]
    steps = [
        {"step": 1, "title": "Endpoints are ready", "explanation": "The client wants to open a reliable TCP connection with the server.", "actions": [{"action": "focus", "target": "client"}, {"action": "focus", "target": "server"}]},
        {"step": 2, "title": "1 · Client sends SYN", "explanation": f"The client sends SYN with sequence number {client_isn} to request a connection.", "actions": [{"action": "create", "target": "syn"}, {"action": "focus", "target": "client"}]},
        {"step": 3, "title": "2 · Server replies SYN-ACK", "explanation": f"The server acknowledges byte {(client_isn + 1) % (2**32)} and sends its own SYN with sequence number {server_isn}. The first packet remains visible.", "actions": [{"action": "create", "target": "syn_ack"}, {"action": "focus", "target": "server"}]},
        {"step": 4, "title": "3 · Client sends ACK", "explanation": f"The client acknowledges byte {(server_isn + 1) % (2**32)}. SYN, SYN-ACK, and ACK are all visible; the TCP connection is established.", "actions": [{"action": "create", "target": "ack"}, {"action": "focus", "target": "client"}]},
    ]
    return AnimationPlan.model_validate({
        "concept": "TCP Three-Way Handshake",
        "domain": "Computer Networking",
        "learning_objective": "Follow the three messages that establish a TCP connection.",
        "objects": objects,
        "steps": steps,
    })


def refraction_demo(prompt: str) -> AnimationPlan:
    media_match = re.search(r"\bfrom\s+([a-z][a-z-]*)\s+(?:to|into)\s+([a-z][a-z-]*)", prompt, re.IGNORECASE)
    medium_a, medium_b = (media_match.groups() if media_match else ("air", "water"))
    refractive_indices = {"vacuum": 1.0, "air": 1.0, "water": 1.33, "ice": 1.31, "acrylic": 1.49, "glass": 1.5, "diamond": 2.42}
    n1_match = re.search(r"\bn\s*1\s*(?:=|:)?\s*(\d+(?:\.\d+)?)", prompt, re.IGNORECASE)
    n2_match = re.search(r"\bn\s*2\s*(?:=|:)?\s*(\d+(?:\.\d+)?)", prompt, re.IGNORECASE)
    n1 = float(n1_match.group(1)) if n1_match else refractive_indices.get(medium_a.lower(), 1.0)
    n2 = float(n2_match.group(1)) if n2_match else refractive_indices.get(medium_b.lower(), 1.33)
    if n1 <= 0 or n2 <= 0:
        return None
    angle_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:°|degrees?|deg)(?![a-z])|\bangle\s*(?:of incidence\s*)?(?:is|=|of)?\s*(\d+(?:\.\d+)?)", prompt, re.IGNORECASE)
    incident_angle = float(next(value for value in angle_match.groups() if value is not None)) if angle_match else 45.0
    incident_angle = min(89.0, max(1.0, incident_angle))
    sine_out = n1 / n2 * math.sin(math.radians(incident_angle))
    total_internal_reflection = sine_out > 1
    refracted_angle = None if total_internal_reflection else math.degrees(math.asin(sine_out))
    surface_content = f"{medium_a}|{n1:.4f}|{medium_b}|{n2:.4f}"
    objects = [
        {"id": "surface", "type": "shape", "label": f"{medium_a}–{medium_b} boundary", "properties": {"content": surface_content}},
        {"id": "normal", "type": "shape", "label": "Normal line"},
        {"id": "incident", "type": "shape", "label": "Incident ray", "properties": {"content": f"{incident_angle:.1f}"}},
        {"id": "refracted", "type": "shape", "label": "Refracted ray", "properties": {"content": "TIR" if total_internal_reflection else f"{refracted_angle:.1f}"}},
    ]
    refracted_explanation = (
        f"At {incident_angle:.1f}°, the ray undergoes total internal reflection because it travels from higher to lower refractive index."
        if total_internal_reflection else
        f"Snell’s law gives a refracted angle of {refracted_angle:.1f}° from the normal. The ray bends {'toward' if n2 > n1 else 'away from'} the normal."
    )
    incident_explanation = f"The ray reaches the boundary at an incidence angle of {incident_angle:.1f}° measured from the normal."
    steps = [
        {"step": 1, "title": "Two transparent media", "explanation": f"Light travels through {medium_a} (n = {n1:.2f}) toward {medium_b} (n = {n2:.2f}).", "actions": [{"action": "focus", "target": "surface"}]},
        {"step": 2, "title": "Draw the normal", "explanation": "The normal is perpendicular to the boundary. Angles of incidence and refraction are measured from this line.", "actions": [{"action": "focus", "target": "surface"}, {"action": "focus", "target": "normal"}]},
        {"step": 3, "title": "Incoming ray", "explanation": incident_explanation, "actions": [{"action": "focus", "target": "incident"}]},
        {"step": 4, "title": "Ray changes direction", "explanation": refracted_explanation, "actions": [{"action": "focus", "target": "incident"}, {"action": "focus", "target": "refracted"}]},
        {"step": 5, "title": "Compare the angles", "explanation": total_internal_reflection and "The ray reflects back into the original medium; there is no transmitted refracted ray." or f"The incidence angle is {incident_angle:.1f}° and the refracted angle is {refracted_angle:.1f}°.", "actions": [{"action": "focus", "target": "refracted"}]},
    ]
    return AnimationPlan.model_validate({
        "concept": f"Light Refraction: {medium_a.title()} to {medium_b.title()}",
        "domain": "Physics",
        "learning_objective": f"Apply Snell’s law to a ray entering {medium_b} from {medium_a}.",
        "objects": objects,
        "steps": steps,
    })


def stack_demo(prompt: str) -> AnimationPlan:
    words = {"one": 1, "once": 1, "two": 2, "twice": 2, "three": 3, "thrice": 3, "four": 4, "five": 5}
    operation_matches = list(re.finditer(r"\b(push(?:ing)?|pop(?:ping)?)\b", prompt, re.IGNORECASE))
    operations = []
    item_values = []
    for index, match in enumerate(operation_matches):
        segment = prompt[match.end():operation_matches[index + 1].start() if index + 1 < len(operation_matches) else len(prompt)]
        if match.group(1).lower().startswith("push"):
            pushed = re.findall(r"-?\d+", segment)
            for value in pushed:
                item_id = f"item_{len(item_values)}"
                item_values.append(value)
                operations.append(("push", value, item_id))
        else:
            quantity_match = re.search(r"\b(\d+|one|once|two|twice|three|thrice|four|five)\b", segment, re.IGNORECASE)
            quantity = int(quantity_match.group(1)) if quantity_match and quantity_match.group(1).isdigit() else words.get(quantity_match.group(1).lower(), 1) if quantity_match else 1
            operations.extend([("pop", None, None)] * min(quantity, 8))
    if not operations:
        item_values = ["3", "7", "2"]
        operations = [("push", value, f"item_{index}") for index, value in enumerate(item_values)] + [("pop", None, None)]
    operations = operations[:10]
    used_item_ids = {item_id for kind, _value, item_id in operations if kind == "push"}
    objects = [
        {"id": "stack_container", "type": "shape", "label": "Stack Container"},
        *[{"id": f"item_{index}", "type": "shape", "label": value} for index, value in enumerate(item_values) if f"item_{index}" in used_item_ids],
        {"id": "top_label", "type": "text", "label": "TOP", "properties": {"content": "Last in · first out"}},
    ]
    steps = []
    contents = []
    for kind, value, item_id in operations:
        if kind == "push":
            contents.append((value, item_id))
            explanation = f"Push {value} onto the stack. It is placed above the previous top, so {value} is now on top."
            actions = [{"action": "create", "target": item_id}, {"action": "focus", "target": item_id}]
            title = f"Push {value}"
        elif contents:
            removed, removed_id = contents.pop()
            explanation = f"Pop removes {removed}, the most recently pushed value."
            if contents:
                explanation += f" {contents[-1][0]} is now on top."
            else:
                explanation += " The stack is now empty."
            actions = [{"action": "remove", "target": removed_id}]
            actions.append({"action": "focus", "target": contents[-1][1] if contents else "stack_container"})
            title = f"Pop {removed}"
        else:
            explanation = "The stack is empty, so there is no item to pop."
            actions = [{"action": "focus", "target": "stack_container"}]
            title = "Pop from empty stack"
        steps.append({"step": len(steps) + 1, "title": title, "explanation": explanation, "actions": actions})
    return AnimationPlan.model_validate({
        "concept": "Stack Data Structure Operations",
        "domain": "Computer Science · Data Structures",
        "learning_objective": "Understand push and pop using the last-in, first-out rule.",
        "objects": objects,
        "steps": steps,
    })


def generic_sliding_window_demo(prompt: str) -> AnimationPlan | None:
    """Simulate every position of a parameterized fixed-size sliding window."""
    normalized = re.sub(r"[^a-z0-9]+", " ", prompt.lower()).strip()
    if "sliding window" not in normalized:
        return None

    # Variable-length substring/window problems need a different state machine.
    if re.search(r"\b(longest|shortest|substring|distinct|unique|at most|at least|exactly)\b", normalized):
        return None

    values = _integer_array(prompt, [2, 1, 5, 1, 3, 2, 9, 2])
    size_match = re.search(r"\b(?:window(?:\s+(?:size|length))?|k)\s*(?:of\s*)?(?:=|:)?\s*(\d+)\b", prompt, re.IGNORECASE)
    if not size_match:
        size_match = re.search(r"\bwindow\s+of\s+(?:size|length)\s+(\d+)\b", prompt, re.IGNORECASE)
    if not size_match:
        size_match = re.search(r"\b(?:window|subarray)\b.{0,16}\b(?:size|length)\s*(?:of|=|:)?\s*(\d+)\b", prompt, re.IGNORECASE)
    window_size = int(size_match.group(1)) if size_match else min(3, len(values))
    if not 1 <= window_size <= len(values):
        return None
    goal = "maximum" if re.search(r"\b(max(?:imum)?|largest)\b", normalized) else "minimum" if re.search(r"\b(min(?:imum)?|smallest)\b", normalized) else "sum"
    windows = [
        (start, start + window_size - 1)
        for start in range(len(values) - window_size + 1)
    ]
    best = None
    objects = [
        {
            "id": "numbers",
            "type": "array",
            "label": "Array",
            "properties": {"values": [str(value) for value in values]},
        },
        {
            "id": "left",
            "type": "pointer",
            "label": "Left",
            "properties": {"index": windows[0][0]},
        },
        {
            "id": "right",
            "type": "pointer",
            "label": "Right",
            "properties": {"index": windows[0][1]},
        },
    ]

    steps = []
    for step_number, (left, right) in enumerate(windows, start=1):
        window_values = values[left : right + 1]
        window_sum = sum(window_values)
        if best is None or (goal == "maximum" and window_sum > best) or (goal == "minimum" and window_sum < best):
            best = window_sum
        if step_number == 1:
            explanation = f"Start with indices {left}–{right}: {window_values}. The window contains {window_size} values and their sum is {window_sum}."
        elif step_number < len(windows):
            explanation = f"Slide both ends one place right to indices {left}–{right}: {window_values}. The window still contains {window_size} values; their sum is {window_sum}."
        else:
            explanation = f"The final window is indices {left}–{right}: {window_values}. Its sum is {window_sum}; there are no more values to include."
        if goal != "sum":
            explanation += f" Best {goal} sum seen so far: {best}."

        pointer_action = "focus" if step_number == 1 else "move"
        steps.append(
            {
                "step": step_number,
                "title": f"Window {step_number} of {len(windows)} · sum {window_sum}",
                "explanation": explanation,
                "actions": [
                    {
                        "action": "focus",
                        "target": "numbers",
                        "parameters": {"range_start": left, "range_end": right},
                    },
                    {
                        "action": pointer_action,
                        "target": "left",
                        "parameters": {"index": left},
                    },
                    {
                        "action": pointer_action,
                        "target": "right",
                        "parameters": {"index": right},
                    },
                ],
            }
        )

    return AnimationPlan.model_validate(
        {
            "concept": f"Sliding Window · Fixed-Size {goal.title()}",
            "domain": "Computer Science",
            "learning_objective": f"Track a window of {window_size} consecutive values and compute its {goal} sum as it moves across the array.",
            "objects": objects,
            "steps": steps,
        }
    )
