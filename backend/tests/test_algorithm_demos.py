import math
import unittest

from app.services.algorithm_demos import deterministic_topic_demo
from app.validators.animation_validator import validate_plan


class AlgorithmDemoTests(unittest.TestCase):
    def make_plan(self, prompt):
        plan = deterministic_topic_demo(prompt)
        self.assertIsNotNone(plan)
        result = validate_plan(plan)
        self.assertTrue(result["valid"], result["errors"])
        return plan

    def test_binary_search_varied_array_and_missing_target(self):
        found = self.make_plan("Binary search for target 6 in [1, 3, 6, 9, 12].")
        self.assertEqual(found.steps[0].actions[-1].parameters.index, 2)

        missing = self.make_plan("Binary search for target 7 in [1, 3, 6, 9, 12].")
        compared = [
            action.parameters.index
            for step in missing.steps
            for action in step.actions
            if action.action.value == "compare"
        ]
        self.assertEqual(compared, [2, 3])
        self.assertIn("not found", missing.steps[-1].title.lower())

    def test_sliding_window_uses_prompt_array_and_size(self):
        plan = self.make_plan("Show fixed sliding window of length 2 over [4, 1, 7, 3], maximum sum.")
        ranges = [
            (action.parameters.range_start, action.parameters.range_end)
            for step in plan.steps
            for action in step.actions
            if action.parameters.range_start is not None
        ]
        self.assertEqual(ranges, [(0, 1), (1, 2), (2, 3)])
        self.assertIn("10", plan.steps[-1].explanation)

    def test_stack_respects_push_values_and_lifo_pops(self):
        plan = self.make_plan("Push 4, 9, and 12 onto a stack, then pop one item.")
        popped = [
            action.target
            for step in plan.steps
            for action in step.actions
            if action.action.value == "remove"
        ]
        self.assertEqual(popped, ["item_2"])
        self.assertEqual([step.title for step in plan.steps], ["Push 4", "Push 9", "Push 12", "Pop 12"])

    def test_tcp_sequence_numbers_follow_prompt(self):
        plan = self.make_plan("Show TCP handshake with client seq 42 and server seq 90.")
        labels = {obj.id: obj.label for obj in plan.objects}
        self.assertIn("seq 42", labels["syn"])
        self.assertIn("ack 43", labels["syn_ack"])
        self.assertIn("seq 90", labels["syn_ack"])
        self.assertIn("ack 91", labels["ack"])

    def test_tcp_sequence_number_wraps_at_protocol_limit(self):
        plan = self.make_plan("Show TCP handshake with client seq 4294967295 and server seq 4294967295.")
        labels = {obj.id: obj.label for obj in plan.objects}
        self.assertIn("ack 0", labels["syn_ack"])
        self.assertIn("ack 0", labels["ack"])

    def test_refraction_uses_snells_law_for_supplied_media_and_angle(self):
        plan = self.make_plan("Show light refracting from glass into water at 30 degrees.")
        surface = next(obj for obj in plan.objects if obj.id == "surface")
        incident = next(obj for obj in plan.objects if obj.id == "incident")
        refracted = next(obj for obj in plan.objects if obj.id == "refracted")
        _, n1, _, n2 = surface.properties.content.split("|")
        expected = math.degrees(math.asin(float(n1) / float(n2) * math.sin(math.radians(float(incident.properties.content)))))
        self.assertAlmostEqual(float(refracted.properties.content), expected, places=1)

    def test_total_internal_reflection_is_identified(self):
        plan = self.make_plan("Show light refraction from glass into air at 60 degrees, n1=1.5 and n2=1.0.")
        refracted = next(obj for obj in plan.objects if obj.id == "refracted")
        self.assertEqual(refracted.properties.content, "TIR")

    def test_refraction_parses_degree_symbol(self):
        plan = self.make_plan("Show light refraction from air into water at 30°.")
        incident = next(obj for obj in plan.objects if obj.id == "incident")
        self.assertEqual(incident.properties.content, "30.0")


if __name__ == "__main__":
    unittest.main()
