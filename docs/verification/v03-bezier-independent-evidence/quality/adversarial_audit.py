import contextlib
import copy
from fractions import Fraction
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-bezier-quality-review')
sys.path.insert(0, str(ROOT / 'tests/reference'))
import v03_bezier_verify as v

records = []
def check(name, action):
    action()
    records.append({'name': name, 'passed': True})
def reject(doc):
    try:
        v.verify_bundle(doc)
    except (ValueError, TypeError):
        return
    raise AssertionError('Malformed certificate accepted')
def rat_plus_one(rat):
    number = Fraction(int(rat['n']), int(rat['d'])) + 1
    return {'n': str(number.numerator), 'd': str(number.denominator)}
def single(case):
    return {'format': 'OrthoSculptBezierProof', 'version': 1, 'cases': [copy.deepcopy(case)]}
def cli(path):
    result = subprocess.run([sys.executable, '-B', str(ROOT/'tests/reference/v03_bezier_verify.py'), '--input', str(path)], capture_output=True, text=True, timeout=15)
    assert result.stderr == '', result.stderr
    return result.returncode, json.loads(result.stdout)

source = OUT/'actual-ts-export.json'
bundle = v._load_document(source)
expected = {'passed': True, 'cases': 6, 'leaves': 97, 'samples': 103}
assert v.verify_bundle(bundle) == expected
assert cli(source) == (0, expected)
records.append({'name': 'fresh_actual_TS_export_API_and_CLI', 'passed': True, 'summary': expected, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
fixture = v._load_document(ROOT/'tests/fixtures/v03-bezier-proof-actual.json')
assert fixture == bundle
records.append({'name': 'fresh_export_equals_repository_fixture_semantically', 'passed': True})

for case in bundle['cases']:
    for area in ('root-control', 'leaf-control', 'sample-point', 'negative-bound', 'false-maximum'):
        doc = single(case)
        target = doc['cases'][0]
        if area == 'root-control':
            r = target['input']['controls'][1][2]
            target['input']['controls'][1][2] = rat_plus_one(r)
        elif area == 'leaf-control':
            r = target['result']['leaves'][0]['controls'][1][2]
            target['result']['leaves'][0]['controls'][1][2] = rat_plus_one(r)
        elif area == 'sample-point':
            r = target['result']['samples'][0]['point'][2]
            target['result']['samples'][0]['point'][2] = rat_plus_one(r)
        elif area == 'negative-bound':
            target['result']['leaves'][0]['upperSquared'] = {'n': '-1', 'd': '1'}
        else:
            target['result']['maxUpperSquared'] = rat_plus_one(target['result']['maxUpperSquared'])
        check(case['id'] + ':' + area, lambda doc=doc: reject(doc))

locations = [(('input',), 'controls', 'controls4x3Rat'),
             (('input',), 'tolerance', 'toleranceRat'),
             (('result', 'samples', 0), 'point', 'point3Rat'),
             (('result', 'leaves', 0), 'controls', 'controls4x3Rat'),
             (('result', 'leaves', 0), 'upperSquared', 'upperSquaredRat'),
             (('result',), 'maxUpperSquared', 'maxUpperSquaredRat')]
for path, key, alias in locations:
    for mode in ('replace', 'add'):
        doc = single(bundle['cases'][0])
        target = doc['cases'][0]
        for part in path:
            target = target[part]
        target[alias] = target[key]
        if mode == 'replace':
            del target[key]
        check('alias:' + str(path) + ':' + key + ':' + mode, lambda doc=doc: reject(doc))

for token in ('-0', '+1', '01', ' 1', '1 ', '1\n', '\u0661', '1e0'):
    doc = single(bundle['cases'][0])
    doc['cases'][0]['input']['controls'][0][0] = {'n': token, 'd': '1'}
    check('canonical-token:' + repr(token), lambda doc=doc: reject(doc))

small = single(bundle['cases'][0])
serialized = json.dumps(small, separators=(',', ':'))
json_poisons = {
    'duplicate-root': serialized.replace('"version":1', '"version":1,"version":1', 1),
    'duplicate-numerator': serialized.replace('"n":"0"', '"n":"0","n":"0"', 1),
    'escaped-duplicate': serialized.replace('"n":"0"', '"n":"0","\\u006e":"0"', 1),
    'float-version': serialized.replace('"version":1', '"version":1.0', 1),
    'nan-version': serialized.replace('"version":1', '"version":NaN', 1),
    'deep-nesting': '[' * 3000 + ']' * 3000,
}
for name, text in json_poisons.items():
    path = OUT/(name + '.json')
    path.write_text(text, encoding='utf-8')
    status, response = cli(path)
    assert status == 1 and response == {'passed': False, 'status': 'FAIL', 'error': 'certificate rejected'}
    records.append({'name': 'CLI:' + name, 'passed': True, 'exit': status, 'response': response})

# All aggregate admission must happen before rational payload conversion.
for name in ('case-count', 'leaf-count', 'aggregate-count'):
    doc = single(bundle['cases'][0])
    if name == 'case-count':
        doc['cases'] *= 65
    else:
        n = 20001 if name == 'leaf-count' else 10001
        result = doc['cases'][0]['result']
        result['leaves'] = [None] * n
        result['samples'] = [None] * (n + 1)
        if name == 'aggregate-count':
            other = copy.deepcopy(doc['cases'][0])
            other['id'] = 'second'
            doc['cases'].append(other)
    with patch.object(v, '_rat', side_effect=AssertionError('payload parsed before admission')):
        check('pre-payload:' + name, lambda doc=doc: reject(doc))

# Preflight must reject BEFORE Fraction allocates arithmetic intermediates.
for name, method in (('mul', '__mul__'), ('add', '__add__'), ('sub', '__sub__'), ('less', '__lt__')):
    arithmetic = v._Arithmetic()
    arithmetic.max_bits = 8
    left, right = Fraction(256), Fraction(255)
    with patch.object(Fraction, method, side_effect=AssertionError('arithmetic ran before preflight')):
        try:
            getattr(arithmetic, name)(left, right)
        except v.BudgetExceeded:
            pass
        else:
            raise AssertionError('oversize operation accepted')
    records.append({'name': 'preflight-before-Fraction:' + name, 'passed': True})

for budget in ('MAX_OPERATIONS', 'MAX_WEIGHTED_WORK', 'MAX_NUMERIC_CHARS', 'MAX_INTERMEDIATE_BITS'):
    stream = io.StringIO()
    with patch.object(v, budget, 1), contextlib.redirect_stdout(stream):
        status = v.main(['--input', str(source)])
    response = json.loads(stream.getvalue())
    assert status == 2 and response == {'passed': False, 'status': 'UNKNOWN', 'error': 'verification budget exhausted'}
    records.append({'name': 'CLI-UNKNOWN:' + budget, 'passed': True, 'exit': status, 'response': response})

# Verify early pre-read admission without allocating a 16 MiB payload.
path = OUT/'oversize-sparse.bin'
with path.open('wb') as stream:
    stream.truncate(v.MAX_FILE_BYTES + 1)
with patch('builtins.open', side_effect=AssertionError('oversize file opened')), patch.object(v.json, 'loads', side_effect=AssertionError('oversize JSON parsed')):
    try:
        v._load_document(path)
    except ValueError:
        pass
    else:
        raise AssertionError('oversize file accepted')
records.append({'name': 'oversize-file-before-open-and-parse', 'passed': True})

# Bind the verdict to immutable input hashes, not to an earlier revision.
manifest = json.loads((OUT/'input-manifest.json').read_text())
for item in manifest:
    assert hashlib.sha256(Path(item['path']).read_bytes()).hexdigest() == item['sha256'], item['path']
records.append({'name': 'reviewed-input-hashes-unchanged', 'passed': True})
report = {'passed': all(r['passed'] for r in records), 'checks': len(records), 'results': records}
(OUT/'adversarial-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'passed': report['passed'], 'checks': len(records), 'results_path': str(OUT/'adversarial-results.json'), 'actual_export_summary': expected}))
