"""Read-only independent M0c1 review. All generated evidence stays here."""
from pathlib import Path
from fractions import Fraction as F
from math import comb
import copy, contextlib, hashlib, importlib.util, io, json, os, random, re, subprocess, sys, unittest

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tests/reference'))
import v03_bezier_verify as v
import test_v03_bezier_verify as tv
import test_v03_bezier_interop as ti
FILES = ['src/trimline/bezier.ts', 'tests/v03-bezier.test.ts', 'tests/reference/v03_bezier_verify.py', 'tests/reference/test_v03_bezier_verify.py', 'tests/reference/test_v03_bezier_interop.py', 'tests/fixtures/v03-bezier-proof-actual.json']
def hashes():
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES}
before = hashes()
(OUT / 'source-hashes-before.json').write_text(json.dumps(before, indent=2))
commands = []
def run(args, log, env=None, expected=0):
    completed = subprocess.run(args, cwd=ROOT, env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1', **(env or {})), capture_output=True, text=True, timeout=120)
    (OUT / log).write_text(completed.stdout + '\nSTDERR:\n' + completed.stderr, encoding='utf-8')
    commands.append({'command': subprocess.list2cmdline(args), 'environment': env or {}, 'exit_code': completed.returncode, 'log': str(OUT/log)})
    assert completed.returncode == expected, (args, completed.returncode, completed.stdout, completed.stderr)
    return completed
fresh = OUT / 'actual-ts-export.json'
run(['node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/v03-bezier.test.ts', '--configLoader', 'native', '--cache', 'false', '--maxWorkers', '1', '--no-file-parallelism', '--reporter', 'verbose'], 'targeted-vitest.log', {'ORTHO_BEZIER_EVIDENCE_OUT': str(fresh)})
# Exclude only the existing CLI test, whose hard-coded evidence directory is owned
# by another agent. Its CLI boundaries are exercised independently below.
suite = unittest.TestSuite()
for cls in (tv.VerifierTests, ti.ActualTypeScriptInteropTests):
    for name in unittest.defaultTestLoader.getTestCaseNames(cls):
        if name != 'test_cli_real_file_json_exit_status_and_pre_read_size_gate':
            suite.addTest(cls(name))
stream = io.StringIO()
res = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
(OUT/'focused-python.log').write_text(stream.getvalue())
assert res.wasSuccessful(), stream.getvalue()
commands.append({'command': 'python -B run_review.py [unittest.VerifierTests excluding hard-coded-directory CLI test + ActualTypeScriptInteropTests]', 'tests_run': res.testsRun, 'success': res.wasSuccessful(), 'log': str(OUT/'focused-python.log')})
cli = [sys.executable, '-B', str(ROOT/'tests/reference/v03_bezier_verify.py'), '--input']
actual = json.loads(fresh.read_text())
actual_summary = json.loads(run(cli+[str(fresh)], 'fresh-cli.log').stdout)
fixture_summary = json.loads(run(cli+[str(ROOT/'tests/fixtures/v03-bezier-proof-actual.json')], 'fixture-cli.log').stdout)
assert actual_summary == fixture_summary == {'passed': True, 'cases': 6, 'leaves': 97, 'samples': 103}
assert actual == json.loads((ROOT/'tests/fixtures/v03-bezier-proof-actual.json').read_text())

# Independent exact Bernstein-product oracle, not power-basis convolution.
def rat(x):
    x=F(x)
    return {'n':str(x.numerator),'d':str(x.denominator)}
def point(p): return [rat(x) for x in p]
def evaluate(p,t):
    return tuple(sum(F(comb(3,i))*t**i*(1-t)**(3-i)*p[i][a] for i in range(4)) for a in range(3))
def derivative(p,t):
    return tuple(3*sum(F(comb(2,i))*t**i*(1-t)**(2-i)*(p[i+1][a]-p[i][a]) for i in range(3)) for a in range(3))
def hermite(p,a,b):
    h=b-a; q0=evaluate(p,a); q3=evaluate(p,b)
    return (q0, tuple(x+h*d/3 for x,d in zip(q0,derivative(p,a))), tuple(x-h*d/3 for x,d in zip(q3,derivative(p,b))), q3)
def product_oracle(p):
    ds=[tuple(p[i][a] - ((3-i)*p[0][a]+i*p[3][a])/3 for a in range(3)) for i in range(4)]
    bs=[sum(F(comb(3,i)*comb(3,k-i),comb(6,k))*sum(ds[i][a]*ds[k-i][a] for a in range(3)) for i in range(4) if 0<=k-i<4) for k in range(7)]
    u=max(sum(x*x for x in d) for d in ds)
    return bs,u
rng=random.Random(372001)
knots=[F(0),F(1,7),F(2,5),F(1)]
random_cases=[]
for idx in range(80):
    p=tuple(tuple(F(rng.randint(-10,10),100000) for _ in range(3)) for _ in range(4))
    leaves=[]; us=[]
    for a,b in zip(knots,knots[1:]):
        q=hermite(p,a,b)
        bs,u=product_oracle(q)
        ar=v._Arithmetic()
        computed=v._bernstein_bound6(v._restrict(v._power(p,ar),a,b,ar),ar)
        assert computed == max(bs), (idx,a,b,computed,bs)
        assert max(bs) <= u <= F(1,40000)
        leaves.append({'t0':rat(a),'t1':rat(b),'controls':[point(x) for x in q],'upperSquared':rat(u)})
        us.append(u)
    random_cases.append({'id':f'independent-hermite-{idx}', 'input':{'controls':[point(x) for x in p],'tolerance':rat(F(1,200))},'result':{'kind':'cubic-parametric-bound-v1','samples':[{'t':rat(t),'point':point(evaluate(p,t))} for t in knots],'leaves':leaves,'maxUpperSquared':rat(max(us))}})
random_counts=[]
for start in (0,40):
    document={'format':'OrthoSculptBezierProof','version':1,'cases':random_cases[start:start+40]}
    random_counts.append(v.verify_bundle(document))
# Algebraic identity for every formal P_j in one axis, exact coefficients in u.
B=[(1,-3,3,-1),(0,3,-6,3),(0,0,3,-3),(0,0,0,1)]
for j in range(4):
    d1=F(j==1)-F(2*(j==0)+(j==3),3)
    d2=F(j==2)-F((j==0)+2*(j==3),3)
    lhs=[F(x) for x in B[j]]
    if j==0: lhs[0]-=1; lhs[1]+=1
    if j==3: lhs[1]-=1
    rhs=[F(0),3*d1,-6*d1+3*d2,3*d1-3*d2]
    assert lhs==rhs

mutations=[]
def rejects(doc,label):
    try: v.verify_bundle(doc)
    except (TypeError, ValueError) as error:
        mutations.append({'label':label,'result':'REJECT','reason':str(error)})
    else: raise AssertionError('accepted mutation '+label)
# Mutate each frozen spelling individually, not merely the entire schema.
for container,key,alias in [('input','controls','controls4x3Rat'),('input','tolerance','toleranceRat'),('sample','point','point3Rat'),('leaf','upperSquared','upperSquaredRat'),('result','maxUpperSquared','maxUpperSquaredRat')]:
    d=copy.deepcopy(actual); c=d['cases'][0]
    target=c['input'] if container=='input' else c['result']['samples'][0] if container=='sample' else c['result']['leaves'][0] if container=='leaf' else c['result']
    target[alias]=target.pop(key)
    rejects(d,'legacy alias '+alias)
# Preserve exact endpoints while changing leaf interior geometry.
d=copy.deepcopy(actual)
f=d['cases'][0]['result']['leaves'][0]['controls'][1][0]
f.update(rat(F(int(f['n']),int(f['d']))+1))
rejects(d,'leaf interior +1 with unchanged endpoints')
path=OUT/'mutated-controls.json'; path.write_text(json.dumps(d))
run(cli+[str(path)],'mutated-cli.log',expected=1)
# Underclaim a real nonzero leaf; no endpoint/sample check can detect this.
d=copy.deepcopy(actual)
c=next(c for c in d['cases'] if c['id']=='nonplanar')
c['result']['leaves'][0]['upperSquared']=rat(0)
rejects(d,'real curved leaf zero underclaim')
# Real bundle negative coverage and max controls.
for label,mutate in [('gap',lambda r:r['leaves'][1].update(t0=rat(F(9,10)))),('overlap',lambda r:r['leaves'][1].update(t0=rat(0))),('maximum',lambda r:r.update(maxUpperSquared=rat(0))),('sample',lambda r:r['samples'][1].update(point=[rat(999)]*3))]:
    d=copy.deepcopy(actual); c=next(c for c in d['cases'] if c['id']=='nonplanar'); mutate(c['result']); rejects(d,label)

# Isolated CLI input gates and sanitized output.
cli_negatives=[]
for label,data in [('duplicate-key',b'{"version":1,"version":1}'),('nonfinite',b'{"version":NaN}'),('deep-nesting',b'['*3000+b']'*3000),('utf8',b'\xff')]:
    p=OUT/(label+'.json'); p.write_bytes(data)
    cp=run(cli+[str(p)],label+'-cli.log',expected=1)
    assert json.loads(cp.stdout)=={'passed':False,'status':'FAIL','error':'certificate rejected'} and not cp.stderr
    cli_negatives.append(label)
p=OUT/'oversize.json'
with p.open('wb') as f: f.truncate(v.MAX_FILE_BYTES+1)
# This patched open must not be called: pre-read gate refuses first.
from unittest.mock import patch
with patch('builtins.open',side_effect=AssertionError('oversize opened')):
    try: v._load_document(p)
    except ValueError: pass
    else: raise AssertionError('oversize accepted')
run(cli+[str(p)],'oversize-cli.log',expected=1)
p.unlink()
budget_results=[]
for key in ('MAX_OPERATIONS','MAX_WEIGHTED_WORK','MAX_NUMERIC_CHARS','MAX_INTERMEDIATE_BITS'):
    s=io.StringIO()
    with patch.object(v,key,1), contextlib.redirect_stdout(s):
        code=v.main(['--input',str(fresh)])
    result=json.loads(s.getvalue())
    assert code==2 and result['passed'] is False and result['status']=='UNKNOWN'
    budget_results.append({'limit':key,'exit_code':code,'result':result})

# Focused static scan of the new code; this is not a dependency/full-app audit.
patterns={'secrets':r'(?i)(api_key|secret|password|passwd)\s*=\s*[\"\'][^\"\']{6,}', 'shell':r'os\.system\(|shell\s*=\s*True', 'eval_exec_pickle':r'\b(?:eval|exec)\s*\(|pickle\.loads?\(', 'network':r'https?://|fetch\(|requests\.'}
scan={}
for name,pattern in patterns.items():
    scan[name]=[{'file':p,'line':i,'text':line.strip()} for p in FILES if not p.endswith('.json') for i,line in enumerate((ROOT/p).read_text().splitlines(),1) if re.search(pattern,line)]
after=hashes()
assert before==after, 'review files changed during review'
(OUT/'source-hashes-after.json').write_text(json.dumps(after,indent=2))
summary={'focused_python_tests':res.testsRun,'fresh_ts':actual_summary,'fixture':fixture_summary,'fresh_export_sha256':hashlib.sha256(fresh.read_bytes()).hexdigest(),'fixture_sha256':before['tests/fixtures/v03-bezier-proof-actual.json'],'fresh_matches_fixture_semantically':True,'independent_hermite_bernstein_product_cases':random_counts,'exact_whole_interval_product_comparisons':80*3,'formal_coefficient_identities':4,'negative_controls':mutations,'cli_negative_controls':cli_negatives+['oversize-before-open'],'budget_unknown_controls':budget_results,'source_files_unchanged':before==after,'static_scan':scan,'commands':commands}
(OUT/'review-evidence.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
