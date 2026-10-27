"""Integration coverage of existing behavior on an untouched real TS export."""
import copy
from fractions import Fraction
import json
from pathlib import Path
import unittest
import v03_bezier_verify as approximation
import v03_face_cubic_verify as containment


def real_bundle():
    path = Path(__file__).parents[1] / "fixtures" / "v03-face-cubic-proof-actual.json"
    return json.loads(path.read_text(encoding="utf-8"))


def old_projection(document):
    return {"format": "OrthoSculptBezierProof", "version": 1, "cases": [
        {"id": case["id"], "input": {"controls": case["containment"]["controls"],
          "tolerance": case["tolerance"]}, "result": case["approximation"]}
        for case in document["cases"]]}


class ActualFaceCubicInteropTests(unittest.TestCase):
    def test_untouched_actual_ts_export_passes_complete_composed_verification(self):
        document = real_bundle()
        before = copy.deepcopy(document)
        self.assertEqual(containment.verify_bundle(document),
                         {"passed": True, "cases": 6, "leaves": 21, "samples": 27})
        self.assertEqual(document, before)

    def test_canonical_weight_mutant_fails_containment_while_approximation_passes(self):
        document = real_bundle()
        case = next(case for case in document["cases"] if case["id"] == "nonaxis-curved")
        self.assertEqual(case["containment"]["barycentricControls"][1],
                         [{"n": "1", "d": "2"}, {"n": "1", "d": "3"}, {"n": "1", "d": "6"}])
        case["containment"]["barycentricControls"][1] = [
            {"n": "1", "d": "3"}, {"n": "1", "d": "2"}, {"n": "1", "d": "6"}]
        self.assertEqual(sum(Fraction(int(v["n"]), int(v["d"]))
                             for v in case["containment"]["barycentricControls"][1]), 1)
        self.assertTrue(approximation.verify_bundle(old_projection(document))["passed"])
        with self.assertRaises(ValueError):
            containment.verify_bundle(document)

    def test_canonical_offplane_mutant_fails_despite_valid_approximation_and_same_xy(self):
        document = real_bundle()
        case = next(case for case in document["cases"] if case["id"] == "nonaxis-curved")
        points = list(case["containment"]["controls"])
        for leaf in case["approximation"]["leaves"]:
            points.extend(leaf["controls"])
        points.extend(sample["point"] for sample in case["approximation"]["samples"])
        for point in points:
            z = point[2]
            shifted = Fraction(int(z["n"]), int(z["d"])) + Fraction(1, 997)
            point[2] = {"n": str(shifted.numerator), "d": str(shifted.denominator)}
        self.assertTrue(approximation.verify_bundle(old_projection(document))["passed"])
        with self.assertRaises(ValueError):
            containment.verify_bundle(document)


if __name__ == "__main__":
    unittest.main()
