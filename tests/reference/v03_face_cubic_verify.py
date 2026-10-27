"""Independent exact inverse-chart verifier for supplied-face cubics.

Usage: python tests/reference/v03_face_cubic_verify.py --input proof.json
Format: OrthoSculptFaceCubicProof/v1; literal controls/triangle/
barycentricControls fields only, without aliases or numeric coercion.

Containment recovers barycentrics by the first nonzero signed XY/XZ/YZ
minor and checks the unused-axis residual. Nonnegative, unit-sum controls
prove the WHOLE cubic lies in the supplied closed triangle by the Bernstein
convex hull property. They do not prove an arbitrary rejected curve lies
outside. The unchanged public M0c1 verifier is called ONCE for all cases;
its polynomial/continuous-bound proof supplies sample identity, full
parameter coverage and tolerance. Triangle convexity then contains every
whole polyline segment. Point sampling is never the containment proof.

There are two explicit bounded reference budgets: this module's cumulative
inverse budget (4096 input bits, 32768 unreduced intermediate bits, 20M
operations, 500M limb-work units, 16 MiB numeric characters), and M0c1's
unchanged budget. Preflight precedes Fraction products, division and GCD.
These are algorithmic caps, not measured RSS/time guarantees. Either budget
refusal is UNKNOWN, without partial summaries; malformed proofs are FAIL.

No source identity, topology, regularity, global embedding, cut/shell,
collar or clinical suitability is certified. Test fixtures are mathematical,
not TS exports. No new TypeScript implementation is imported or consulted.
"""
from fractions import Fraction
from math import gcd
import argparse
import json
import os
import re
import stat
import v03_bezier_verify as bezier

MAX_CASES = 64
MAX_LEAVES = 20_000
MAX_INPUT_BITS = 4096
MAX_DECIMAL_DIGITS = 1234
MAX_OPERATIONS = 20_000_000
MAX_INTERMEDIATE_BITS = 32_768
MAX_NUMERIC_CHARS = 16 * 1024 * 1024
MAX_WEIGHTED_WORK = 500_000_000
MAX_FILE_BYTES = 16 * 1024 * 1024
_ID = re.compile(r"[ -~]{1,128}", re.ASCII)

BudgetExceeded = bezier.BudgetExceeded


def _require(condition, reason):
    if not condition:
        raise ValueError(reason)


def _object(value, keys):
    _require(type(value) is dict and len(value) == len(keys)
             and all(type(key) is str for key in value) and value.keys() == keys,
             "invalid object shape")


def _array(value, length=None):
    _require(type(value) is list and (length is None or len(value) == length),
             "invalid array shape")


def _preflight_document(document, budget):
    """Count ALL cases/leaves before interpreting ANY rational payload."""
    _object(document, {"format", "version", "cases"})
    _require(type(document["format"]) is str
             and document["format"] == "OrthoSculptFaceCubicProof"
             and type(document["version"]) is int and document["version"] == 1,
             "unsupported proof format")
    cases = document["cases"]
    _array(cases)
    _require(1 <= len(cases) <= MAX_CASES, "invalid case count")
    identities, total = set(), 0
    for case in cases:
        budget.charge()
        _object(case, {"id", "tolerance", "containment", "approximation"})
        identity = case["id"]
        _require(type(identity) is str and len(identity) <= 128
                 and _ID.fullmatch(identity) is not None, "invalid identifier")
        _require(identity not in identities, "duplicate identifier")
        identities.add(identity)
        containment = case["containment"]
        _object(containment, {"kind", "triangle", "barycentricControls", "controls"})
        _require(type(containment["kind"]) is str
                 and containment["kind"] == "supplied-face-cubic-hull-v1", "invalid kind")
        result = case["approximation"]
        _object(result, {"kind", "samples", "leaves", "maxUpperSquared"})
        _require(type(result["kind"]) is str and result["kind"] == "cubic-parametric-bound-v1",
                 "invalid approximation kind")
        _array(result["leaves"])
        total += len(result["leaves"])
        _require(1 <= len(result["leaves"]) and total <= MAX_LEAVES,
                 "invalid aggregate leaf count")
        _array(result["samples"], len(result["leaves"]) + 1)
    return cases


class _InverseBudget:
    """One cumulative inverse-stage budget for the complete bundle."""

    def __init__(self):
        self.operations = 0
        self.numeric_chars = 0
        self.limb_work = 0

    def admit_text(self, chars):
        if self.numeric_chars + chars > MAX_NUMERIC_CHARS:
            raise BudgetExceeded("inverse numeric character budget exhausted")
        # Decimal parsing and scanning are charged before int()/regex.
        self.charge(((chars + 18) // 19) ** 2)
        self.numeric_chars += chars

    def charge(self, work=1):
        if self.operations >= MAX_OPERATIONS or self.limb_work + work > MAX_WEIGHTED_WORK:
            raise BudgetExceeded("inverse operation budget exhausted")
        self.operations += 1
        self.limb_work += work

    def check_size(self, *bounds):
        if max(bounds) > MAX_INTERMEDIATE_BITS:
            raise BudgetExceeded("inverse intermediate budget exhausted")

    def calculate(self, operation, left, right):
        # Bounds describe unreduced integers BEFORE Fraction's products/GCDs.
        # Division reverses the right operand, including its numerator's sign;
        # orientation must never be erased with abs(determinant).
        ln, ld = max(1, left.numerator.bit_length()), left.denominator.bit_length()
        rn, rd = max(1, right.numerator.bit_length()), right.denominator.bit_length()
        if operation == "div":
            _require(right.numerator != 0, "zero determinant")
            bounds = (ln + rd, ld + rn)
        elif operation == "mul":
            bounds = (ln + rn, ld + rd)
        elif operation in ("eq", "lt"):
            bounds = (ln + rd, rn + ld)
        else:
            bounds = (max(ln + rd, rn + ld) + 1, ld + rd)
        self.check_size(ln, ld, rn, rd, *bounds)
        self.charge(((ln + ld + rn + rd + 63) // 64) ** 2)
        if operation == "add":
            return left + right
        if operation == "sub":
            return left - right
        if operation == "mul":
            return left * right
        if operation == "div":
            return left / right
        if operation == "eq":
            return left == right
        if operation == "lt":
            return left < right
        raise AssertionError("unknown internal operation")


def _rat(value, budget):
    _object(value, {"n", "d"})
    n, d = value["n"], value["d"]
    _require(type(n) is str and type(d) is str, "invalid integer type")
    _require(1 <= len(n) <= MAX_DECIMAL_DIGITS + n.startswith("-")
             and 1 <= len(d) <= MAX_DECIMAL_DIGITS,
             "integer token too long")
    budget.admit_text(len(n) + len(d))
    _require(re.fullmatch(r"(?:0|-?[1-9][0-9]*)", n, re.ASCII) is not None
             and re.fullmatch(r"[1-9][0-9]*", d, re.ASCII) is not None,
             "noncanonical integer")
    n, d = int(n), int(d)
    _require(abs(n).bit_length() <= MAX_INPUT_BITS and d.bit_length() <= MAX_INPUT_BITS,
             "input integer too large")
    budget.check_size(max(1, n.bit_length()), d.bit_length())
    # Charge both the canonicality GCD and Fraction's normalization GCD
    # before either runs; unreduced operands are already bit-size bounded.
    budget.charge(2 * ((max(1, n.bit_length()) + d.bit_length() + 63) // 64) ** 2)
    _require(gcd(n, d) == 1, "noncanonical rational")
    return Fraction(n, d)


def _rows(value, budget, length=4):
    _array(value, length)
    for row in value:
        budget.charge()
        _array(row, 3)
    return tuple(tuple(_rat(x, budget) for x in row) for row in value)


def _verify_containment(value, budget):
    triangle = _rows(value["triangle"], budget, 3)
    weights = _rows(value["barycentricControls"], budget)
    controls = _rows(value["controls"], budget)
    op = budget.calculate
    zero, one = Fraction(0), Fraction(1)
    a, b, c = triangle
    e = tuple(op("sub", b[i], a[i]) for i in range(3))
    g = tuple(op("sub", c[i], a[i]) for i in range(3))

    def minor(u, v, r, s):
        return op("sub", op("mul", u[r], v[s]), op("mul", u[s], v[r]))

    def simplex(values):
        total = zero
        for weight in values:
            _require(not op("lt", weight, zero), "negative simplex weight")
            total = op("add", total, weight)
        _require(op("eq", total, one), "nonunit simplex sum")

    for r, s, k in ((0, 1, 2), (0, 2, 1), (1, 2, 0)):
        determinant = minor(e, g, r, s)
        if not op("eq", determinant, zero):
            break
    else:
        raise ValueError("degenerate triangle")
    for point, declared in zip(controls, weights):
        h = tuple(op("sub", point[i], a[i]) for i in range(3))
        wb = op("div", minor(h, g, r, s), determinant)
        wc = op("div", minor(e, h, r, s), determinant)
        recovered = (op("sub", op("sub", one, wb), wc), wb, wc)
        residual = op("add", op("mul", wb, e[k]), op("mul", wc, g[k]))
        _require(op("eq", h[k], residual), "off-plane control")
        simplex(declared)
        simplex(recovered)
        _require(all(op("eq", x, y) for x, y in zip(recovered, declared)),
                 "inverse weight mismatch")


def verify_bundle(document):
    """Publish a summary only after both complete proofs pass."""
    budget = _InverseBudget()
    cases = _preflight_document(document, budget)
    projection = {"format": "OrthoSculptBezierProof", "version": 1, "cases": []}
    for case in cases:
        budget.charge()
        _verify_containment(case["containment"], budget)
        projection["cases"].append({
            "id": case["id"],
            "input": {"controls": case["containment"]["controls"], "tolerance": case["tolerance"]},
            "result": case["approximation"]})
    return bezier.verify_bundle(projection)


def _json_object(pairs):
    _require(len(pairs) <= 4, "oversized JSON object")
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def _json_integer(token):
    _require(len(token) <= 10, "oversized JSON integer")
    return int(token)


def _reject_number(token):
    raise ValueError("noninteger JSON token")


def _check_file(metadata):
    _require(stat.S_ISREG(metadata.st_mode), "input must be a regular file")
    _require(metadata.st_size <= MAX_FILE_BYTES, "input file too large")


def _load_document(path):
    # Check BEFORE open, repeat on the descriptor, then bound the read even
    # if a regular file grows after fstat. Never allocate an unlimited read.
    _check_file(os.stat(path))
    with open(path, "rb") as stream:
        _check_file(os.fstat(stream.fileno()))
        data = stream.read(MAX_FILE_BYTES + 1)
    _require(len(data) <= MAX_FILE_BYTES, "input file too large")
    return json.loads(data.decode("utf-8"), object_pairs_hook=_json_object,
                      parse_int=_json_integer, parse_float=_reject_number,
                      parse_constant=_reject_number)


def main(argv=None):
    """Exit 0 complete PASS, 1 rejection/unreadable, 2 budget UNKNOWN."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    arguments = parser.parse_args(argv)
    try:
        summary = verify_bundle(_load_document(arguments.input))
    except BudgetExceeded:
        print(json.dumps({"passed": False, "status": "UNKNOWN",
                          "error": "verification budget exhausted"}))
        return 2
    except OSError:
        print(json.dumps({"passed": False, "status": "FAIL", "error": "cannot read proof"}))
        return 1
    except (TypeError, ValueError, RecursionError):
        print(json.dumps({"passed": False, "status": "FAIL", "error": "certificate rejected"}))
        return 1
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
