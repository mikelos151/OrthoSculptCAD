"""Independent metamorphic checks on the untouched fresh REAL TS output.
Cross/dot inverse is used here instead of the production/reference minor chart.
Mutants and transformed data are explicitly NOT claimed as TS producer outputs.
"""
from pathlib import Path
from fractions import Fraction as F
from itertools import permutations
from collections import Counter
from unittest.mock import patch
import copy, json, sys, hashlib, subprocess, os, re
ROOT=Path('C:/Users/sandr/OrthoSculptCAD')
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tests/reference'))
import v03_face_cubic_verify as new
import v03_bezier_verify as old

def q(v): return F(int(v['n']),int(v['d']))
def enc(v): return dict(n=str(v.numerator),d=str(v.denominator))
def vec(v): return tuple(map(q,v))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def inverse(p,t):
    a,b,c=map(vec,t); e,g,h=sub(b,a),sub(c,a),sub(vec(p),a)
    n=cross(e,g); norm=dot(n,n)
    assert norm>0 and dot(h,n)==0
    wb=dot(cross(h,g),n)/norm; wc=dot(cross(e,h),n)/norm
    return (1-wb-wc,wb,wc)
def project(d):
    return dict(format='OrthoSculptBezierProof',version=1,cases=[dict(id=c['id'],input=dict(controls=c['containment']['controls'],tolerance=c['tolerance']),result=c['approximation']) for c in d['cases']])
def points(c, triangle=False):
    if triangle: yield from c['containment']['triangle']
    yield from c['containment']['controls']
    for leaf in c['approximation']['leaves']: yield from leaf['controls']
    for sample in c['approximation']['samples']: yield sample['point']
def cli(d,name,setup=''):
    path=OUT/(name+'.json');path.write_text(json.dumps(d),encoding='utf-8')
    command=[sys.executable,'-c',"import sys;sys.path.insert(0,"+repr(str(ROOT/'tests/reference'))+");import v03_face_cubic_verify as v;"+setup+"sys.exit(v.main(['--input',"+repr(str(path))+"]))"]
    r=subprocess.run(command,capture_output=True,text=True,timeout=30,env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1'))
    record=dict(name=name,exit_code=r.returncode,stdout=r.stdout,stderr=r.stderr,evidence_path=str(path))
    assert r.stderr==''
    return record

raw=(OUT/'untouched-real-ts.json').read_bytes(); bundle=json.loads(raw)
records=[];count=Counter()
# Verify every control, leaf control and sample by a distinct 3D cross/dot inverse.
for case in bundle['cases']:
    t=case['containment']['triangle']; controls=case['containment']['controls']
    for p,w in zip(controls,case['containment']['barycentricControls']):
        assert inverse(p,t)==vec(w);count['root_controls_equal_declared']+=1
    for p in points(case):
        recovered=inverse(p,t);assert min(recovered)>=0 and sum(recovered)==1
        count['world_points_in_simplex']+=1
    for sample in case['approximation']['samples']:
        u=q(sample['t']); v=1-u; weights=(v**3,3*v*v*u,3*v*u*u,u**3)
        expected=tuple(sum(weights[j]*q(controls[j][k]) for j in range(4)) for k in range(3))
        assert expected==vec(sample['point']);count['exact_bernstein_sample_identity']+=1
# Signed permutations and rational similarities preserve this entire real proof.
for axes in permutations(range(3)):
    for scale in (F(1),F(1,2),F(-1,2)):
        transformed=copy.deepcopy(bundle)
        for case in transformed['cases']:
            for p in points(case,True):
                source=vec(p);p[:]=[enc(scale*source[axes[k]]+F(k+1,997)) for k in range(3)]
            for leaf in case['approximation']['leaves']: leaf['upperSquared']=enc(q(leaf['upperSquared'])*scale**2)
            result=case['approximation'];result['maxUpperSquared']=enc(q(result['maxUpperSquared'])*scale**2)
        result=new.verify_bundle(transformed)
        assert result==dict(passed=True,cases=len(transformed['cases']),leaves=sum(len(c['approximation']['leaves']) for c in transformed['cases']),samples=sum(len(c['approximation']['samples']) for c in transformed['cases']))
        records.append(dict(kind='rational_similarity_not_producer',axes=axes,scale=str(scale),result=result))
# Valid approximation cannot hide a wrong, canonical simplex declaration.
for i in range(len(bundle['cases'])):
    mutant=copy.deepcopy(bundle);c=mutant['cases'][i];w=c['containment']['barycentricControls'][0]
    c['containment']['barycentricControls'][0]=[enc(F(1)),enc(F(0)),enc(F(0))] if vec(w)!=(F(1),F(0),F(0)) else [enc(F(0)),enc(F(1)),enc(F(0))]
    assert old.verify_bundle(project(mutant))['passed']
    try: new.verify_bundle(mutant)
    except ValueError as e: rejection=str(e)
    else: raise AssertionError('accepted weight mutant')
    r=cli(mutant,'weight-mutant-'+str(i));assert r['exit_code']==1 and json.loads(r['stdout'])['status']=='FAIL'
    records.append(dict(kind='canonical_weight_mutant',case=c['id'],old_passed=True,rejection=rejection,cli=r))
# Third-axis residual for EACH chart, including the two no-XY cases.
for identity,axis in [('nonaxis-curved',2),('xz-chart',1),('yz-chart',0)]:
    mutant=copy.deepcopy(bundle);c=next(c for c in mutant['cases'] if c['id']==identity)
    for p in points(c): p[axis]=enc(q(p[axis])+F(1,997))
    assert old.verify_bundle(project(mutant))['passed']
    try: new.verify_bundle(mutant)
    except ValueError as e: assert str(e)=='off-plane control'
    else: raise AssertionError('accepted off-plane mutant')
    r=cli(mutant,'offplane-'+identity);assert r['exit_code']==1 and json.loads(r['stdout'])['status']=='FAIL'
    records.append(dict(kind='offplane_unused_axis',case=identity,axis=axis,old_passed=True,cli=r))
for setup,name in [('v.MAX_OPERATIONS=0;','inverse-budget-unknown'),('v.bezier.MAX_OPERATIONS=0;','old-budget-unknown')]:
    r=cli(bundle,name,setup);assert r['exit_code']==2 and json.loads(r['stdout'])==dict(passed=False,status='UNKNOWN',error='verification budget exhausted')
    records.append(dict(kind='budget_unknown',cli=r))
# Shared schema is literally the frozen plan, then validate untouched real output.
from jsonschema import Draft202012Validator
plan=(ROOT/'docs/plans/v03-face-cubic-containment.md').read_text(encoding='utf-8')
schema=json.loads((ROOT/'tests/fixtures/v03-face-cubic-proof.schema.json').read_text(encoding='utf-8'))
assert json.loads(re.search(r'```json\n(.*?)\n```',plan,re.S).group(1))==schema
Draft202012Validator.check_schema(schema);Draft202012Validator(schema).validate(bundle)
# New review files contain none of the security primitives inspected by the review skill.
patterns={'eval_exec':r'\b(?:eval|exec)\s*\(', 'pickle':r'pickle\.loads?\(', 'shell_true':r'shell\s*=\s*True', 'os_system':r'os\.system\s*\(', 'hardcoded_secret':r'''(?i)(?:api_key|secret|password|token|passwd)\s*=\s*["'][^"']{6,}["']'''}
security=[]
for file in ['src/trimline/face-cubic.ts','tests/v03-face-cubic.test.ts','tests/reference/v03_face_cubic_verify.py','tests/reference/test_v03_face_cubic_verify.py','tests/reference/test_v03_face_cubic_interop.py']:
    text=(ROOT/file).read_text(encoding='utf-8')
    for name,pattern in patterns.items():
        for m in re.finditer(pattern,text):security.append(dict(file=file,kind=name,line=text.count('\n',0,m.start())+1))
assert not security,security
kind_counts=Counter(r['kind'] for r in records)
report=dict(passed=True,source_sha256=hashlib.sha256(raw).hexdigest(),independent_cross_dot_counts=dict(count),witness_counts=dict(kind_counts),schema_matches_frozen_plan=True,schema_validates_real_export=True,security_scan_matches=security,records=records)
(OUT/'independent-witness-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='records'},indent=2))
