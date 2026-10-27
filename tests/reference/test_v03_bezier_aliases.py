"""Reject individual invented field aliases in a real TS proof export."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "v03_bezier_alias_verifier", Path(__file__).with_name("v03_bezier_verify.py")
)
verifier = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(verifier)


class BezierAliasTests(unittest.TestCase):
    def test_each_alias_is_rejected_when_replacing_or_adding_a_field(self):
        path = Path(__file__).parents[1] / "fixtures" / "v03-bezier-proof-actual.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(verifier.verify_bundle(document),
                         {"passed": True, "cases": 6, "leaves": 97, "samples": 103})
        locations = (
            (("cases", 0, "input"), "controls", "controls4x3Rat"),
            (("cases", 0, "input"), "tolerance", "toleranceRat"),
            (("cases", 0, "result"), "maxUpperSquared", "maxUpperSquaredRat"),
            (("cases", 0, "result", "samples", 0), "point", "point3Rat"),
            (("cases", 0, "result", "leaves", 0), "controls", "controls4x3Rat"),
            (("cases", 0, "result", "leaves", 0), "upperSquared", "upperSquaredRat"),
        )
        for location, canonical, alias in locations:
            for mode in ("replace", "add"):
                with self.subTest(location=location, canonical=canonical, mode=mode):
                    modified = copy.deepcopy(document)
                    target = modified
                    for key in location:
                        target = target[key]
                    value = target.pop(canonical) if mode == "replace" else target[canonical]
                    target[alias] = value
                    with self.assertRaises((TypeError, ValueError)):
                        verifier.verify_bundle(modified)


if __name__ == "__main__":
    unittest.main()
