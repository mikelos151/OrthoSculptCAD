"""Strict interoperability regression using an untouched, real TS sampler export."""
from pathlib import Path
import importlib.util
import json
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "v03_bezier_interop_verifier", Path(__file__).with_name("v03_bezier_verify.py")
)
verifier = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(verifier)


class ActualTypeScriptInteropTests(unittest.TestCase):
    def test_untouched_real_ts_export_matches_frozen_contract_not_invented_aliases(self):
        path = Path(__file__).parents[1] / "fixtures" / "v03-bezier-proof-actual.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(set(document["cases"][0]["input"]), {"controls", "tolerance"})
        failure = None
        result = None
        try:
            result = verifier.verify_bundle(document)
        except (TypeError, ValueError) as error:
            failure = str(error)
        self.assertIsNone(failure, "Untouched actual TS export was rejected: " + str(failure))
        self.assertEqual(result, {"passed": True, "cases": 6, "leaves": 97, "samples": 103})

        aliases = {"controls": "controls4x3Rat", "tolerance": "toleranceRat",
                   "point": "point3Rat", "upperSquared": "upperSquaredRat",
                   "maxUpperSquared": "maxUpperSquaredRat"}

        def rename_copy(value):
            if type(value) is list:
                return [rename_copy(item) for item in value]
            if type(value) is dict:
                return {aliases.get(key, key): rename_copy(item) for key, item in value.items()}
            return value

        with self.assertRaises((TypeError, ValueError)):
            verifier.verify_bundle(rename_copy(document))
        self.assertEqual(set(document["cases"][0]["input"]), {"controls", "tolerance"})


if __name__ == "__main__":
    unittest.main()
