"""Read-only repository audit; all output lives next to this scratch script."""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('review_oracle', ROOT / 'tests/reference/v03_f32_oracle.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
fixture_path = ROOT / 'tests/fixtures/v03-f32-oracle.json'
before = fixture_path.read_bytes()
command = [sys.executable, str(ROOT / 'tests/reference/v03_f32_oracle.py'), '--output', str(OUT / 'regenerated-fixture.json')]
generated = subprocess.run(command, text=True, capture_output=True)
assert generated.returncode == 0, generated.stderr
fixture = json.loads(before)
assert fixture == json.loads((OUT / 'regenerated-fixture.json').read_bytes())
assert len(fixture['cases']) == len({c['id'] for c in fixture['cases']}) == 799
for c in fixture['cases']:
    assert set(c) == {'id', 'n', 'd', 'expected'}
    value = oracle.parse_rational(c['n'], c['d'])
    assert c['expected'] == oracle.round_fraction(value)
refused = subprocess.run(command, text=True, capture_output=True)
assert refused.returncode != 0 and '--force' in refused.stderr
assert fixture_path.read_bytes() == before
rng = random.Random(0x8192BE)
rounding = []
for i in range(1200):
    nwidth = rng.choice([1, 8, 24, 127, 149, 256, 1024, 2048, 4000, 4096])
    dwidth = rng.choice([1, 8, 24, 127, 149, 256, 1024, 2048, 4000, 4096])
    n = (rng.getrandbits(nwidth) | 1) * (-1 if i % 2 else 1)
    d = rng.getrandbits(dwidth) | 1
    g = math.gcd(n, d)
    n, d = n // g, d // g
    rounding.append({'n': str(n), 'd': str(d), 'expected': oracle.round_fraction(oracle.parse_rational(str(n), str(d)))})
arithmetic = []
from fractions import Fraction
for i in range(300):
    a = Fraction(rng.randrange(-2**100, 2**100), rng.randrange(1, 2**100))
    b = Fraction(rng.randrange(-2**100, 2**100), rng.randrange(1, 2**100))
    def pair(q):
        return [str(q.numerator), str(q.denominator)]
    arithmetic.append({'a': pair(a), 'b': pair(b), 'add': pair(a+b), 'subtract': pair(a-b),
                       'multiply': pair(a*b), 'divide': pair(a/b), 'compare': (a>b)-(a<b)})
(OUT / 'additional-cases.json').write_text(json.dumps({'rounding': rounding, 'arithmetic': arithmetic}), encoding='utf-8')
result = {'fixture_cases': len(fixture['cases']), 'unique_ids': len({c['id'] for c in fixture['cases']}),
          'semantic_reproduction': True, 'fixture_sha256': hashlib.sha256(before).hexdigest(),
          'without_force_refused': refused.returncode != 0, 'original_fixture_unchanged': fixture_path.read_bytes() == before,
          'additional_rounding_cases': len(rounding), 'additional_arithmetic_cases': len(arithmetic)}
(OUT / 'independent-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
