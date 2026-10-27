"""Read-only review: independent interval witnesses and Fraction arithmetic."""
from pathlib import Path
from fractions import Fraction
from collections import Counter
import importlib.util
import json
import os
import random
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
NODE = 'C:/Program Files/nodejs/node.exe'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
os.environ['TMPDIR'] = str(HERE)
os.environ['TMP'] = str(HERE)
os.environ['TEMP'] = str(HERE)
sys.dont_write_bytecode = True

# Decoder is an integer power-of-two identity, not the oracle's struct decoder.
def exact_value(bits):
    magnitude = bits & 0x7fffffff
    exponent, significand = magnitude >> 23, magnitude & 0x7fffff
    if exponent:
        significand |= 1 << 23
    power = exponent - 150 if exponent else -149
    value = Fraction(significand << power) if power >= 0 else Fraction(significand, 1 << -power)
    return -value if bits >> 31 else value

threshold = Fraction(2**128 - 2**103)
def witness(value, result):
    if isinstance(result, dict):
        assert result == {'error':'FLOAT32_OVERFLOW'} and abs(value) >= threshold, (value, result)
        return 'overflow'
    assert type(result) is int and 0 <= result <= 0xffffffff
    assert (result >> 31) == int(value < 0), (value, result)
    magnitude = result & 0x7fffffff
    assert magnitude <= 0x7f7fffff and abs(value) < threshold
    distance = abs(abs(value) - exact_value(magnitude))
    for neighbor in (magnitude - 1, magnitude + 1):
        if 0 <= neighbor <= 0x7f7fffff:
            other = abs(abs(value) - exact_value(neighbor))
            assert distance <= other, (value, result, neighbor)
            if distance == other:
                assert magnitude % 2 == 0, (value, result, neighbor)
    return 'finite'

rng = random.Random(0x6d617468)
round_values = []
for _ in range(3000):
    n = rng.getrandbits(rng.randrange(1, 1800)) + 1
    d = rng.getrandbits(rng.randrange(1, 1800)) + 1
    round_values.append(Fraction(n if rng.randrange(2) else -n, d))
for _ in range(1000):
    lower = rng.randrange(0x7f7fffff)
    a, b = exact_value(lower), exact_value(lower+1)
    midpoint, step = (a+b)/2, (b-a)/2**rng.randrange(10,1000)
    for delta in (-step, Fraction(0), step):
        value = midpoint + delta
        round_values.append(value if rng.randrange(2) else -value)
# Inputs at raw bit boundaries include legitimate conservative refusals.
for width in (3900, 4070, 4095, 4096):
    for _ in range(50):
        d = (1 << (width-1)) | rng.getrandbits(width-1)
        n = (1 << (width-1)) | rng.getrandbits(width-1)
        round_values.append(Fraction(n if rng.randrange(2) else -n, d))
round_values += [Fraction(0), Fraction(-1,2**4095)]
for sign in (-1,1):
    for value in (threshold-1, threshold, threshold+1, Fraction(1,2**150), Fraction(1,2**149)):
        round_values.append(sign*value)
decode_bits = [0, 0x80000000, 1, 0x80000001, 0x007fffff, 0x00800000, 0x7f7fffff, 0xff7fffff]
while len(decode_bits)<2000:
    bits = rng.getrandbits(32)
    if ((bits>>23)&255)!=255:
        decode_bits.append(bits)
arithmetic=[]
for _ in range(1000):
    raw = [rng.getrandbits(rng.randrange(1,450))+1 for _ in range(4)]
    for i in (0,1,2,3):
        if rng.randrange(2): raw[i] = -raw[i]
    arithmetic.append(raw)
payload={'round':[[str(v.numerator),str(v.denominator)] for v in round_values], 'decode':decode_bits, 'arithmetic':[[str(x) for x in row] for row in arithmetic]}
(HERE/'inputs.json').write_text(json.dumps(payload),encoding='utf-8')
proc=subprocess.run([NODE,str(HERE/'runner.cjs'),str(HERE/'inputs.json'),str(HERE/'outputs.json')],capture_output=True,text=True,check=True)
(HERE/'harness-node.log').write_text(proc.stdout+proc.stderr,encoding='utf-8')
actual=json.loads((HERE/'outputs.json').read_text(encoding='utf-8'))
counts=Counter()
for value,result in zip(round_values,actual['round'],strict=True):
    if result=={'error':'BUDGET_EXCEEDED'}:
        counts['round_conservative_refusals']+=1
    else:
        counts['round_'+witness(value,result)]+=1
for bits,result in zip(decode_bits,actual['decode'],strict=True):
    value=exact_value(bits)
    assert result==[str(value.numerator),str(value.denominator)], (bits,result,value)
    counts['decode_exact']+=1
for raw,result in zip(arithmetic,actual['arithmetic'],strict=True):
    n,d,m,e=raw
    a,b=Fraction(n,d),Fraction(m,e)
    expected={'a':a,'b':b,'add':a+b,'subtract':a-b,'multiply':a*b,'divide':a/b}
    for key,value in expected.items():
        assert result[key]==[str(value.numerator),str(value.denominator)], (key,raw,result)
        counts['arithmetic_fraction_assertions']+=1
    assert result['compare']==((a>b)-(a<b)), (raw,result)
    counts['comparison_exact']+=1

# Test the reference oracle against the same independent interval witnesses.
spec=importlib.util.spec_from_file_location('review_oracle',REPO/'tests/reference/v03_f32_oracle.py')
oracle=importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
for value in round_values:
    result=oracle.round_fraction(value)
    encoded={'error':'FLOAT32_OVERFLOW'} if result['kind']=='overflow' else result['bits']
    witness(value,encoded)
    counts['oracle_interval_witnesses']+=1
fixture=oracle.build_fixture(oracle.default_cases())
stored=json.loads((REPO/'tests/fixtures/v03-f32-oracle.json').read_text(encoding='utf-8'))
assert fixture==stored
counts['fixture_semantically_reproduced']=len(fixture['cases'])
assert len({c['id'] for c in fixture['cases']})==len(fixture['cases'])
for case in fixture['cases']:
    value=oracle.parse_rational(case['n'],case['d'])
    result=case['expected']
    witness(value,{'error':'FLOAT32_OVERFLOW'} if result['kind']=='overflow' else result['bits'])
    counts['fixture_interval_witnesses']+=1
summary={'passed':True,'counts':dict(counts),'seed':'0x6d617468','method':'Exact Fraction distances to adjacent finite values, parity on equal distances, exact overflow threshold; integer F32 decoder independent of production and oracle decoding.'}
(HERE/'harness-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
