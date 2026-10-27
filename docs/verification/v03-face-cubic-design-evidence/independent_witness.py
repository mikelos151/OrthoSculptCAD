"""Design review witnesses only: not a face-cubic implementation or TS evidence."""
from pathlib import Path
from fractions import Fraction as F
import copy
import importlib.util
import json
import os
import re
import subprocess
import sys
from jsonschema import Draft202012Validator

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design-review')
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('old_verifier', ROOT / 'tests/reference/v03_bezier_verify.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
schema = json.loads(re.search(r'```json\n(.*?)\n```', (ROOT / 'docs/plans/v03-face-cubic-containment.md').read_text(encoding='utf-8'), re.S).group(1))
validator = Draft202012Validator(schema)

def rat(x):
    x = F(x)
    return {'n': str(x.numerator), 'd': str(x.denominator)}

def rows(matrix):
    return [[rat(x) for x in row] for row in matrix]

def forward(T, W):
    return [tuple(sum((w[i]*T[i][j] for i in range(3)), F(0)) for j in range(3)) for w in W]

def inverse(T, P):
    E, G = [tuple(v[j]-T[0][j] for j in range(3)) for v in T[1:]]
    for r, s in ((0, 1), (0, 2), (1, 2)):
        D = E[r]*G[s]-E[s]*G[r]
        if D:
            break
    else:
        raise ValueError('degenerate')
    result = []
    k = ({0, 1, 2}-{r, s}).pop()
    for p in P:
        H = tuple(p[j]-T[0][j] for j in range(3))
        b = (H[r]*G[s]-H[s]*G[r])/D
        c = (E[r]*H[s]-E[s]*H[r])/D
        if H[k] != b*E[k]+c*G[k]:
            raise ValueError('off-plane')
        result.append((1-b-c, b, c))
    return result, (r, s), D

T = [tuple(map(F, p)) for p in ((1, 2, 3), (4, 4, 4), (2, 6, 5))]
W = [(F(1), F(0), F(0)), (F(1, 2), F(1, 3), F(1, 6)), (F(1, 6), F(1, 3), F(1, 2)), (F(0), F(0), F(1))]
edge = [(1-F(i, 3), F(i, 3), F(0)) for i in range(4)]
inputs = [
    ('nonaxis-curved', T, W),
    ('edge-linear', T, edge),
    ('vertex-constant', T, [(F(0), F(1), F(0))]*4),
    ('xz-chart', [tuple(map(F, p)) for p in ((0, 0, 0), (1, 0, 0), (0, 0, 1))], edge),
    ('yz-chart', [tuple(map(F, p)) for p in ((0, 0, 0), (0, 1, 0), (0, 0, 1))], edge),
    ('thin-constant', [(F(0), F(0), F(0)), (F(1), F(0), F(0)), (F(1), F(1, 1 << 600), F(0))], [(F(1), F(0), F(0))]*4),
]
mathematical_cases = []
chart_choices = []
for identity, triangle, weights in inputs:
    controls = forward(triangle, weights)
    recovered, axes, determinant = inverse(triangle, controls)
    assert recovered == weights
    chart_choices.append({'id': identity, 'axes': axes, 'D': str(determinant)})
    mathematical_cases.append({'id': identity, 'tolerance': rat(F(1, 200)), 'containment': {
        'kind': 'supplied-face-cubic-hull-v1', 'triangle': rows(triangle),
        'barycentricControls': rows(weights), 'controls': rows(controls)}})
assert forward(T, W) == [tuple(map(F, p)) for p in ((1, 2, 3), (F(13, 6), F(10, 3), F(11, 3)), (F(5, 2), F(14, 3), F(13, 3)), (2, 6, 5))]
h = F(1, 1000)
metric_weights = [(F(1), F(0), F(0)), (F(2, 3)-h, F(1, 3), h), (F(1, 3)-h, F(2, 3), h), (F(0), F(1), F(0))]

def bound(P):
    return max(sum((P[i][j]-((3-i)*P[0][j]+i*P[3][j])/3)**2 for j in range(3)) for i in (1, 2))

bounds = [bound(metric_weights), bound(forward(T, metric_weights)), bound(forward([tuple(1000*x for x in p) for p in T], metric_weights))]
assert bounds == [F(1, 500000), F(21, 1000000), F(21)]
node = r'''
const fs = require('node:fs'), vm = require('node:vm');
const root = 'C:/Users/sandr/OrthoSculptCAD';
const ts = require(root + '/node_modules/typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const module = {exports:{}}; cache.set(name,module.exports);
  const code = ts.transpileModule(fs.readFileSync(root+'/src/trimline/'+name+'.ts','utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(
    id => load(id.replace('./','')),module,module.exports);
  cache.set(name,module.exports); return module.exports;
}
const n = load('numerics'), b = load('bezier');
const data = JSON.parse(fs.readFileSync(0,'utf8'));
const parse = (v,c) => n.rational(BigInt(v.n),BigInt(v.d),c);
const results = data.map(entry => {
  const ctx = n.createArithmeticContext({maxBits:4096,maxOperations:2000000});
  const controls = entry.controls.map(p=>p.map(v=>parse(v,ctx)));
  try { return {id:entry.id,approximation:b.sampleCubic(controls,n.rational(1n,200n,ctx),entry.limits,ctx)}; }
  catch(e) {return {id:entry.id,name:e.name,code:e.code};}
});
process.stdout.write(JSON.stringify(results,(_k,v)=>typeof v==='bigint'?v.toString():v));
'''
requests = [{'id': c['id'], 'controls': c['containment']['controls'], 'limits': {'maxDepth': 32, 'maxSegments': 20000, 'maxNodes': 40000}} for c in mathematical_cases]
for scale in (1, 1000):
    requests.append({'id': 'world-scale-'+str(scale), 'controls': rows(forward([tuple(scale*x for x in p) for p in T], metric_weights)), 'limits': {'maxDepth': 0, 'maxSegments': 1, 'maxNodes': 1}})
completed = subprocess.run(['node', '-e', node], input=json.dumps(requests), text=True, capture_output=True, timeout=30, cwd=str(ROOT))
assert completed.returncode == 0, completed.stderr
results = json.loads(completed.stdout)
assert 'approximation' in results[-2]
assert results[-1]['name'] == 'BezierError' and results[-1]['code'] == 'BUDGET_EXCEEDED'
for case, result in zip(mathematical_cases, results[:6]):
    assert case['id'] == result['id']
    case['approximation'] = result['approximation']
synthetic = {'format': 'OrthoSculptFaceCubicProof', 'version': 1, 'cases': mathematical_cases}
validator.validate(synthetic)

def projection(doc):
    return {'format': 'OrthoSculptBezierProof', 'version': 1, 'cases': [
        {'id': c['id'], 'input': {'controls': c['containment']['controls'], 'tolerance': c['tolerance']}, 'result': c['approximation']} for c in doc['cases']]}

summary = old.verify_bundle(projection(synthetic))
mutant = copy.deepcopy(synthetic)
mutant['cases'][0]['containment']['barycentricControls'][1] = rows([(F(1, 3), F(1, 2), F(1, 6))])[0]
validator.validate(mutant)
assert old.verify_bundle(projection(mutant)) == summary
assert W[1] != (F(1, 3), F(1, 2), F(1, 6))
offplane = copy.deepcopy(synthetic)
c = offplane['cases'][0]
for point in c['containment']['controls'] + [p for leaf in c['approximation']['leaves'] for p in leaf['controls']] + [s['point'] for s in c['approximation']['samples']]:
    z = point[2]
    point[2] = rat(F(int(z['n']), int(z['d']))+F(1, 997))
validator.validate(offplane)
assert old.verify_bundle(projection(offplane)) == summary
Poff = [tuple(F(int(v['n']), int(v['d'])) for v in p) for p in c['containment']['controls']]
try:
    inverse(T, Poff)
except ValueError as error:
    assert str(error) == 'off-plane'
else:
    raise AssertionError('third-axis residual did not reject')
for invalid in ({'version': True}, {'format': 'OrthoSculptBezierProof'}):
    doc = copy.deepcopy(synthetic)
    doc.update(invalid)
    assert not validator.is_valid(doc)
alias = copy.deepcopy(synthetic)
alias['cases'][0]['containment']['controls4x3Rat'] = alias['cases'][0]['containment'].pop('controls')
assert not validator.is_valid(alias)
try:
    old.verify_bundle(synthetic)
except ValueError:
    pass
else:
    raise AssertionError('old verifier accepted new format')
report = {
    'scope': 'Independent design witnesses; mathematical containment assembled in scratch, existing sampler exercised. NOT execution of future M0c2.',
    'charts': chart_choices, 'bounds': [str(x) for x in bounds],
    'schema_and_old_public_projection': summary,
    'weight_mutant': 'schema valid, old projection PASS, inverse weights mismatch',
    'offplane_mutant': 'schema valid, old projection PASS, third-axis residual rejects',
    'world_metric_existing_sampler': [{'id': r['id'], 'outcome': r.get('code', 'success')} for r in results[-2:]],
    'alias_and_format_negative_checks': 'rejected',
}
(OUT/'witness-results.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))
