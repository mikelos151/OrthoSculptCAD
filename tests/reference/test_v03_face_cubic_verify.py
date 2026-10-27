"""Independent tests; all fixtures here are mathematical, NOT TypeScript output."""
import copy
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from fractions import Fraction as F
import unittest
from unittest.mock import patch
import v03_face_cubic_verify as verifier
import v03_bezier_verify as old


def rat(value):
    value = F(value)
    return {"n": str(value.numerator), "d": str(value.denominator)}


def mathematical_fixture(triangle=None, constant=False):
    """Hand-derived edge-linear certificate; never a real producer export."""
    triangle = triangle or [[1, 2, 3], [4, 4, 4], [2, 6, 5]]
    triangle = [[F(x) for x in row] for row in triangle]
    weights = ([[F(1), F(0), F(0)]] * 4 if constant else
               [[1, 0, 0], [F(2, 3), F(1, 3), 0],
                [F(1, 3), F(2, 3), 0], [0, 1, 0]])
    controls = [[sum(F(w[j]) * triangle[j][axis] for j in range(3))
                 for axis in range(3)] for w in weights]
    encode = lambda rows: [[rat(x) for x in row] for row in rows]
    controls = encode(controls)
    return {"format": "OrthoSculptFaceCubicProof", "version": 1, "cases": [{
        "id": "synthetic-math-edge-linear-not-TS", "tolerance": rat(F(1, 200)),
        "containment": {"kind": "supplied-face-cubic-hull-v1", "triangle": encode(triangle),
                        "barycentricControls": encode(weights), "controls": controls},
        "approximation": {"kind": "cubic-parametric-bound-v1",
            "samples": [{"t": rat(0), "point": copy.deepcopy(controls[0])},
                        {"t": rat(1), "point": copy.deepcopy(controls[3])}],
            "leaves": [{"t0": rat(0), "t1": rat(1), "controls": copy.deepcopy(controls),
                        "upperSquared": rat(0)}], "maxUpperSquared": rat(0)}}]}


def approximation_projection(document):
    """Normative public M0c1 projection, also used for negative controls."""
    return {"format": "OrthoSculptBezierProof", "version": 1, "cases": [
        {"id": case["id"], "input": {"controls": case["containment"]["controls"],
                                     "tolerance": case["tolerance"]},
         "result": case["approximation"]} for case in document["cases"]]}


class FaceCubicTests(unittest.TestCase):
    def scratch_directory(self):
        root = Path(os.environ.get("TMPDIR", tempfile.gettempdir())) / "v03-face-cubic-py-agent"
        root.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(temporary.cleanup)
        return Path(temporary.name)

    def test_real_cli_on_synthetic_math_not_ts(self):
        self.assertTrue(callable(getattr(verifier, "main", None)), "public main required")
        path = self.scratch_directory() / "synthetic-math-not-ts.json"
        path.write_text(json.dumps(mathematical_fixture()), encoding="utf-8")
        process = subprocess.run([sys.executable, str(Path(verifier.__file__).resolve()),
                                  "--input", str(path)], capture_output=True, text=True,
                                 env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), timeout=20)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout),
                         {"passed": True, "cases": 1, "leaves": 1, "samples": 2})
        self.assertEqual(process.stderr, "")

    def test_strict_json_loader(self):
        valid = json.dumps(mathematical_fixture())
        invalid = [valid.replace('"version": 1', '"version": 1.0'),
                   valid.replace('"version": 1', '"version": NaN'),
                   valid.replace('"version": 1', '"version": Infinity'),
                   valid.replace('"version": 1', '"version": 12345678901'),
                   valid.replace('"version": 1', '"version": 1, "version": 1'),
                   '{"a": 0, "b": 0, "c": 0, "d": 0, "e": 0}',
                   '\ufeff' + valid]
        directory = self.scratch_directory()
        for index, text in enumerate(invalid):
            path = directory / (str(index) + ".json")
            path.write_bytes(text.encode("utf-8"))
            with self.subTest(index=index), self.assertRaises((TypeError, ValueError)):
                verifier._load_document(path)

    def test_file_exact_16mib_and_one_byte_over(self):
        limit = 16 * 1024 * 1024
        path = self.scratch_directory() / "padded-math-not-ts.json"
        payload = json.dumps(mathematical_fixture()).encode("utf-8")
        path.write_bytes(payload + b" " * (limit - len(payload)))
        self.assertEqual(verifier._load_document(path), mathematical_fixture())
        with path.open("ab") as stream:
            stream.write(b" ")
        with self.assertRaises(ValueError):
            verifier._load_document(path)

    def test_rejects_nonliteral_schema(self):
        original = mathematical_fixture()
        paths = [(), ("cases", 0), ("cases", 0, "containment"),
                 ("cases", 0, "approximation"),
                 ("cases", 0, "approximation", "samples", 0),
                 ("cases", 0, "approximation", "leaves", 0)]
        for path in paths:
            document = copy.deepcopy(original)
            target = document
            for key in path:
                target = target[key]
            target["status"] = "PASS"
            with self.subTest(path=path), self.assertRaises((TypeError, ValueError)):
                verifier.verify_bundle(document)
        for key, value in [("format", "OrthoSculptBezierProof"), ("version", True),
                           ("version", 1.0)]:
            document = copy.deepcopy(original)
            document[key] = value
            with self.subTest(key=key, value=value), self.assertRaises((TypeError, ValueError)):
                verifier.verify_bundle(document)
        for key, alias in [("controls", "controls4x3Rat"), ("triangle", "triangle3x3Rat"),
                           ("barycentricControls", "weights")]:
            document = copy.deepcopy(original)
            target = document["cases"][0]["containment"]
            target[alias] = target.pop(key)
            with self.subTest(alias=alias), self.assertRaises((TypeError, ValueError)):
                verifier.verify_bundle(document)

    def test_inverse_integer_canonicality(self):
        # C is unused by this edge: malformed canonicality must not be hidden
        # by successful world mapping or by the old approximation verifier.
        for n, d in [("+2", "1"), ("02", "1"), ("-0", "1"), ("2", "2"),
                     ("0", "2"), ("2\n", "1"), ("2", "1\n"),
                     ("٢", "1"), (2, "1"), ("2", 1), ("2", "0"),
                     ("2", "-1"), ("1" * 1235, "1")]:
            document = mathematical_fixture()
            document["cases"][0]["containment"]["triangle"][2][0] = {"n": n, "d": d}
            with self.subTest(n=n, d=d), self.assertRaises((TypeError, ValueError)):
                verifier.verify_bundle(document)

    def test_inverse_operation_refusal_is_old_public_budget_exception(self):
        self.assertIs(verifier.BudgetExceeded, old.BudgetExceeded)
        with patch.object(verifier, "MAX_OPERATIONS", 0, create=True):
            with self.assertRaises(old.BudgetExceeded):
                verifier.verify_bundle(mathematical_fixture())

    def test_unreduced_intermediate_preflight_including_division(self):
        left, right = F(1 << 20), F(1, 1 << 20)
        with patch.object(verifier, "MAX_INTERMEDIATE_BITS", 30, create=True):
            with patch.object(F, "__truediv__", side_effect=AssertionError("allocated division")) as divide:
                with self.assertRaises(old.BudgetExceeded):
                    verifier._InverseBudget().calculate("div", left, right)
                divide.assert_not_called()
        with self.assertRaises(ValueError):
            verifier._InverseBudget().calculate("div", F(1), F(0))

    def test_numeric_char_budget_before_integer_or_gcd(self):
        with patch.object(verifier, "MAX_NUMERIC_CHARS", 1, create=True):
            with patch.object(verifier, "gcd", side_effect=AssertionError("unbudgeted gcd")) as observed:
                with self.assertRaises(old.BudgetExceeded):
                    verifier._rat(rat(1), verifier._InverseBudget())
                observed.assert_not_called()

    def test_limb_work_preflight_before_gcd_and_fraction_operations(self):
        with patch.object(verifier, "MAX_WEIGHTED_WORK", 0, create=True):
            with patch.object(verifier, "gcd", side_effect=AssertionError("unbudgeted gcd")) as observed:
                with self.assertRaises(old.BudgetExceeded):
                    verifier._rat(rat(F(2, 3)), verifier._InverseBudget())
                observed.assert_not_called()
            with patch.object(F, "__mul__", side_effect=AssertionError("unbudgeted multiply")) as observed:
                with self.assertRaises(old.BudgetExceeded):
                    verifier._InverseBudget().calculate("mul", F(2), F(3))
                observed.assert_not_called()

    def test_rejects_exactly_degenerate_triangles(self):
        for triangle in [[[0, 0, 0], [0, 0, 0], [1, 2, 3]],
                         [[0, 0, 0], [1, 2, 3], [2, 4, 6]]]:
            with self.subTest(triangle=triangle), self.assertRaisesRegex(ValueError, "degenerate"):
                verifier.verify_bundle(mathematical_fixture(triangle, constant=True))

    def test_accepts_exactly_nondegenerate_thin_triangle(self):
        document = mathematical_fixture([[0, 0, 0], [1, 0, 0], [1, F(1, 1 << 600), 0]],
                                        constant=True)
        self.assertTrue(verifier.verify_bundle(document)["passed"])

    def test_first_nonzero_minor_xy_xz_yz(self):
        triangles = [([[1, 2, 3], [4, 4, 4], [2, 6, 5]], F(10)),
                     ([[0, 0, 0], [1, 0, 0], [0, 0, 1]], F(1)),
                     ([[0, 0, 0], [0, 1, 0], [0, 0, 1]], F(1)),
                     ([[0, 0, 0], [1, 2, 3], [4, 5, 7]], F(-3))]
        real_calculate = verifier._InverseBudget.calculate
        for triangle, determinant in triangles:
            observed = []
            def observe(budget, operation, left, right):
                if operation == "div":
                    observed.append(right)
                return real_calculate(budget, operation, left, right)
            with self.subTest(triangle=triangle), patch.object(verifier._InverseBudget, "calculate", observe):
                self.assertTrue(verifier.verify_bundle(mathematical_fixture(triangle))["passed"])
                self.assertEqual(observed, [determinant] * 8)

    def test_negative_signed_determinant_swapped_bc_preserves_world(self):
        document = mathematical_fixture()
        original = copy.deepcopy(document["cases"][0]["containment"]["controls"])
        containment = document["cases"][0]["containment"]
        containment["triangle"][1], containment["triangle"][2] = (
            containment["triangle"][2], containment["triangle"][1])
        for weights in containment["barycentricControls"]:
            weights[1], weights[2] = weights[2], weights[1]
        self.assertEqual(containment["controls"], original)
        self.assertTrue(verifier.verify_bundle(document)["passed"])

    def test_offplane_same_xy_projection_old_approximation_still_passes(self):
        document = mathematical_fixture()
        case = document["cases"][0]
        world_points = list(case["containment"]["controls"])
        world_points += case["approximation"]["leaves"][0]["controls"]
        world_points += [sample["point"] for sample in case["approximation"]["samples"]]
        for point in world_points:
            point[2] = rat(F(int(point[2]["n"]), int(point[2]["d"])) + F(1, 997))
        self.assertTrue(old.verify_bundle(approximation_projection(document))["passed"])
        with self.assertRaisesRegex(ValueError, "off-plane"):
            verifier.verify_bundle(document)

    def test_canonical_sum_one_weight_mismatch_old_approximation_still_passes(self):
        document = mathematical_fixture()
        document["cases"][0]["containment"]["barycentricControls"][1] = [rat(F(1, 3)), rat(F(2, 3)), rat(0)]
        self.assertTrue(old.verify_bundle(approximation_projection(document))["passed"])
        with self.assertRaisesRegex(ValueError, "inverse weight mismatch"):
            verifier.verify_bundle(document)

    def test_tiny_negative_and_nonunit_weights_without_underflow(self):
        tiny = F(1, 1 << 1100)
        for index in range(4):
            for axis in range(3):
                document = mathematical_fixture()
                weights = [F(0)] * 3
                weights[axis] = -tiny
                weights[(axis + 1) % 3] = 1 + tiny
                document["cases"][0]["containment"]["barycentricControls"][index] = [rat(w) for w in weights]
                with self.subTest(index=index, axis=axis), self.assertRaisesRegex(ValueError, "negative"):
                    verifier.verify_bundle(document)
        for weights in [[1, tiny, 0], [F(1, 2), F(1, 3), F(1, 7)], [F(1, 2), 0, 0]]:
            document = mathematical_fixture()
            document["cases"][0]["containment"]["barycentricControls"][1] = [rat(w) for w in weights]
            with self.subTest(weights=weights), self.assertRaisesRegex(ValueError, "nonunit"):
                verifier.verify_bundle(document)

    def test_corrupted_approximation_reaches_real_old_verifier(self):
        paths = [("samples", 0, "point", 0), ("leaves", 0, "controls", 1, 0),
                 ("leaves", 0, "t0"), ("leaves", 0, "t1"),
                 ("leaves", 0, "upperSquared"), ("maxUpperSquared",)]
        for path in paths:
            document = mathematical_fixture()
            target = document["cases"][0]["approximation"]
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = rat(F(-1) if path[-1] == "upperSquared" else F(1, 997))
            with self.subTest(path=path), patch.object(old, "verify_bundle", wraps=old.verify_bundle) as real_old:
                with self.assertRaises(ValueError):
                    verifier.verify_bundle(document)
                self.assertEqual(real_old.call_count, 1)

    def test_old_public_verifier_called_once_for_whole_projection(self):
        document = mathematical_fixture()
        second = copy.deepcopy(document["cases"][0])
        second["id"] = "synthetic-second-not-TS"
        document["cases"].append(second)
        with patch.object(old, "verify_bundle", wraps=old.verify_bundle) as real_old:
            self.assertEqual(verifier.verify_bundle(document),
                             {"passed": True, "cases": 2, "leaves": 2, "samples": 4})
            real_old.assert_called_once()
            self.assertEqual(real_old.call_args.args[0], approximation_projection(document))
            for projected, original in zip(real_old.call_args.args[0]["cases"], document["cases"]):
                self.assertIs(projected["input"]["controls"], original["containment"]["controls"])
                self.assertIs(projected["result"], original["approximation"])
                self.assertIs(projected["input"]["tolerance"], original["tolerance"])

    def test_case_count_64_65_and_unique_ascii_ids(self):
        document = mathematical_fixture()
        template = document["cases"][0]
        document["cases"] = [dict(copy.deepcopy(template), id="math-" + str(i)) for i in range(64)]
        self.assertEqual(verifier.verify_bundle(document)["cases"], 64)
        document["cases"].append(dict(copy.deepcopy(template), id="math-64"))
        with patch.object(verifier, "_rat", side_effect=AssertionError("parsed too early")) as observed:
            with self.assertRaisesRegex(ValueError, "case count"):
                verifier.verify_bundle(document)
            observed.assert_not_called()
        for identity in ["", "x" * 129, "id\n", "ż", "id\t"]:
            document = mathematical_fixture()
            document["cases"][0]["id"] = identity
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                verifier.verify_bundle(document)
        document = mathematical_fixture()
        document["cases"].append(copy.deepcopy(document["cases"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            verifier.verify_bundle(document)

    def test_aggregate_leaf_count_20000_20001_before_rational_payload(self):
        # Count-only scaffolds: deliberately NOT mathematical certificates.
        document = mathematical_fixture()
        second = copy.deepcopy(document["cases"][0])
        second["id"] = "count-only-second"
        document["cases"].append(second)
        for case in document["cases"]:
            case["approximation"]["leaves"] = [None] * 10000
            case["approximation"]["samples"] = [None] * 10001
        self.assertEqual(len(verifier._preflight_document(document, verifier._InverseBudget())), 2)
        second["approximation"]["leaves"].append(None)
        second["approximation"]["samples"].append(None)
        with patch.object(verifier, "_rat", side_effect=AssertionError("parsed too early")) as observed:
            with self.assertRaisesRegex(ValueError, "aggregate"):
                verifier.verify_bundle(document)
            observed.assert_not_called()

    def test_samples_equal_leaves_plus_one_before_rational_parse(self):
        for delta in [-1, 1]:
            document = mathematical_fixture()
            samples = document["cases"][0]["approximation"]["samples"]
            if delta < 0:
                samples.pop()
            else:
                samples.append(copy.deepcopy(samples[-1]))
            with self.subTest(delta=delta), patch.object(verifier, "_rat", side_effect=AssertionError("parsed too early")) as observed:
                with self.assertRaises(ValueError):
                    verifier.verify_bundle(document)
                observed.assert_not_called()

    def test_input_integer_4096_4097_bits_and_1234_1235_digits(self):
        for value in [1 << 4095, (1 << 4096) - 1, -(1 << 4095), F(1, 1 << 4095),
                      10 ** 1233, -(10 ** 1233)]:
            with self.subTest(value_bits=F(value).numerator.bit_length()):
                self.assertEqual(verifier._rat(rat(value), verifier._InverseBudget()), value)
        for value in [1 << 4096, -(1 << 4096), F(1, 1 << 4096)]:
            with self.subTest(too_many_bits=True), self.assertRaisesRegex(ValueError, "input integer"):
                verifier._rat(rat(value), verifier._InverseBudget())
        for value in [{"n": "1" + "0" * 1234, "d": "1"},
                      {"n": "-1" + "0" * 1234, "d": "1"},
                      {"n": "1", "d": "1" + "0" * 1234}]:
            with patch.object(verifier, "int", side_effect=AssertionError("parsed long token"), create=True) as integer:
                with self.assertRaisesRegex(ValueError, "token too long"):
                    verifier._rat(value, verifier._InverseBudget())
                integer.assert_not_called()

    def test_two_cases_individually_pass_but_joint_inverse_budget_unknown(self):
        first = mathematical_fixture()
        second = copy.deepcopy(first)
        second["cases"][0]["id"] = "synthetic-second-not-TS"
        # Observe the real public path, including structural parsing. Exactly
        # one inverse budget must be allocated for the complete call.
        observed = []
        real_budget = verifier._InverseBudget
        class ObservedBudget(real_budget):
            def __init__(self):
                super().__init__()
                observed.append(self)
        with patch.object(verifier, "_InverseBudget", ObservedBudget):
            self.assertTrue(verifier.verify_bundle(first)["passed"])
        self.assertEqual(len(observed), 1)
        limit = observed[0].operations
        with patch.object(verifier, "MAX_OPERATIONS", limit):
            self.assertTrue(verifier.verify_bundle(first)["passed"])
            self.assertTrue(verifier.verify_bundle(second)["passed"])
            combined = dict(first, cases=first["cases"] + second["cases"])
            with self.assertRaises(old.BudgetExceeded):
                verifier.verify_bundle(combined)
        process = self.controlled_cli("v.MAX_OPERATIONS = " + str(limit), combined)
        self.assertEqual(process.returncode, 2, process.stderr)
        self.assertEqual(json.loads(process.stdout), {"passed": False, "status": "UNKNOWN",
                                                     "error": "verification budget exhausted"})

    def controlled_cli(self, setup, document=None):
        path = self.scratch_directory() / "synthetic-math-not-ts.json"
        path.write_text(json.dumps(document if document is not None else mathematical_fixture()),
                        encoding="utf-8")
        reference = str(Path(verifier.__file__).resolve().parent)
        code = ("import sys; sys.path.insert(0, " + repr(reference) + "); "
                "import v03_face_cubic_verify as v; " + setup + "; "
                "sys.exit(v.main(['--input', " + repr(str(path)) + "]))")
        return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                              env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), timeout=20)

    def test_inverse_stage_budget_cli_exit_2_never_partial_pass(self):
        result = self.controlled_cli("v.MAX_OPERATIONS = 0")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"passed": False, "status": "UNKNOWN",
                                                     "error": "verification budget exhausted"})
        self.assertEqual(len(result.stdout.splitlines()), 1)
        self.assertEqual(result.stderr, "")

    def test_old_stage_budget_cli_exit_2_never_partial_pass(self):
        result = self.controlled_cli("v.bezier.MAX_OPERATIONS = 0")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"passed": False, "status": "UNKNOWN",
                                                     "error": "verification budget exhausted"})
        self.assertEqual(len(result.stdout.splitlines()), 1)
        self.assertEqual(result.stderr, "")
        with patch.object(old, "MAX_OPERATIONS", 0):
            with self.assertRaises(verifier.BudgetExceeded):
                verifier.verify_bundle(mathematical_fixture())

    def test_loader_checks_stat_then_fstat_then_bounded_read_with_real_growth(self):
        path = self.scratch_directory() / "growth.json"
        real_open, real_fstat = open, os.fstat
        for phase in ["before-open", "before-fstat", "after-fstat"]:
            path.write_bytes(b"{}" if phase != "before-open" else b" " * 65)
            opens, reads = [], []
            class TrackingFile:
                def __init__(self, stream):
                    self.stream = stream
                def __enter__(self):
                    self.stream.__enter__()
                    return self
                def __exit__(self, *args):
                    return self.stream.__exit__(*args)
                def fileno(self):
                    return self.stream.fileno()
                def read(self, count):
                    reads.append(count)
                    return self.stream.read(count)
            def observed_open(name, mode):
                opens.append((name, mode))
                if phase == "before-fstat":
                    with real_open(path, "ab") as stream:
                        stream.write(b" " * 65)
                return TrackingFile(real_open(name, mode))
            def observed_fstat(fd):
                metadata = real_fstat(fd)
                if phase == "after-fstat":
                    with real_open(path, "ab") as stream:
                        stream.write(b" " * 65)
                return metadata
            with (self.subTest(phase=phase), patch.object(verifier, "MAX_FILE_BYTES", 64),
                  patch.object(verifier, "open", observed_open, create=True),
                  patch.object(os, "fstat", observed_fstat)):
                with self.assertRaises(ValueError):
                    verifier._load_document(path)
                self.assertEqual(len(opens), 0 if phase == "before-open" else 1)
                self.assertEqual(reads, [65] if phase == "after-fstat" else [])
        with self.assertRaises(ValueError):
            verifier._load_document(path.parent)

    def test_structural_preflight_is_budgeted_before_fraction_payload(self):
        with patch.object(verifier, "MAX_OPERATIONS", 0):
            with self.assertRaises(old.BudgetExceeded):
                verifier._preflight_document(mathematical_fixture(), verifier._InverseBudget())

    def test_corrupted_root_with_valid_containment_rejected_by_real_old(self):
        document = mathematical_fixture()
        case = document["cases"][0]
        # Move P1 to A, and make its declared barycentrics exactly match.
        # Leave the original leaf untouched: containment remains correct,
        # but the projected approximation no longer represents its root.
        case["containment"]["barycentricControls"][1] = [rat(1), rat(0), rat(0)]
        case["containment"]["controls"][1] = copy.deepcopy(case["containment"]["triangle"][0])
        with patch.object(old, "verify_bundle", wraps=old.verify_bundle) as real_old:
            with self.assertRaisesRegex(ValueError, "polynomial mismatch"):
                verifier.verify_bundle(document)
            real_old.assert_called_once()

    def test_canonical_nonnegative_but_false_continuous_bound(self):
        # Mathematical root certificate from plan h=1/1000; NOT TS output.
        document = mathematical_fixture()
        case = document["cases"][0]
        containment = case["containment"]
        triangle = [[F(int(v["n"]), int(v["d"])) for v in row] for row in containment["triangle"]]
        h = F(1, 1000)
        for index, weight in [(1, [F(2, 3)-h, F(1, 3), h]),
                              (2, [F(1, 3)-h, F(2, 3), h])]:
            containment["barycentricControls"][index] = [rat(w) for w in weight]
            containment["controls"][index] = [rat(sum(weight[j] * triangle[j][axis] for j in range(3)))
                                                   for axis in range(3)]
        result = case["approximation"]
        result["leaves"][0]["controls"] = copy.deepcopy(containment["controls"])
        result["leaves"][0]["upperSquared"] = rat(F(21, 1000000))
        result["maxUpperSquared"] = rat(F(21, 1000000))
        self.assertTrue(verifier.verify_bundle(document)["passed"])
        result["leaves"][0]["upperSquared"] = rat(0)
        result["maxUpperSquared"] = rat(0)
        with patch.object(old, "verify_bundle", wraps=old.verify_bundle) as real_old:
            with self.assertRaisesRegex(ValueError, "continuous bound"):
                verifier.verify_bundle(document)
            real_old.assert_called_once()

    def test_strict_containment_tuple_shapes_and_scalar_objects(self):
        for field, length in [("triangle", 3), ("controls", 4), ("barycentricControls", 4)]:
            for bad in [None, {}, [], [None] * (length - 1), [None] * (length + 1),
                        [[rat(0)] * 2] * length, [[rat(0)] * 4] * length]:
                document = mathematical_fixture()
                document["cases"][0]["containment"][field] = bad
                with self.subTest(field=field, bad=bad), self.assertRaises((TypeError, ValueError)):
                    verifier.verify_bundle(document)
        for bad in [None, 0, True, F(0), {"n": "0", "d": "1", "status": "PASS"}]:
            document = mathematical_fixture()
            document["cases"][0]["containment"]["triangle"][0][0] = bad
            with self.subTest(scalar=bad), self.assertRaises((TypeError, ValueError)):
                verifier.verify_bundle(document)
        for kind in ["supplied-face-cubic-hull-v2", True]:
            document = mathematical_fixture()
            document["cases"][0]["containment"]["kind"] = kind
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                verifier.verify_bundle(document)

    def test_frozen_reference_maxima_and_exact_small_budget_boundaries(self):
        expected = {"MAX_INPUT_BITS": 4096, "MAX_DECIMAL_DIGITS": 1234,
                    "MAX_INTERMEDIATE_BITS": 32768, "MAX_OPERATIONS": 20000000,
                    "MAX_WEIGHTED_WORK": 500000000, "MAX_NUMERIC_CHARS": 16 * 1024 * 1024,
                    "MAX_FILE_BYTES": 16 * 1024 * 1024, "MAX_CASES": 64, "MAX_LEAVES": 20000}
        for name, value in expected.items():
            self.assertEqual(getattr(verifier, name), value, name)
        with patch.object(verifier, "MAX_NUMERIC_CHARS", 4):
            budget = verifier._InverseBudget()
            self.assertEqual(verifier._rat(rat(1), budget), 1)
            self.assertEqual(verifier._rat(rat(1), budget), 1)
            with self.assertRaises(old.BudgetExceeded):
                verifier._rat(rat(1), budget)
        with patch.object(verifier, "MAX_WEIGHTED_WORK", 1):
            budget = verifier._InverseBudget()
            self.assertEqual(budget.calculate("mul", F(1), F(1)), 1)
            with self.assertRaises(old.BudgetExceeded):
                budget.calculate("mul", F(1), F(1))
        # Division's unreduced numerator bound is 42 bits in this witness.
        left, right = F(1 << 20), F(1, 1 << 20)
        with patch.object(verifier, "MAX_INTERMEDIATE_BITS", 42):
            self.assertEqual(verifier._InverseBudget().calculate("div", left, right), 1 << 40)
        with patch.object(verifier, "MAX_INTERMEDIATE_BITS", 41):
            with self.assertRaises(old.BudgetExceeded):
                verifier._InverseBudget().calculate("div", left, right)
        with patch.object(verifier, "MAX_OPERATIONS", 1):
            budget = verifier._InverseBudget()
            self.assertEqual(budget.calculate("eq", F(1), F(1)), True)
            with self.assertRaises(old.BudgetExceeded):
                budget.calculate("eq", F(1), F(1))

    def test_cli_rejection_and_unreadable_diagnostics_are_fixed(self):
        path = self.scratch_directory() / "do-not-echo-sensitive-path.json"
        document = mathematical_fixture()
        document["cases"][0]["id"] = "do-not-echo-sensitive-id"
        document["cases"][0]["containment"]["barycentricControls"][1] = [rat(0), rat(1), rat(0)]
        path.write_text(json.dumps(document), encoding="utf-8")
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = verifier.main(["--input", str(path)])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue()),
                         {"passed": False, "status": "FAIL", "error": "certificate rejected"})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = verifier.main(["--input", str(path.parent / "absent-sensitive.json")])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue()),
                         {"passed": False, "status": "FAIL", "error": "cannot read proof"})

    def test_old_and_new_clis_reject_each_others_formats(self):
        directory = self.scratch_directory()
        document = mathematical_fixture()
        new_file = directory / "new-format.json"
        old_file = directory / "old-format.json"
        new_file.write_text(json.dumps(document), encoding="utf-8")
        old_file.write_text(json.dumps(approximation_projection(document)), encoding="utf-8")
        for module, path in [(verifier, old_file), (old, new_file)]:
            result = subprocess.run([sys.executable, str(Path(module.__file__).resolve()),
                                     "--input", str(path)], capture_output=True, text=True,
                                    env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), timeout=20)
            with self.subTest(module=module.__name__):
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(json.loads(result.stdout),
                                 {"passed": False, "status": "FAIL", "error": "certificate rejected"})
                self.assertEqual(result.stderr, "")

    def test_empty_counts_and_invalid_world_tolerance(self):
        document = mathematical_fixture()
        document["cases"] = []
        with self.assertRaises(ValueError):
            verifier.verify_bundle(document)
        document = mathematical_fixture()
        document["cases"][0]["approximation"]["leaves"] = []
        document["cases"][0]["approximation"]["samples"] = [None]
        with self.assertRaises(ValueError):
            verifier.verify_bundle(document)
        for tolerance in [F(0), F(-1, 200), F(1, 199)]:
            document = mathematical_fixture()
            document["cases"][0]["tolerance"] = rat(tolerance)
            with self.subTest(tolerance=tolerance), patch.object(old, "verify_bundle", wraps=old.verify_bundle) as real_old:
                with self.assertRaisesRegex(ValueError, "tolerance"):
                    verifier.verify_bundle(document)
                real_old.assert_called_once()
        document = mathematical_fixture()
        document["cases"][0]["id"] = "!" * 128
        self.assertTrue(verifier.verify_bundle(document)["passed"])

    def test_gcd_preflight_after_text_admission_before_fraction_construction(self):
        # Let token scanning complete; refuse specifically before normalization.
        for resource, limit, value in [("MAX_WEIGHTED_WORK", 1, rat(1)),
                                       ("MAX_OPERATIONS", 1, rat(1)),
                                       ("MAX_INTERMEDIATE_BITS", 8, rat(1 << 8))]:
            with (self.subTest(resource=resource), patch.object(verifier, resource, limit),
                  patch.object(verifier, "gcd", side_effect=AssertionError("gcd allocated")) as gcd_observer,
                  patch.object(verifier, "Fraction", side_effect=AssertionError("Fraction allocated")) as fraction_observer):
                with self.assertRaises(old.BudgetExceeded):
                    verifier._rat(value, verifier._InverseBudget())
                gcd_observer.assert_not_called()
                fraction_observer.assert_not_called()

    def test_mathematical_edge_linear_composition(self):
        self.assertTrue(callable(getattr(verifier, "verify_bundle", None)),
                        "public verify_bundle must be callable")
        self.assertEqual(verifier.verify_bundle(mathematical_fixture()),
                         {"passed": True, "cases": 1, "leaves": 1, "samples": 2})


if __name__ == "__main__":
    unittest.main()
