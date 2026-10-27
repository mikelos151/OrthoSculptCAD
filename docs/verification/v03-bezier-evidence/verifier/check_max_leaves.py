"""Explicit synthetic in-memory capacity check; no TS output is asserted."""
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, "C:/Users/sandr/OrthoSculptCAD/tests/reference")
from test_v03_bezier_verify import linear_bundle, rat, point
import v03_bezier_verify as verifier

count = 20_000
document = linear_bundle()
case = document["cases"][0]
case["id"] = "synthetic-constant-20000-leaves"
zero_point = point((0, 0, 0))
controls = [zero_point for _ in range(4)]
case["input"]["controls4x3Rat"] = controls
result = case["result"]
from fractions import Fraction
parameters = [rat(Fraction(i, count)) for i in range(count+1)]
result["samples"] = [{"t": t, "point3Rat": zero_point} for t in parameters]
result["leaves"] = [{"t0": parameters[i], "t1": parameters[i+1], "controls4x3Rat": controls,
                     "upperSquaredRat": rat(0)} for i in range(count)]
started = time.perf_counter()
summary = verifier.verify_bundle(document)
assert summary == {"passed": True, "cases": 1, "leaves": count, "samples": count+1}, summary
elapsed = time.perf_counter()-started
output = {"scope": "synthetic Python in-memory capacity check, NOT TS evidence",
          "summary": summary, "elapsed_seconds": elapsed}
Path(__file__).with_suffix(".log").write_text(json.dumps(output, indent=2), encoding="utf-8")
print(json.dumps(output))
