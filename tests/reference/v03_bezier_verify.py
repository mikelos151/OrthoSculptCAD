"""Independent exact verifier for OrthoSculptBezierProof/v1.

Usage: python tests/reference/v03_bezier_verify.py --input certificate.json
Tests: python -m unittest discover -s tests/reference -p test_v03_bezier_verify.py -v

Frozen JSON fields are controls, tolerance, point,
upperSquared and maxUpperSquared (no legacy-name aliases).
Each rational is exactly {"n": canonical ASCII integer, "d": positive integer},
with string values, gcd=1, and at most 4096 input bits.

Root/subcurve coefficient identities and the degree-6 Bernstein convex hull
prove the whole continuous interval, never a collection of point probes.
All cases share finite operation, limb-work, input-character and unreduced
intermediate-size budgets. Conservative budget refusal is UNKNOWN, not a
geometry failure; these caps do not guarantee whole-process RSS or wall time.

This checks local cubic-to-chord approximation only, not embedding, simplicity,
mesh topology, offsets, or clinical suitability. No TypeScript is imported.
"""

from fractions import Fraction
from math import gcd
import argparse
import json
import os
import re
import stat

MAX_CASES = 64
MAX_LEAVES = 20_000
MAX_INPUT_BITS = 4096
MAX_DECIMAL_DIGITS = 1234
MAX_OPERATIONS = 20_000_000
MAX_WEIGHTED_WORK = 500_000_000
MAX_NUMERIC_CHARS = 16 * 1024 * 1024
MAX_INTERMEDIATE_BITS = 32_768
MAX_FILE_BYTES = 16 * 1024 * 1024
_ID = re.compile(r"[ -~]{1,128}", re.ASCII)
_NUMERATOR = re.compile(r"(?:0|-?[1-9][0-9]*)", re.ASCII)
_DENOMINATOR = re.compile(r"[1-9][0-9]*", re.ASCII)


def _require(condition, reason):
    if not condition:
        raise ValueError(reason)


def _object(value, keys):
    _require(type(value) is dict and len(value) == len(keys)
             and all(type(key) is str for key in value)
             and value.keys() == keys, "invalid object shape")


def _array(value, length=None):
    _require(type(value) is list, "invalid array type")
    if length is not None:
        _require(len(value) == length, "invalid array length")


def _rat(value, arithmetic):
    _object(value, {"n", "d"})
    n, d = value["n"], value["d"]
    # Length gates precede regex and int; never ask Python to parse huge tokens.
    _require(type(n) is str and type(d) is str, "invalid integer type")
    _require(1 <= len(n) <= MAX_DECIMAL_DIGITS + (n.startswith("-"))
             and 1 <= len(d) <= MAX_DECIMAL_DIGITS, "integer token too long")
    arithmetic.admit_input(n, d)
    _require(_NUMERATOR.fullmatch(n) is not None
             and _DENOMINATOR.fullmatch(d) is not None, "noncanonical integer")
    numerator, denominator = int(n), int(d)
    _require(abs(numerator).bit_length() <= MAX_INPUT_BITS
             and denominator.bit_length() <= MAX_INPUT_BITS, "input integer too large")
    _require(gcd(numerator, denominator) == 1, "noncanonical rational")
    return Fraction(numerator, denominator)


def _point(value, arithmetic):
    _array(value, 3)
    return tuple(_rat(component, arithmetic) for component in value)


def _controls(value, arithmetic):
    _array(value, 4)
    return tuple(_point(p, arithmetic) for p in value)


def _parse_document(document, arithmetic):
    _object(document, {"format", "version", "cases"})
    _require(type(document["format"]) is str and document["format"] == "OrthoSculptBezierProof"
             and type(document["version"]) is int and document["version"] == 1,
             "unsupported proof format")
    cases = document["cases"]
    _array(cases)
    _require(1 <= len(cases) <= MAX_CASES, "invalid case count")
    identities = set()
    total_leaves = 0
    # Count all leaves BEFORE parsing any of their rational payloads.
    for case in cases:
        _object(case, {"id", "input", "result"})
        identity = case["id"]
        _require(type(identity) is str and len(identity) <= 128
                 and _ID.fullmatch(identity) is not None, "invalid case identifier")
        _require(identity not in identities, "duplicate case identifier")
        identities.add(identity)
        _object(case["input"], {"controls", "tolerance"})
        result = case["result"]
        _object(result, {"kind", "samples", "leaves", "maxUpperSquared"})
        _require(type(result["kind"]) is str and result["kind"] == "cubic-parametric-bound-v1",
                 "unsupported certificate kind")
        _array(result["leaves"])
        total_leaves += len(result["leaves"])
        _require(1 <= len(result["leaves"]) and total_leaves <= MAX_LEAVES,
                 "invalid aggregate leaf count")
        _array(result["samples"], len(result["leaves"]) + 1)
    parsed = []
    for case in cases:
        root = _controls(case["input"]["controls"], arithmetic)
        tolerance = _rat(case["input"]["tolerance"], arithmetic)
        result = case["result"]
        samples = []
        for sample in result["samples"]:
            _object(sample, {"t", "point"})
            samples.append((_rat(sample["t"], arithmetic), _point(sample["point"], arithmetic)))
        leaves = []
        for leaf in result["leaves"]:
            _object(leaf, {"t0", "t1", "controls", "upperSquared"})
            leaves.append((_rat(leaf["t0"], arithmetic), _rat(leaf["t1"], arithmetic),
                           _controls(leaf["controls"], arithmetic), _rat(leaf["upperSquared"], arithmetic)))
        parsed.append((root, tolerance, samples, leaves, _rat(result["maxUpperSquared"], arithmetic)))
    return parsed


class BudgetExceeded(RuntimeError):
    """Incomplete verification (UNKNOWN), not evidence of corrupt geometry."""


class _Arithmetic:
    """Single arithmetic context, shared by every case and leaf."""

    def __init__(self):
        self.operations_left = MAX_OPERATIONS
        self.work_left = MAX_WEIGHTED_WORK
        self.numeric_chars_left = MAX_NUMERIC_CHARS
        self.max_bits = MAX_INTERMEDIATE_BITS

    def _charge(self, weight):
        if self.operations_left < 1 or self.work_left < weight:
            raise BudgetExceeded("verification work budget exhausted")
        self.operations_left -= 1
        self.work_left -= weight

    def admit_input(self, numerator, denominator):
        chars = len(numerator) + len(denominator)
        if self.numeric_chars_left < chars:
            raise BudgetExceeded("verification input budget exhausted")
        self.numeric_chars_left -= chars
        self._charge(((chars + 18) // 19) ** 2)

    def _preflight(self, left, right, operation):
        ln = max(1, abs(left.numerator).bit_length())
        ld = left.denominator.bit_length()
        rn = max(1, abs(right.numerator).bit_length())
        rd = right.denominator.bit_length()
        # Conservative *unreduced* product/sum bounds before Fraction allocates.
        # GCD cancellation can only reduce these sizes. Fixed-degree loops and
        # the charged limb-square estimate bound work too, not just result size.
        if operation == "mul":
            size = max(ln + rn, ld + rd)
        elif operation == "compare":
            size = max(ln + rd, rn + ld)
        else:
            size = max(max(ln + rd, rn + ld) + 1, ld + rd)
        if max(ln, ld, rn, rd, size) > self.max_bits:
            raise BudgetExceeded("verification intermediate size budget exhausted")
        self._charge(((ln + ld + rn + rd + 63) // 64) ** 2)

    def add(self, left, right):
        self._preflight(left, right, "add")
        return left + right

    def sub(self, left, right):
        self._preflight(left, right, "sub")
        return left - right

    def mul(self, left, right):
        self._preflight(left, right, "mul")
        return left * right

    def less(self, left, right):
        self._preflight(left, right, "compare")
        return left < right

    def total(self, values):
        result = Fraction(0)
        for value in values:
            result = self.add(result, value)
        return result


def _power(controls, arithmetic):
    # Cubic Bernstein -> ascending powers; each row is one coefficient.
    matrix = ((1, 0, 0, 0), (-3, 3, 0, 0), (3, -6, 3, 0), (-1, 3, -3, 1))
    return tuple(tuple(arithmetic.total(arithmetic.mul(controls[j][axis], Fraction(row[j]))
                                        for j in range(4) if row[j])
                       for row in matrix) for axis in range(3))


def _restrict(power, t0, t1, arithmetic):
    # [u^k] B(t0+h*u) = h^k sum(j>=k) a_j binom(j,k) t0^(j-k).
    from math import comb
    span = arithmetic.sub(t1, t0)
    t_powers, h_powers = [Fraction(1)], [Fraction(1)]
    for _ in range(3):
        t_powers.append(arithmetic.mul(t_powers[-1], t0))
        h_powers.append(arithmetic.mul(h_powers[-1], span))
    return tuple(tuple(arithmetic.mul(h_powers[k], arithmetic.total(
        arithmetic.mul(arithmetic.mul(axis[j], Fraction(comb(j, k))), t_powers[j-k])
        for j in range(k, 4))) for k in range(4)) for axis in power)


def _bernstein_bound6(restricted, arithmetic):
    """Bound ||B(u)-chord(u)||² on ALL [0,1], without point sampling.

    If p(u)=sum c_j*u^j has degree <=6, its degree-6 Bernstein
    coefficients are b_k=sum(j<=k) c_j*binom(k,j)/binom(6,j).
    Bernstein weights are nonnegative and sum to one, hence p<=max b_k.
    """
    from math import comb
    squared = [Fraction(0) for _ in range(7)]
    for axis in restricted:
        endpoint = arithmetic.total(axis)
        chord_slope = arithmetic.sub(endpoint, axis[0])
        difference = (Fraction(0), arithmetic.sub(axis[1], chord_slope), axis[2], axis[3])
        for i in range(4):
            for j in range(4):
                squared[i+j] = arithmetic.add(squared[i+j], arithmetic.mul(difference[i], difference[j]))
    maximum = Fraction(0)
    for k in range(7):
        coefficient = arithmetic.total(arithmetic.mul(squared[j], Fraction(comb(k, j), comb(6, j)))
                                       for j in range(k+1))
        if arithmetic.less(maximum, coefficient):
            maximum = coefficient
    return maximum


def _verify_case(case, arithmetic):
    root, tolerance, samples, leaves, maximum = case
    zero = Fraction(0)
    _require(arithmetic.less(zero, tolerance)
             and not arithmetic.less(Fraction(1, 200), tolerance), "invalid tolerance")
    tolerance_squared = arithmetic.mul(tolerance, tolerance)
    claimed_maximum = zero
    root_power = _power(root, arithmetic)
    _require(samples[0][0] == 0 and samples[-1][0] == 1, "invalid sample endpoints")
    previous = Fraction(0)
    for index, (t0, t1, controls, upper) in enumerate(leaves):
        _require(t0 == previous and arithmetic.less(t0, t1)
                 and not arithmetic.less(Fraction(1), t1), "invalid parameter coverage")
        _require(samples[index][0] == t0 and samples[index+1][0] == t1,
                 "sample parameter mismatch")
        restricted = _restrict(root_power, t0, t1, arithmetic)
        _require(restricted == _power(controls, arithmetic), "subcurve polynomial mismatch")
        _require(samples[index][1] == controls[0] and samples[index+1][1] == controls[3],
                 "sample point mismatch")
        _require(not arithmetic.less(upper, zero) and not arithmetic.less(tolerance_squared, upper),
                 "invalid claimed upper bound")
        independent = _bernstein_bound6(restricted, arithmetic)
        _require(not arithmetic.less(upper, independent)
                 and not arithmetic.less(tolerance_squared, independent), "continuous bound not certified")
        if arithmetic.less(claimed_maximum, upper):
            claimed_maximum = upper
        previous = t1
    _require(previous == 1, "incomplete parameter coverage")
    _require(maximum == claimed_maximum, "maximum upper bound mismatch")


def verify_bundle(document):
    """Return counts only after a complete certificate verification."""
    arithmetic = _Arithmetic()
    cases = _parse_document(document, arithmetic)
    for case in cases:
        _verify_case(case, arithmetic)
    return {"passed": True, "cases": len(cases),
            "leaves": sum(len(case[3]) for case in cases),
            "samples": sum(len(case[2]) for case in cases)}


def _json_object(pairs):
    # Every schema object has at most four keys. Reject duplicates rather than
    # silently accepting whichever spelling/value JSON's default loader keeps.
    _require(len(pairs) <= 4, "invalid JSON object size")
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def _json_integer(token):
    _require(len(token) <= 10, "invalid JSON integer size")
    return int(token)


def _reject_json_number(token):
    raise ValueError("noninteger JSON number")


def _check_file(metadata):
    _require(stat.S_ISREG(metadata.st_mode), "input must be a regular file")
    _require(metadata.st_size <= MAX_FILE_BYTES, "input file too large")


def _load_document(path):
    # Stat before open/read, then repeat on the opened descriptor. A bounded
    # read additionally handles growth after fstat; no unlimited read occurs.
    _check_file(os.stat(path))
    with open(path, "rb") as stream:
        _check_file(os.fstat(stream.fileno()))
        data = stream.read(MAX_FILE_BYTES + 1)
    _require(len(data) <= MAX_FILE_BYTES, "input file too large")
    return json.loads(data.decode("utf-8"), object_pairs_hook=_json_object,
                      parse_int=_json_integer, parse_float=_reject_json_number,
                      parse_constant=_reject_json_number)


def main(argv=None):
    """CLI exit 0 = complete PASS, 1 = rejected/unreadable, 2 = UNKNOWN budget."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="actual exported proof JSON file")
    arguments = parser.parse_args(argv)
    try:
        summary = verify_bundle(_load_document(arguments.input))
    except BudgetExceeded:
        print(json.dumps({"passed": False, "status": "UNKNOWN", "error": "verification budget exhausted"}))
        return 2
    except OSError:
        print(json.dumps({"passed": False, "status": "FAIL", "error": "cannot read proof"}))
        return 1
    except (TypeError, ValueError, RecursionError):
        # Never echo JSON decoder messages, paths, identifiers, or coordinates.
        print(json.dumps({"passed": False, "status": "FAIL", "error": "certificate rejected"}))
        return 1
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
