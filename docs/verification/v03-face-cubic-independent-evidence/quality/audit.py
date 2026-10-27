"""Read-only bounded independent quality audit; outputs only to this directory."""
import copy
import hashlib
import itertools
import json
import os
from pathlib import Path
import random
import subprocess
import sys
from fractions import Fraction as F
from unittest.mock import patch

OUT = Path(__file__).resolve().parent
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
sys.dont_write_bytecode = True
sys.path.insert(0, str(REPO / 'tests/reference'))
import v03_face_cubic_verify as verifier
import v03_bezier_verify as old

ENV = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(OUT), TMP=str(OUT), TEMP=str(OUT))
COMMANDS = []
FILES = ['src/trimline/face-cubic.ts', 'src/trimline/numerics.ts', 'src/trimline/bezier.ts',
         'tests/v03-face-cubic.test.ts', 'tests/reference/v03_face_cubic_verify.py',
         'tests/reference/test_v03_face_cubic_verify.py', 'tests/reference/test_v03_face_cubic_interop.py',
         'tests/reference/v03_bezier_verify.py', 'tests/fixtures/v03-face-cubic-proof-actual.json',
         'tests/fixtures/v03-face-cubic-proof.schema.json', 'docs/plans/v03-face-cubic-containment.md']
def hashes():
    return {f: hashlib.sha256((REPO/f).read_bytes()).hexdigest() for f in FILES}
BEFORE = json.loads((OUT/'input-hashes.json').read_text(encoding='utf-8')) if '--resume' in sys.argv else hashes()
(OUT/'input-hashes.json').write_text(json.dumps(BEFORE, indent=2), encoding='utf-8')

def run(name, args, expected=0, env=None):
    if '--resume' in sys.argv and (OUT/(name+'.json')).exists():
        from types import SimpleNamespace
        record = json.loads((OUT/(name+'.json')).read_text(encoding='utf-8'))
        assert record['exit_code'] == expected, record
        COMMANDS.append(record)
        print(name, 'recorded exit', record['exit_code'], flush=True)
        return SimpleNamespace(returncode=record['exit_code'], stdout=record['stdout'], stderr=record['stderr'])
    result = subprocess.run([str(x) for x in args], cwd=REPO, env=env or ENV,
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    record = {'name': name, 'command': [str(x) for x in args], 'exit_code': result.returncode,
              'stdout': result.stdout, 'stderr': result.stderr}
    (OUT/(name+'.json')).write_text(json.dumps(record, indent=2), encoding='utf-8')
    COMMANDS.append(record)
    assert result.returncode == expected, record
    print(name, 'exit', result.returncode, flush=True)
    return result

run('bootstrap', ['node', OUT/'bootstrap.mjs'])
run('focused-typescript', ['node', REPO/'node_modules/vitest/vitest.mjs', 'run', '--config', OUT/'vitest.config.mjs'],
    env=dict(ENV, ORTHO_FACE_CUBIC_EVIDENCE_OUT=str(OUT/'fresh-real-ts.json')))
run('focused-python', [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests/reference', '-p', 'test_v03_face_cubic*.py', '-v'])
run('fresh-real-cli', [sys.executable, '-B', REPO/'tests/reference/v03_face_cubic_verify.py', '--input', OUT/'fresh-real-ts.json'])

def rat(x):
    x = F(x)
    return {'n': str(x.numerator), 'd': str(x.denominator)}
def val(x):
    return F(int(x['n']), int(x['d']))
def rows(x):
    return [[rat(v) for v in r] for r in x]

rng = random.Random(887132)
inputs = []
for i in range(128):
    while True:
        t = [[F(rng.randint(-25, 25), rng.randint(1, 11)) for _ in range(3)] for _ in range(3)]
        e, g = [[t[j][k]-t[0][k] for k in range(3)] for j in (1, 2)]
        if any(e[r]*g[s] != e[s]*g[r] for r, s in ((0,1),(0,2),(1,2))):
            break
    def weight():
        w = [rng.randint(0, 9) for _ in range(3)]
        if sum(w) == 0:
            w[0] = 1
        return [F(v, sum(w)) for v in w]
    w = [weight() for _ in range(4)]
    if i < 32:
        w = [w[0]]*4
    inputs.append({'triangle': rows(t), 'weights': rows(w), 'constant': i < 32})
(OUT/'random-inputs.json').write_text(json.dumps(inputs), encoding='utf-8')
node = run('adversarial-node', ['node', OUT/'adversarial-node.mjs'])
results = json.loads((OUT/'random-results.json').read_text(encoding='utf-8'))
assert len(results) == len(inputs) == 128
for case, result in zip(inputs, results):
    t, w = [[[val(x) for x in row] for row in case[key]] for key in ('triangle', 'weights')]
    expected = [[sum(w[i][j]*t[j][a] for j in range(3)) for a in range(3)] for i in range(4)]
    assert result['controls'] == rows(expected)
    verifier._verify_containment(result, verifier._InverseBudget())
constant = run('random-real-constant-cli', [sys.executable, '-B', REPO/'tests/reference/v03_face_cubic_verify.py', '--input', OUT/'random-constant-proofs.json'])
assert json.loads(constant.stdout) == {'passed': True, 'cases': 32, 'leaves': 32, 'samples': 64}

original = json.loads((OUT/'fresh-real-ts.json').read_text(encoding='utf-8'))
fixture = json.loads((REPO/'tests/fixtures/v03-face-cubic-proof-actual.json').read_text(encoding='utf-8'))
assert original == fixture
transformed = 0
# Signed permutations/translation are exact isometries: preserve the old bound.
for perm in itertools.permutations(range(3)):
    for sign in (-1, 1):
        document = copy.deepcopy(original)
        for case in document['cases']:
            contain, approximation = case['containment'], case['approximation']
            point_arrays = [contain['triangle'], contain['controls']]
            point_arrays += [leaf['controls'] for leaf in approximation['leaves']]
            point_arrays += [[sample['point']] for sample in approximation['samples']]
            for array in point_arrays:
                for point in array:
                    p = [val(x) for x in point]
                    point[:] = [rat(sign*p[perm[a]]+F(17+a, 997)) for a in range(3)]
            # Vertex-order symmetry independently challenges the signed minor.
            contain['triangle'][1], contain['triangle'][2] = contain['triangle'][2], contain['triangle'][1]
            for w in contain['barycentricControls']:
                w[1], w[2] = w[2], w[1]
        assert verifier.verify_bundle(document) == {'passed': True, 'cases': 6, 'leaves': 21, 'samples': 27}
        transformed += 1

# Every containment scalar matters on this full-dimensional nonaxis witness.
rejects = []
for field, row_count in [('triangle',3),('barycentricControls',4),('controls',4)]:
    for r in range(row_count):
        for a in range(3):
            document = copy.deepcopy(original)
            target = document['cases'][0]['containment'][field][r]
            target[a] = rat(val(target[a])+F(1,997))
            try:
                verifier.verify_bundle(document)
            except ValueError as e:
                rejects.append({'field':field,'row':r,'axis':a,'reason':str(e)})
            else:
                raise AssertionError(('accepted corruption',field,r,a))
assert len(rejects) == 33
(OUT/'canonical-mutation-results.json').write_text(json.dumps(rejects, indent=2), encoding='utf-8')

raw = json.dumps(original).encode('utf-8')
malformed = {
 'bad-utf8': b'\xff'+raw,
 'deep-json': b'['*3000+b'0'+b']'*3000,
 'escaped-duplicate': raw.replace(b'"version": 1', b'"version": 1, "\\u0076ersion": 1', 1),
 'version-exponent': raw.replace(b'"version": 1', b'"version": 1e0', 1),
 'id-surrogate': raw.replace(b'nonaxis-curved', b'\\ud800', 1),
 'rat-unicode-digit': raw.replace(b'"n": "1"', b'"n": "\\u0661"', 1),
}
for name, content in malformed.items():
    target = OUT/(name+'.json')
    target.write_bytes(content)
    result = run(name+'-cli', [sys.executable, '-B', REPO/'tests/reference/v03_face_cubic_verify.py', '--input', target], expected=1)
    assert json.loads(result.stdout) == {'passed':False,'status':'FAIL','error':'certificate rejected'}
    assert result.stderr == ''

# Real CLI path with controlled runtime budgets; do not edit either module.
for name, setting in [('inverse-unknown', 'v.MAX_OPERATIONS=0'), ('old-unknown','v.bezier.MAX_OPERATIONS=0')]:
    code = f"import sys;sys.path.insert(0,{str(REPO/'tests/reference')!r});import v03_face_cubic_verify as v;{setting};sys.exit(v.main(['--input',{str(OUT/'fresh-real-ts.json')!r}]))"
    result = run(name, [sys.executable, '-B', '-c', code], expected=2)
    assert json.loads(result.stdout) == {'passed':False,'status':'UNKNOWN','error':'verification budget exhausted'}
    assert result.stderr == ''

# Explicit independent aggregate-count observation, before rational parsing.
count_doc = copy.deepcopy(original)
count_doc['cases'] = count_doc['cases'][:2]
for case in count_doc['cases']:
    case['approximation']['leaves'] = [None]*10000
    case['approximation']['samples'] = [None]*10001
assert len(verifier._preflight_document(count_doc,verifier._InverseBudget())) == 2
count_doc['cases'][1]['approximation']['leaves'].append(None)
count_doc['cases'][1]['approximation']['samples'].append(None)
with patch.object(verifier, '_rat', side_effect=AssertionError('payload parsed before count admission')) as seen:
    try:
        verifier.verify_bundle(count_doc)
    except ValueError:
        pass
    else:
        raise AssertionError('aggregate 20001 accepted')
    seen.assert_not_called()

assert hashes() == BEFORE, 'Review inputs changed during audit'
run('readonly-git', ['git','-C',str(REPO),'diff','--exit-code','HEAD','--','src/trimline/numerics.ts','src/trimline/bezier.ts','tests/reference/v03_bezier_verify.py'])
report = {'passed': True, 'security_concerns': [], 'logic_errors': [], 'suggestions': [],
 'summary': 'No blocking quality/security/resource defect found within the exact supplied-triangle M0c2 boundary.',
 'evidence': {'root':str(OUT),'focused_typescript':'focused-typescript.json','focused_python':'focused-python.json',
  'commands':'commands.json','input_hashes':'input-hashes.json','canonical_mutations':'canonical-mutation-results.json',
  'fresh_real_ts':'fresh-real-ts.json','node_adversarial':json.loads(node.stdout),
  'random_fraction_oracle_cases':128,'random_real_constant_cli':json.loads(constant.stdout),
  'metamorphic_composed_bundles':transformed,'canonical_rejected_scalar_mutations':len(rejects),
  'malformed_cli_cases':len(malformed),'reference_budget_cli_unknowns':2,
  'aggregate_20000_admitted_20001_rejected_before_rat':True,
  'unchanged_input_files':len(BEFORE),'fresh_export_equals_repo_fixture':True},
 'limitations':['Focused/bounded audit only; parent owns full-suite/typecheck/browser acceptance.',
  'Algorithmic limits do not promise process RSS/wall time, and JS Proxy traps are outside the ordinary-container no-getter guarantee.',
  'Containment is only relative to one supplied triangle; no source provenance, full surface, cut/shell, or clinical certification.']}
(OUT/'commands.json').write_text(json.dumps(COMMANDS,indent=2),encoding='utf-8')
(OUT/'verdict.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
