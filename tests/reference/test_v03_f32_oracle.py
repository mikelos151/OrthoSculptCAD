"""Synthetic arithmetic regression tests; no application or patient data."""
from fractions import Fraction
from pathlib import Path
import importlib.util
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

_SPEC = importlib.util.spec_from_file_location(
    "v03_f32_oracle", Path(__file__).with_name("v03_f32_oracle.py")
)
oracle = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(oracle)


class RoundingTests(unittest.TestCase):
    def test_direct_rounding_avoids_double_rounding(self):
        value = Fraction(1) + Fraction(1, 2**24) + Fraction(1, 2**200)
        self.assertEqual(oracle.round_fraction(value),
                         {"kind": "finite", "bits": 0x3F800001})

    def test_negative_values_and_signed_underflow(self):
        for value, bits in [(Fraction(-3, 2), 0xBFC00000),
                            (Fraction(-1, 2**151), 0x80000000),
                            (Fraction(0), 0)]:
            with self.subTest(value=value):
                self.assertEqual(oracle.round_fraction(value),
                                 {"kind": "finite", "bits": bits})

    def test_float64_path_is_a_known_counterexample_not_the_oracle(self):
        value = Fraction(1) + Fraction(1, 2**24) + Fraction(1, 2**200)
        via_f64 = struct.unpack(">I", struct.pack(">f", float(value)))[0]
        self.assertEqual(via_f64, 0x3F800000)
        self.assertNotEqual(oracle.round_fraction(value)["bits"], via_f64)

    def test_exact_overflow_threshold_both_signs(self):
        maximum = Fraction((2**24 - 1) * 2**104)
        threshold = Fraction(2**128 - 2**103)
        for sign in (1, -1):
            for value in (maximum, threshold - 1):
                with self.subTest(value=sign * value):
                    self.assertEqual(oracle.round_fraction(sign * value),
                                     {"kind": "finite", "bits": 0x7F7FFFFF |
                                      (0x80000000 if sign < 0 else 0)})
            for value in (threshold, threshold + 1, Fraction(2**129)):
                with self.subTest(value=sign * value):
                    self.assertEqual(oracle.round_fraction(sign * value),
                                     {"kind": "overflow"})

    def test_halfway_even_and_subnormal_normal_boundary(self):
        # Independent exact values, not values obtained from the decoder.
        samples = [(Fraction(1) + Fraction(1, 2**24), 0x3F800000),
                   (Fraction(1) + Fraction(3, 2**24), 0x3F800002),
                   (Fraction(1, 2**150), 0),
                   (Fraction(3, 2**150), 2),
                   (Fraction(1, 2**149), 1),
                   (Fraction(2**24 - 1, 2**150), 0x00800000),
                   (Fraction(2**23 - 1, 2**149), 0x007FFFFF),
                   (Fraction(1, 2**126), 0x00800000)]
        for value, bits in samples:
            for sign in (1, -1):
                with self.subTest(value=sign * value):
                    self.assertEqual(oracle.round_fraction(sign * value),
                                     {"kind": "finite", "bits": bits |
                                      (0x80000000 if sign < 0 else 0)})


class InputTests(unittest.TestCase):
    def test_canonical_decimal_rational_parser(self):
        self.assertEqual(oracle.parse_rational("-3", "2"), Fraction(-3, 2))
        self.assertEqual(oracle.parse_rational("0", "1"), Fraction(0))
        bad = [("-0", "1"), ("+1", "1"), ("01", "1"),
               ("1", "01"), ("1", "0"), ("1", "-1"),
               ("1", "+1"), (" 1", "1"), ("1\n", "1"),
               ("1.0", "1"), ("1e2", "1"), ("\u0661", "1"),
               ("", "1"), ("2", "4"), ("0", "2"),
               (1, "1"), ("1", 1), (True, "1"), (None, "1")]
        for n, d in bad:
            with self.subTest(n=n, d=d):
                with self.assertRaises((TypeError, ValueError)):
                    oracle.parse_rational(n, d)

    def test_input_bit_limits_and_preparse_string_limit(self):
        maximum = 2**4096 - 1
        self.assertEqual(oracle.parse_rational(str(maximum), "1"),
                         Fraction(maximum))
        for n, d in [(str(2**4096), "1"), ("1", str(2**4096))]:
            with self.subTest(n_length=len(n), d_length=len(d)):
                with self.assertRaises(ValueError):
                    oracle.parse_rational(n, d)
        # Bomb seam ensures neither oversized string reaches even int(),
        # independent of Python's interpreter-wide decimal parsing limit.
        oversized = "9" * (len(str(maximum)) + 1)
        with mock.patch.object(oracle, "int", create=True,
                               side_effect=AssertionError("parsed too early")):
            for n, d in [(oversized, "1"), ("1", oversized),
                         ("-" + oversized, "1")]:
                with self.subTest(n_length=len(n), d_length=len(d)):
                    with self.assertRaises(ValueError):
                        oracle.parse_rational(n, d)

    def test_rounding_rejects_nonfraction_and_oversized_values(self):
        for value in (0, 1.0, True, "1", None):
            with self.subTest(value=value):
                with self.assertRaises(TypeError):
                    oracle.round_fraction(value)
        for value in (Fraction(2**4096), Fraction(1, 2**4096)):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    oracle.round_fraction(value)
        self.assertEqual(oracle.round_fraction(Fraction(2**4096 - 1)),
                         {"kind": "overflow"})


class FixtureTests(unittest.TestCase):
    def test_bounded_unique_canonical_case_collection(self):
        cases = [{"id": "one", "n": "1", "d": "1"},
                 {"id": "over", "n": str(2**129), "d": "1"}]
        expected = {"format": "OrthoSculptFloat32Oracle", "version": 1,
                    "cases": [dict(cases[0], expected={"kind": "finite", "bits": 0x3F800000}),
                              dict(cases[1], expected={"kind": "overflow"})]}
        self.assertEqual(oracle.build_fixture(cases), expected)
        self.assertEqual(cases[0], {"id": "one", "n": "1", "d": "1"})
        invalid = [None, {}, (), [], [None], [dict(cases[0], id="")],
                   [dict(cases[0], id=1)], [dict(cases[0], id="x" * 97)],
                   [dict(cases[0], id="bad\n")], [dict(cases[0], n="-0")],
                   [{"id": "x", "n": "1"}], [dict(cases[0], extra="x")],
                   [cases[0], cases[0]], [cases[0]] * 2049]
        for index, value in enumerate(invalid):
            with self.subTest(index=index):
                with self.assertRaises((TypeError, ValueError)):
                    oracle.build_fixture(value)
        # Case count must be checked before inspecting or parsing an entry.
        with mock.patch.object(oracle, "parse_rational",
                               side_effect=AssertionError("parsed too early")):
            with self.assertRaises(ValueError):
                oracle.build_fixture([None] * 2049)
        limit_cases = [{"id": f"z-{i}", "n": "0", "d": "1"} for i in range(2048)]
        self.assertEqual(len(oracle.build_fixture(limit_cases)["cases"]), 2048)

    def test_deterministic_synthetic_inputs_cover_numeric_boundaries(self):
        cases = oracle.default_cases()
        self.assertIsInstance(cases, list)
        self.assertGreater(len(cases), 500)
        self.assertLessEqual(len(cases), 2048)
        self.assertEqual(cases, oracle.default_cases())
        fixture = oracle.build_fixture(cases)
        by_id = {case["id"]: case for case in fixture["cases"]}
        self.assertEqual(len(by_id), len(cases))
        checks = {"zero": {"kind": "finite", "bits": 0},
                  "double-round-positive": {"kind": "finite", "bits": 0x3F800001},
                  "half-even-lower-positive": {"kind": "finite", "bits": 0x3F800000},
                  "half-even-upper-positive": {"kind": "finite", "bits": 0x3F800002},
                  "minsubnormal-negative": {"kind": "finite", "bits": 0x80000001},
                  "minnormal-positive": {"kind": "finite", "bits": 0x00800000},
                  "underflow-half-negative": {"kind": "finite", "bits": 0x80000000},
                  "maxfinite-positive": {"kind": "finite", "bits": 0x7F7FFFFF},
                  "overflow-half-positive": {"kind": "overflow"},
                  "overflow-half-negative": {"kind": "overflow"}}
        for identifier, expected in checks.items():
            with self.subTest(identifier=identifier):
                self.assertEqual(by_id[identifier]["expected"], expected)
        for exponent in range(-126, 128):
            for sign in ("positive", "negative"):
                self.assertIn(f"binade-{exponent}-{sign}", by_id)

    def test_cli_generates_exclusively_and_requires_explicit_force(self):
        scratch = Path(os.environ["TMPDIR"]) / "v03-oracle-agent"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            target = Path(directory) / "fixture.json"
            command = [sys.executable, str(Path(oracle.__file__)), "--output", str(target)]
            first = subprocess.run(command, text=True, capture_output=True, check=False)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertTrue(target.is_file(), "CLI must create the actual fixture")
            original = target.read_bytes()
            fixture = json.loads(original)
            self.assertEqual(fixture, oracle.build_fixture(oracle.default_cases()))
            self.assertEqual(json.loads(first.stdout)["cases"], len(fixture["cases"]))
            refused = subprocess.run(command, text=True, capture_output=True, check=False)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("--force", refused.stderr)
            self.assertEqual(target.read_bytes(), original)
            repeated = subprocess.run(command + ["--force"], text=True,
                                      capture_output=True, check=False)
            self.assertEqual(repeated.returncode, 0, repeated.stderr)
            self.assertEqual(target.read_bytes(), original)

    def test_repository_fixture_is_reproducible(self):
        path = Path(__file__).parents[1] / "fixtures" / "v03-f32-oracle.json"
        self.assertTrue(path.is_file(), "the generator must actually produce the fixture")
        payload = path.read_bytes()
        expected = oracle.build_fixture(oracle.default_cases())
        self.assertEqual(json.loads(payload), expected)


if __name__ == "__main__":
    unittest.main()
