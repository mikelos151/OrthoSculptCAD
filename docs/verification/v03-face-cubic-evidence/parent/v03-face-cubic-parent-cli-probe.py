"""Parent CLI probes on actual TS output; never rewrites the producer file."""
from pathlib import Path
from fractions import Fraction
import copy
import hashlib
import json
import os
import subprocess
import sys
from jsonschema import Draft202012Validator

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-parent-cli')
OUT.mkdir(exist_ok=True)
SOURCE = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-parent-real.json')
original_bytes = SOURCE.read_bytes()
original = json.loads(original_bytes)
schema = json.loads((ROOT/'tests/fixtures/v03-face-cubic-proof.schema.json').read_text())
validator = Draft202012Validator(schema)
validator.validate(original)
sys.path.insert(0, str(ROOT/'tests/reference'))
import v03_bezier_verify as old


def projection(document):
    return {'format': 'OrthoSculptBezierProof', 'version': 1, 'cases': [
        {'id': c['id'], 'input': {'controls': c['containment']['controls'],
         'tolerance': c['tolerance']}, 'result': c['approximation']}
        for c in document['cases']]}


records = []
for kind in ('weight', 'offplane'):
    data = copy.deepcopy(original)
    case = next(c for c in data['cases'] if c['id'] == 'nonaxis-curved')
    if kind == 'weight':
        case['containment']['barycentricControls'][1] = [
            {'n': '1', 'd': '3'}, {'n': '1', 'd': '2'}, {'n': '1', 'd': '6'}]
    else:
        points = list(case['containment']['controls'])
        for leaf in case['approximation']['leaves']:
            points.extend(leaf['controls'])
        points.extend(s['point'] for s in case['approximation']['samples'])
        for point in points:
            z = point[2]
            value = Fraction(int(z['n']), int(z['d'])) + Fraction(1, 997)
            point[2] = {'n': str(value.numerator), 'd': str(value.denominator)}
    validator.validate(data)
    old_result = old.verify_bundle(projection(data))
    assert old_result['passed'] is True
    path = OUT/(kind+'-canonical-mutant.json')
    with path.open('x', encoding='utf-8') as stream:
        json.dump(data, stream)
    run = subprocess.run([sys.executable, str(ROOT/'tests/reference/v03_face_cubic_verify.py'),
                          '--input', str(path)], capture_output=True, text=True,
                         env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
    result = json.loads(run.stdout)
    assert run.returncode == 1 and result['status'] == 'FAIL', (run.returncode, result)
    records.append({'kind': kind, 'schemaValid': True, 'oldProjection': old_result,
                    'newCliExitCode': run.returncode, 'newCliResult': result,
                    'mutantPath': str(path)})

code = ('import sys;sys.path.insert(0,'+repr(str(ROOT/'tests/reference'))+');'
        'import v03_face_cubic_verify as v;v.MAX_OPERATIONS=1;'
        'raise SystemExit(v.main(["--input",'+repr(str(SOURCE))+']))')
run = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True,
                     env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
result = json.loads(run.stdout)
assert run.returncode == 2 and result['status'] == 'UNKNOWN' and not result['passed']
assert SOURCE.read_bytes() == original_bytes
report = {'scope': 'Actual TS producer interop negative controls; not complete CAD acceptance',
          'producerSha256': hashlib.sha256(original_bytes).hexdigest(), 'inputUnchanged': True,
          'negativeControls': records, 'reducedBudgetCli': {'exitCode': run.returncode, 'result': result}}
with (OUT/'results.json').open('x', encoding='utf-8') as stream:
    json.dump(report, stream, indent=2)
print(json.dumps(report))
