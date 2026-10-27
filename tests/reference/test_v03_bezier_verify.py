"""Synthetic mathematical certificates test the Python verifier, not TS output."""
import copy
import contextlib
from fractions import Fraction
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import v03_bezier_verify as verifier


def rat(value):
    value = Fraction(value)
    return {"n": str(value.numerator), "d": str(value.denominator)}


def point(values):
    return [rat(value) for value in values]


def linear_bundle():
    controls = [point((i, i, i)) for i in range(4)]
    return {"format": "OrthoSculptBezierProof", "version": 1, "cases": [{
        "id": "synthetic-linear",
        "input": {"controls": controls, "tolerance": rat(Fraction(1, 200))},
        "result": {"kind": "cubic-parametric-bound-v1",
                   "samples": [{"t": rat(0), "point": controls[0]},
                               {"t": rat(1), "point": controls[3]}],
                   "leaves": [{"t0": rat(0), "t1": rat(1),
                               "controls": copy.deepcopy(controls), "upperSquared": rat(0)}],
                   "maxUpperSquared": rat(0)}
    }]}


def curved_bundle(knots=(Fraction(0), Fraction(1, 3), Fraction(1))):
    """Analytic B(t)=(3t,t²/1000,t³/2000), no production/reference routines.

    Hermite endpoints/derivatives give exact restricted cubic controls:
    Q0=B(a), Q1=B(a)+hB'(a)/3, Q2=B(b)-hB'(b)/3, Q3=B(b).
    All second/third coordinates and chord endpoints lie in [0,1/1000].
    Consequently the squared deviation is at most 2/10**6 on any leaf.
    """
    def b(t):
        return (3*t, t*t/1000, t*t*t/2000)

    def derivative(t):
        return (Fraction(3), t/500, 3*t*t/2000)

    def controls(a, z):
        h = z-a
        return [point(b(a)),
                point([v+h*d/3 for v, d in zip(b(a), derivative(a))]),
                point([v-h*d/3 for v, d in zip(b(z), derivative(z))]), point(b(z))]

    claimed = Fraction(1, 500_000)
    case = {"id": "synthetic-polynomial", "input": {
        "controls": controls(Fraction(0), Fraction(1)),
        "tolerance": rat(Fraction(1, 200))},
        "result": {"kind": "cubic-parametric-bound-v1",
                   "samples": [{"t": rat(t), "point": point(b(t))} for t in knots],
                   "leaves": [{"t0": rat(a), "t1": rat(z), "controls": controls(a, z),
                               "upperSquared": rat(claimed)} for a, z in zip(knots, knots[1:])],
                   "maxUpperSquared": rat(claimed)}}
    return {"format": "OrthoSculptBezierProof", "version": 1, "cases": [case]}


class VerifierTests(unittest.TestCase):
    def test_linear_root_is_complete_pass(self):
        verify = getattr(verifier, "verify_bundle", None)
        self.assertTrue(callable(verify), "public complete-certificate verifier is missing")
        self.assertEqual(verify(linear_bundle()),
                         {"passed": True, "cases": 1, "leaves": 1, "samples": 2})

    def test_restricted_polynomial_identity_coverage_and_samples(self):
        valid = curved_bundle()
        self.assertEqual(verifier.verify_bundle(valid),
                         {"passed": True, "cases": 1, "leaves": 2, "samples": 3})
        poison = []
        for path, value in ((["leaves", 0, "controls", 1, 1], rat(1)),
                            (["samples", 1, "point", 0], rat(0)),
                            (["samples", 0, "point", 2], rat(1)),
                            (["samples", 2, "t"], rat(Fraction(9, 10))),
                            (["samples", 1, "t"], rat(Fraction(1, 2))),
                            (["leaves", 0, "t0"], rat(Fraction(1, 10))),
                            (["leaves", 1, "t1"], rat(Fraction(9, 10))),
                            (["leaves", 1, "t0"], rat(Fraction(1, 2))),
                            (["leaves", 1, "t0"], rat(Fraction(1, 4))),
                            (["leaves", 0, "t1"], rat(0)),
                            (["leaves", 0, "t0"], rat(-1)),
                            (["leaves", 1, "t1"], rat(2))):
            doc = copy.deepcopy(valid)
            target = doc["cases"][0]["result"]
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            poison.append(doc)
        wrong_subcurve = copy.deepcopy(valid)
        leaf = wrong_subcurve["cases"][0]["result"]["leaves"][1]
        leaf["controls"][1] = copy.deepcopy(leaf["controls"][0])
        leaf["controls"][2] = copy.deepcopy(leaf["controls"][3])
        poison.append(wrong_subcurve)  # Both endpoints remain exactly correct.
        for index, doc in enumerate(poison):
            with self.subTest(index=index):
                with self.assertRaises((TypeError, ValueError)):
                    verifier.verify_bundle(doc)

    def test_bernstein6_continuous_bound_and_normative_tolerance(self):
        # B(u)=(0,a*u*(1-u),0). Its norm² has power coefficients
        # a²*(0,0,1,-2,1,0,0), degree-6 Bernstein maximum a²/10.
        a = Fraction(1, 1000)
        exact_bound = a*a/10
        valid = linear_bundle()
        case = valid["cases"][0]
        controls = [point((0, 0, 0)), point((0, a/3, 0)),
                    point((0, a/3, 0)), point((0, 0, 0))]
        case["input"]["controls"] = copy.deepcopy(controls)
        case["result"]["leaves"][0]["controls"] = copy.deepcopy(controls)
        case["result"]["samples"] = [{"t": rat(0), "point": controls[0]},
                                         {"t": rat(1), "point": controls[3]}]
        case["result"]["leaves"][0]["upperSquared"] = rat(exact_bound)
        case["result"]["maxUpperSquared"] = rat(exact_bound)
        self.assertTrue(verifier.verify_bundle(valid)["passed"])
        poison = []
        for bound in (Fraction(0), exact_bound-Fraction(1, 10**20),
                      Fraction(-1), Fraction(1, 39999)):
            doc = copy.deepcopy(valid)
            result = doc["cases"][0]["result"]
            result["leaves"][0]["upperSquared"] = rat(bound)
            result["maxUpperSquared"] = rat(bound)
            poison.append(doc)
        for tolerance in (0, -1, Fraction(1, 199), Fraction(1, 10**6)):
            doc = copy.deepcopy(valid)
            doc["cases"][0]["input"]["tolerance"] = rat(tolerance)
            poison.append(doc)
        for maximum in (0, Fraction(1, 40000), -1):
            doc = copy.deepcopy(valid)
            doc["cases"][0]["result"]["maxUpperSquared"] = rat(maximum)
            poison.append(doc)
        for index, doc in enumerate(poison):
            with self.subTest(index=index):
                with self.assertRaises((TypeError, ValueError)):
                    verifier.verify_bundle(doc)
        # A conservative claim is valid, not required to equal the true error
        # or the independent Bernstein bound. Normative equality is inclusive.
        result = valid["cases"][0]["result"]
        result["leaves"][0]["upperSquared"] = rat(Fraction(1, 40000))
        result["maxUpperSquared"] = rat(Fraction(1, 40000))
        self.assertTrue(verifier.verify_bundle(valid)["passed"])
        self.assertTrue(verifier.verify_bundle(curved_bundle((Fraction(0), Fraction(1))))["passed"])

    def test_bounded_work_and_intermediate_integers_refuse_not_pass(self):
        budget_error = getattr(verifier, "BudgetExceeded", None)
        self.assertTrue(isinstance(budget_error, type), "separate refusal-on-budget exception is missing")
        for limit in ("MAX_OPERATIONS", "MAX_WEIGHTED_WORK", "MAX_NUMERIC_CHARS"):
            with self.subTest(limit=limit), patch.object(verifier, limit, 1):
                with self.assertRaises(budget_error):
                    verifier.verify_bundle(linear_bundle())
        with patch.object(verifier, "MAX_INTERMEDIATE_BITS", 8):
            with self.assertRaises(budget_error):
                verifier.verify_bundle(linear_bundle())
        with patch.object(verifier, "MAX_OPERATIONS", 600):
            self.assertTrue(verifier.verify_bundle(linear_bundle())["passed"])
            doc = linear_bundle()
            doc["cases"].append(copy.deepcopy(doc["cases"][0]))
            doc["cases"][1]["id"] = "second-case-shares-work-budget"
            with self.assertRaises(budget_error):
                verifier.verify_bundle(doc)
        # Mathematically tiny, admissible 4091-bit inputs can still require
        # too-large exact intermediate products. That is UNKNOWN, not FAIL/PASS.
        doc = linear_bundle()
        controls = [point((0, Fraction(1, (1 << 4090) + 2*i+1), 0)) for i in range(4)]
        case = doc["cases"][0]
        case["input"]["controls"] = copy.deepcopy(controls)
        result = case["result"]
        result["leaves"][0]["controls"] = copy.deepcopy(controls)
        result["samples"][0]["point"] = copy.deepcopy(controls[0])
        result["samples"][1]["point"] = copy.deepcopy(controls[3])
        result["leaves"][0]["upperSquared"] = rat(Fraction(1, 40000))
        result["maxUpperSquared"] = rat(Fraction(1, 40000))
        with self.assertRaises(budget_error):
            verifier.verify_bundle(doc)
        self.assertTrue(verifier.verify_bundle(linear_bundle())["passed"])

    def test_strict_schema_rejects_poison(self):
        poison = []
        for value in (None, [], True, {}, {"format": "OrthoSculptBezierProof", "version": 1, "cases": []}):
            poison.append(value)
        for field, value in (("format", "other"), ("version", True), ("version", 1.0),
                             ("cases", {}), ("extra", 1)):
            doc = linear_bundle()
            doc[field] = value
            poison.append(doc)
        for bad_rat in ({"n": "00", "d": "1"}, {"n": "-0", "d": "1"},
                        {"n": "+1", "d": "1"}, {"n": "1", "d": "01"},
                        {"n": "2", "d": "2"}, {"n": "0", "d": "2"},
                        {"n": "1", "d": "0"}, {"n": "1", "d": "-2"},
                        {"n": "１", "d": "1"}, {"n": 1, "d": "1"},
                        {"n": True, "d": "1"}, {"n": "1", "d": "1", "extra": 0},
                        {"n": "1", "d": "9" * 1235},
                        {"n": str(1 << 4096), "d": "1"},
                        {"n": "1", "d": str(1 << 4096)}):
            doc = linear_bundle()
            doc["cases"][0]["input"]["tolerance"] = bad_rat
            poison.append(doc)
        for identity in ("", "a" * 129, "nonascii-ą", 1, True, "control\n"):
            doc = linear_bundle()
            doc["cases"][0]["id"] = identity
            poison.append(doc)
        for path, value in ((["input", "controls"], []),
                            (["input", "extra"], 0),
                            (["result", "kind"], "not-a-proof"),
                            (["result", "leaves"], []),
                            (["result", "samples"], []),
                            (["result", "leaves", 0, "extra"], 0),
                            (["result", "samples", 0, "point"], [rat(0)])):
            doc = linear_bundle()
            target = doc["cases"][0]
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            poison.append(doc)
        duplicate = linear_bundle()
        duplicate["cases"] *= 2
        poison.append(duplicate)
        too_many = linear_bundle()
        too_many["cases"] = [dict(too_many["cases"][0], id=str(i)) for i in range(65)]
        poison.append(too_many)
        for index, doc in enumerate(poison):
            with self.subTest(index=index):
                with self.assertRaises((TypeError, ValueError)):
                    verifier.verify_bundle(doc)


    def test_cubic_degree6_bound_uses_every_coordinate_and_all_dot_terms(self):
        # C(u)=a*(u³-u): the seven norm² Bernstein coefficients are
        # ||a||²*(0,0,1/15,1/5,4/15,0,0). Translation does not change them.
        for vector in ((1, 0, 0), (0, 1, 0), (0, 0, 1), (1, -2, 3)):
            a = [Fraction(v, 1000) for v in vector]
            origin = (Fraction(-2), Fraction(3), Fraction(-4))
            controls = [point(origin), point([x-v/3 for x, v in zip(origin, a)]),
                        point([x-2*v/3 for x, v in zip(origin, a)]), point(origin)]
            bound = sum(v*v for v in a)*Fraction(4, 15)
            doc = linear_bundle()
            case = doc["cases"][0]
            case["input"]["controls"] = copy.deepcopy(controls)
            result = case["result"]
            result["leaves"][0]["controls"] = copy.deepcopy(controls)
            result["leaves"][0]["upperSquared"] = rat(bound)
            result["maxUpperSquared"] = rat(bound)
            result["samples"][0]["point"] = controls[0]
            result["samples"][1]["point"] = controls[3]
            with self.subTest(vector=vector):
                self.assertTrue(verifier.verify_bundle(doc)["passed"])
                result["leaves"][0]["upperSquared"] = rat(bound-Fraction(1, 10**20))
                result["maxUpperSquared"] = rat(bound-Fraction(1, 10**20))
                with self.assertRaises(ValueError):
                    verifier.verify_bundle(doc)

    def test_case_integer_and_identifier_limits_are_inclusive_and_inputs_unchanged(self):
        doc = linear_bundle()
        doc["cases"] = [dict(copy.deepcopy(doc["cases"][0]), id=str(i)) for i in range(64)]
        before = copy.deepcopy(doc)
        self.assertEqual(verifier.verify_bundle(doc),
                         {"passed": True, "cases": 64, "leaves": 64, "samples": 128})
        self.assertEqual(doc, before)
        for value in (Fraction((1 << 4096)-1), Fraction(-((1 << 4096)-1)),
                      Fraction(1, (1 << 4096)-1)):
            doc = linear_bundle()
            case = doc["cases"][0]
            case["id"] = "A"*128
            controls = [point((value, value, value)) for _ in range(4)]
            case["input"]["controls"] = copy.deepcopy(controls)
            result = case["result"]
            result["leaves"][0]["controls"] = copy.deepcopy(controls)
            result["samples"][0]["point"] = controls[0]
            result["samples"][1]["point"] = controls[3]
            self.assertTrue(verifier.verify_bundle(doc)["passed"])
        bad = curved_bundle()
        bad["cases"][0]["input"]["controls"][1][0] = rat(99)
        before = copy.deepcopy(bad)
        with self.assertRaises(ValueError):
            verifier.verify_bundle(bad)
        self.assertEqual(bad, before)

    def test_opposing_curvature_with_zero_endpoints_and_midpoint_is_not_zero_error(self):
        # C(u)=a*u*(1-u)*(2*u-1) is zero at 0, 1/2, 1 but not identically.
        # Norm² Bernstein6 has a negative central coefficient (-a²/10),
        # and its maximum is a²/15. Negative coefficients are not errors.
        a = Fraction(1, 1000)
        controls = [point((0, 0, 0)), point((-a/3, 0, 0)),
                    point((a/3, 0, 0)), point((0, 0, 0))]
        doc = linear_bundle()
        case = doc["cases"][0]
        case["input"]["controls"] = copy.deepcopy(controls)
        result = case["result"]
        result["leaves"][0]["controls"] = copy.deepcopy(controls)
        result["samples"][0]["point"] = controls[0]
        result["samples"][1]["point"] = controls[3]
        result["leaves"][0]["upperSquared"] = rat(a*a/15)
        result["maxUpperSquared"] = rat(a*a/15)
        self.assertTrue(verifier.verify_bundle(doc)["passed"])
        result["leaves"][0]["upperSquared"] = rat(0)
        result["maxUpperSquared"] = rat(0)
        with self.assertRaises(ValueError):
            verifier.verify_bundle(doc)

    def test_maximum_is_largest_conservative_claim_not_last_leaf(self):
        doc = curved_bundle()
        result = doc["cases"][0]["result"]
        result["leaves"][0]["upperSquared"] = rat(Fraction(1, 40000))
        result["maxUpperSquared"] = rat(Fraction(1, 40000))
        self.assertTrue(verifier.verify_bundle(doc)["passed"])
        result["maxUpperSquared"] = copy.deepcopy(result["leaves"][-1]["upperSquared"])
        with self.assertRaises(ValueError):
            verifier.verify_bundle(doc)

    def test_aggregate_leaf_count_rejected_before_payload_parsing(self):
        # Deliberately invalid leaf payloads prove the count is checked first.
        doc = linear_bundle()
        result = doc["cases"][0]["result"]
        result["leaves"] = [None]*20_001
        result["samples"] = [None]*20_002
        with self.assertRaisesRegex(ValueError, "aggregate leaf count"):
            verifier.verify_bundle(doc)
        doc = linear_bundle()
        case = doc["cases"][0]
        case["result"]["leaves"] = [None]*10_001
        case["result"]["samples"] = [None]*10_002
        doc["cases"].append(dict(copy.deepcopy(case), id="other"))
        with self.assertRaisesRegex(ValueError, "aggregate leaf count"):
            verifier.verify_bundle(doc)

    def test_cli_real_file_json_exit_status_and_pre_read_size_gate(self):
        scratch = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "hermes/cache/scratch/v03-bezier-verifier-agent"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch, prefix="synthetic-cli-") as directory:
            path = Path(directory) / "synthetic-python-certificate.json"
            script = Path(verifier.__file__).resolve()

            def run_cli():
                return subprocess.run([sys.executable, str(script), "--input", str(path)],
                                      capture_output=True, text=True, timeout=15,
                                      env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))

            path.write_text(json.dumps(curved_bundle()), encoding="utf-8")
            completed = run_cli()
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue(completed.stdout.strip(), "CLI complete-PASS JSON is missing")
            self.assertEqual(json.loads(completed.stdout),
                             {"passed": True, "cases": 1, "leaves": 2, "samples": 3})
            self.assertEqual(completed.stderr, "")
            output = io.StringIO()
            with patch.object(verifier, "MAX_OPERATIONS", 1), contextlib.redirect_stdout(output):
                exit_code = verifier.main(["--input", str(path)])
            self.assertEqual(exit_code, 2)
            self.assertEqual(json.loads(output.getvalue()),
                             {"passed": False, "status": "UNKNOWN", "error": "verification budget exhausted"})
            # Exact file boundary remains valid JSON, padded only with whitespace.
            original = path.read_bytes()
            with path.open("wb") as stream:
                stream.write(original)
                stream.write(b" "*(16*1024*1024-len(original)))
            self.assertEqual(run_cli().returncode, 0)
            broken = curved_bundle()
            broken["cases"][0]["result"]["samples"][1]["point"][0] = rat(123456789)
            malformed = [json.dumps(broken).encode(), b"{}", b"{",
                         b'{"version":1,"version":1}', b'{"version":NaN}',
                         b'{"version":1.0}', b'{"version":Infinity}',
                         b'{"version":' + b"9"*5000 + b"}",
                         b"["*3000 + b"]"*3000, b"\xff"]
            for data in malformed:
                path.write_bytes(data)
                completed = run_cli()
                self.assertNotEqual(completed.returncode, 0)
                self.assertFalse(json.loads(completed.stdout)["passed"])
                self.assertNotIn("123456789", completed.stdout + completed.stderr)
                self.assertEqual(completed.stderr, "")
            with path.open("wb") as stream:
                stream.truncate(16*1024*1024 + 1)
            with patch("builtins.open", side_effect=AssertionError("must not read oversize")), \
                    patch.object(verifier.json, "loads", side_effect=AssertionError("must not parse oversize")):
                with self.assertRaises(ValueError):
                    verifier._load_document(path)
            completed = run_cli()
            self.assertNotEqual(completed.returncode, 0)
            self.assertFalse(json.loads(completed.stdout)["passed"])
            path.unlink()
            completed = run_cli()
            self.assertNotEqual(completed.returncode, 0)
            self.assertFalse(json.loads(completed.stdout)["passed"])


if __name__ == "__main__":
    unittest.main()
