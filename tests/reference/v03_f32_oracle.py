"""Independent exact-rational to Float32 reference oracle (stdlib only).

Run from the repository root (Git Bash):
  PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests/reference -p test_v03_f32_oracle.py -v
  python tests/reference/v03_f32_oracle.py --output tests/fixtures/v03-f32-oracle.json
Reproduction/owner-authorized replacement requires the explicit --force flag.

The public helpers are parse_rational(n, d), round_fraction(Fraction),
build_fixture([{id,n,d}, ...]) and default_cases(). Decimal strings must be
canonical ASCII, gcd-reduced, with d > 0 and zero written 0/1 (never -0).
Inputs are capped at 4096 bits per integer, 1234 decimal digits (plus a possible
numerator minus sign), 2048 cases and 96 ASCII characters per unique id.
Rejected input raises TypeError/ValueError; finite results carry uint32 bits,
including signed underflow zero. Overflow has no bits and is never Infinity.

Only decoding a finite Float32 uses Python float: F32 -> F64 is exact.
No rational -> F64 conversion participates in oracle rounding. A monotonic
binary search brackets the magnitude among positive finite F32 codes; Fraction
compares both distances exactly, resolving equal distances by code parity.
The exact overflow midpoint is handled first, and the sign is applied last.
Synthetic fixtures are arithmetic evidence, not geometry or clinical validation.
"""
from fractions import Fraction
from math import gcd
from pathlib import Path
import argparse
import json
import re
import random
import struct

MAX_FINITE_BITS = 0x7F7FFFFF
MAX_INPUT_BITS = 4096
MAX_DECIMAL_DIGITS = len(str((1 << MAX_INPUT_BITS) - 1))
MAX_CASES = 2048
MAX_ID_LENGTH = 96


def default_cases():
    """Deterministic synthetic inputs; no expected results are stored here."""
    cases = [{"id": "zero", "n": "0", "d": "1"}]

    def append_signed(identifier, value):
        for sign, suffix in ((1, "positive"), (-1, "negative")):
            signed = sign * value
            cases.append({"id": f"{identifier}-{suffix}",
                          "n": str(signed.numerator), "d": str(signed.denominator)})

    tiny_step = Fraction(1, 2**151)
    minnormal = Fraction(1, 2**126)
    normal_midpoint = minnormal - Fraction(1, 2**150)
    overflow = Fraction(2**128 - 2**103)
    boundaries = [
        ("double-round", Fraction(1) + Fraction(1, 2**24) + Fraction(1, 2**200)),
        ("double-round-down", Fraction(1) + Fraction(3, 2**24) - Fraction(1, 2**200)),
        ("half-even-lower", Fraction(1) + Fraction(1, 2**24)),
        ("half-even-upper", Fraction(1) + Fraction(3, 2**24)),
        ("minsubnormal", Fraction(1, 2**149)),
        ("minnormal", minnormal),
        ("maxsubnormal", minnormal - Fraction(1, 2**149)),
        ("underflow-below", tiny_step),
        ("underflow-half", Fraction(1, 2**150)),
        ("underflow-above", 3 * tiny_step),
        ("subnormal-normal-below", normal_midpoint - tiny_step),
        ("subnormal-normal-half", normal_midpoint),
        ("subnormal-normal-above", normal_midpoint + tiny_step),
        ("maxfinite", Fraction((2**24 - 1) * 2**104)),
        ("overflow-below", overflow - 1),
        ("overflow-half", overflow),
        ("overflow-above", overflow + 1),
    ]
    for identifier, value in boundaries:
        append_signed(identifier, value)
    for exponent in range(-126, 128):
        value = Fraction(2**exponent) if exponent >= 0 else Fraction(1, 2**-exponent)
        append_signed(f"binade-{exponent}", value)

    rng = random.Random(0xF32003)
    for index in range(32):
        lower = rng.randrange(MAX_FINITE_BITS)
        a, b = _positive_value(lower), _positive_value(lower + 1)
        midpoint, epsilon = (a + b) / 2, (b - a) / 2**100
        for suffix, value in (("below", midpoint - epsilon),
                              ("half", midpoint), ("above", midpoint + epsilon)):
            append_signed(f"midpoint-{index}-{suffix}", value)
    for index in range(32):
        value = Fraction(rng.getrandbits(80) + 1, rng.getrandbits(80) + 1)
        exponent = rng.randrange(-170, 131)
        value *= Fraction(2**exponent) if exponent >= 0 else Fraction(1, 2**-exponent)
        append_signed(f"rational-{index}", value)
    return cases


def build_fixture(cases):
    """Compute expected results from a bounded list of {id,n,d} dictionaries."""
    if type(cases) is not list:
        raise TypeError("cases must be a list")
    if not 1 <= len(cases) <= MAX_CASES:
        raise ValueError("case count outside 1..2048")
    seen, output = set(), []
    for case in cases:
        if type(case) is not dict or case.keys() != {"id", "n", "d"}:
            raise ValueError("case must contain exactly id, n, d")
        identifier = case["id"]
        if (type(identifier) is not str or
                not 1 <= len(identifier) <= MAX_ID_LENGTH or
                not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", identifier)):
            raise ValueError("invalid case id")
        if identifier in seen:
            raise ValueError("duplicate case id")
        seen.add(identifier)
        value = parse_rational(case["n"], case["d"])
        output.append(dict(case, expected=round_fraction(value)))
    return {"format": "OrthoSculptFloat32Oracle", "version": 1, "cases": output}


def parse_rational(n, d):
    """Accept reduced canonical ASCII decimal n/d; mathematical zero is 0/1."""
    if type(n) is not str or type(d) is not str:
        raise TypeError("n and d must be decimal strings")
    # Constant-time length checks precede regex, integer parsing and gcd.
    if (len(n) > MAX_DECIMAL_DIGITS + n.startswith("-") or
            len(d) > MAX_DECIMAL_DIGITS):
        raise ValueError("decimal input length exceeds limit")
    if not re.fullmatch(r"0|-?[1-9][0-9]*", n):
        raise ValueError("noncanonical numerator")
    if not re.fullmatch(r"[1-9][0-9]*", d):
        raise ValueError("noncanonical positive denominator")
    numerator, denominator = int(n), int(d)
    if (numerator.bit_length() > MAX_INPUT_BITS or
            denominator.bit_length() > MAX_INPUT_BITS):
        raise ValueError("rational input exceeds bit limit")
    if gcd(numerator, denominator) != 1:
        raise ValueError("rational must be reduced (zero is 0/1)")
    return Fraction(numerator, denominator)


def _positive_value(bits):
    """Decode finite F32 exactly: every F32 is exactly representable in F64."""
    return Fraction(struct.unpack(">f", struct.pack(">I", bits))[0])


def round_fraction(value):
    """Search ordered positive F32 codes, then compare exact distances."""
    if type(value) is not Fraction:
        raise TypeError("value must be a Fraction")
    if (value.numerator.bit_length() > MAX_INPUT_BITS or
            value.denominator.bit_length() > MAX_INPUT_BITS):
        raise ValueError("rational input exceeds bit limit")
    sign = 0x80000000 if value < 0 else 0
    value = abs(value)
    # Midpoint between max finite and the hypothetical next binade, 2**128.
    # At equality the latter has even significand, so the result overflows.
    if value >= Fraction(2**128 - 2**103):
        return {"kind": "overflow"}
    low, high = 0, MAX_FINITE_BITS
    while low < high:
        middle = (low + high + 1) // 2
        if _positive_value(middle) <= value:
            low = middle
        else:
            high = middle - 1
    chosen = low
    if low < MAX_FINITE_BITS:
        lower_distance = value - _positive_value(low)
        upper_distance = _positive_value(low + 1) - value
        if upper_distance < lower_distance or (
            upper_distance == lower_distance and (low + 1) % 2 == 0
        ):
            chosen = low + 1
    return {"kind": "finite", "bits": chosen | sign}


def main(argv=None):
    """Generate a real JSON fixture; refuse replacement unless --force is given."""
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--force", action="store_true", default=False,
                        help="explicitly authorize replacing an existing output")
    args = parser.parse_args(argv)
    try:
        if args.output.exists() and not args.force:
            raise FileExistsError("output exists; use --force to replace it")
        fixture = build_fixture(default_cases())
        payload = (json.dumps(fixture, indent=2, ensure_ascii=True) + "\n").encode("ascii")
        with args.output.open("wb" if args.force else "xb") as destination:
            destination.write(payload)
    except (OSError, TypeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps({"output": str(args.output), "cases": len(fixture["cases"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
