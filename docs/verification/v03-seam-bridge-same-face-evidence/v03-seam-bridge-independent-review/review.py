"""Read-only upstream review; all generated evidence stays beside this file."""
from pathlib import Path
from fractions import Fraction as F
from math import isqrt, comb
import copy
import hashlib
import json
import os
import struct
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
ORIGINAL = ROOT.parent/'v03-seam-bridge-spike'
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
sys.path.insert(0,str(ROOT))
import check_bridge


def save(name, data):
    path = ROOT/name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x',encoding='utf8') as out:
        json.dump(data,out,indent=2)
    return path


def run(label, args, expected=0):
    p = subprocess.run([str(x) for x in args], cwd=ROOT, capture_output=True,
                       text=True,timeout=180,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    (ROOT/(label+'.log')).write_text('$ '+' '.join(map(str,args))+'\n'+p.stdout+p.stderr+'\nexit='+str(p.returncode)+'\n',encoding='utf8')
    assert p.returncode==expected, (label,p.returncode,p.stdout,p.stderr)
    return p.stdout


def decode(x):
    return F(int(x['n']),int(x['d']))


def canonical(x):
    return {'n':str(x.numerator),'d':str(x.denominator)}


TRIANGLES = [[[F(0),F(0),F(0)],[F(1),F(0),F(0)],[F(0),F(1),F(0)]],
             [[F(1),F(0),F(0)],[F(0),F(0),F(0)],[F(0),F(-1),F(1)]]]


def geometry(proof):
    report=[]
    for face,case in enumerate(proof['cases']):
        c=case['containment']
        tri=[[decode(x) for x in row] for row in c['triangle']]
        assert tri==TRIANGLES[face], 'ordered original face mismatch'
        controls=[[decode(x) for x in row] for row in c['controls']]
        weights=[[decode(x) for x in row] for row in c['barycentricControls']]
        for w,p in zip(weights,controls):
            assert p==[sum(w[i]*tri[i][a] for i in range(3)) for a in range(3)]
            assert min(w)>=0 and sum(w)==1
        report.append({'face':'FG'[face],'originalOrderedTriangle':True,'allControlWorldBindings':True})
    assert proof['cases'][0]['containment']['controls'][3]==proof['cases'][1]['containment']['controls'][0]
    return report


def main():
    manifest=json.loads((ORIGINAL/'results.json').read_text())
    result={'historical':{},'fresh':{},'negative':{},'mutant':{}}
    for label,meta in manifest['primary'].items():
        public=json.loads(run('historical-'+label+'-public',[sys.executable,'-B',REPO/'tests/reference/v03_face_cubic_verify.py','--input',meta['real_proof_path']]))
        bridge=json.loads(run('historical-'+label+'-bridge',[sys.executable,'-B',ROOT/'check_bridge.py','--input',meta['results_path']]))
        proof=json.loads(Path(meta['real_proof_path']).read_text())
        result['historical'][label]={'public':public,'bridge':bridge,'geometry':geometry(proof)}
    run('unittest',[sys.executable,'-B','-m','unittest','-v','test_spike'])
    result['fresh']['unitTests']=12
    cli=json.loads(run('fresh-curved-cli',[sys.executable,'-B','spike.py','--curved']))
    path=Path(cli['results'])
    data=json.loads(path.read_text())
    proof=json.loads(Path(data['real_proof_path']).read_text())
    result['fresh']['curved']={'cli':cli,'geometry':geometry(proof)}
    compiled=[]
    for name in ('numerics.js','bezier.js','face-cubic.js'):
        own=hashlib.sha256((ROOT/'compiled'/name).read_bytes()).hexdigest()
        old=hashlib.sha256((ORIGINAL/'compiled'/name).read_bytes()).hexdigest()
        assert own==old
        compiled.append({'name':name,'sha256':own,'equalsHistorical':True})
    result['fresh']['compiled']=compiled
    for label,args,expected in [('coarse',['--curved','--bits','2'],1),('overspent',['--delta','1/500'],1),('cap',['--bits','257'],2)]:
        payload=json.loads(run('negative-'+label,[sys.executable,'-B','spike.py',*args],expected))
        refusal=json.loads(Path(payload['evidence']).read_text())
        assert refusal['producerCalled'] is False
        result['negative'][label]={'exit':expected,'cli':payload,'refusal':refusal}
    # Same genuine rational weights, A/B/E, source hashes, ideal formulas and budgets.
    # Only tilt C.z by a tiny exactly representable dyadic, then use REAL TS again.
    mutant=ROOT/'mutant-tilted-F'
    mutant.mkdir()
    request=json.loads((path.parent/'request.json').read_text())
    eps=F(1,4096)
    eps_bits=struct.unpack('<I',struct.pack('<f',float(eps)))[0]
    assert F(struct.unpack('<f',struct.pack('<I',eps_bits))[0])==eps
    request['cases'][0]['triangleBits'][2][2]=eps_bits
    request_path=save('mutant-tilted-F/request.json',request)
    proof_path=mutant/'real-face-proof.json'
    producer=json.loads(run('mutant-real-producer',['node',ROOT/'producer.cjs',request_path,proof_path]))
    mutant_proof=json.loads(proof_path.read_text())
    public=json.loads(run('mutant-public',[sys.executable,'-B',REPO/'tests/reference/v03_face_cubic_verify.py','--input',proof_path]))
    changed=copy.deepcopy(data)
    changed.pop('independent_bridge_verifier',None)
    changed['real_proof_path']=str(proof_path)
    changed['realProofSha256']=hashlib.sha256(proof_path.read_bytes()).hexdigest()
    changed['producer']=producer
    changed['public_verifier']=public
    changed['leavesPerSpan']=[len(c['approximation']['leaves']) for c in mutant_proof['cases']]
    changed['samplerMaxUpperSquared']=[str(decode(c['approximation']['maxUpperSquared'])) for c in mutant_proof['cases']]
    unit=1<<128
    n=isqrt(2*unit*unit)
    lo,hi=F(n,unit),F(n+1,unit)
    max_upper=F(0)
    for face,rows in enumerate(changed['controls']):
        for i,row in enumerate(rows):
            original=[tuple(F(v) for v in x) for x in row['idealWorld']]
            real=[decode(x) for x in mutant_proof['cases'][face]['containment']['controls'][i]]
            row['rationalWorld']=[str(x) for x in real]
            diff=[(a-r,b) for (a,b),r in zip(original,real)]
            squared=(sum(a*a+2*b*b for a,b in diff),sum(2*a*b for a,b in diff))
            lower=squared[0]+squared[1]*(lo if squared[1]>=0 else hi)
            upper=squared[0]+squared[1]*(hi if squared[1]>=0 else lo)
            assert upper<F(1,1000000)
            row['errorSquared']=[str(x) for x in squared]
            row['errorSquaredEnclosure']=[str(lower),str(upper)]
            row['deltaSquaredMinusErrorSign']=1
            max_upper=max(max_upper,upper)
    changed_path=save('mutant-tilted-F/bridge-reference.json',changed)
    bridge=json.loads(run('mutant-bridge',[sys.executable,'-B',ROOT/'check_bridge.py','--input',changed_path]))
    assert public['passed'] and bridge['passed']
    c=mutant_proof['cases'][0]['containment']
    assert [[decode(x) for x in row] for row in c['triangle']]!=TRIANGLES[0]
    real_controls=[[decode(x) for x in row] for row in c['controls']]
    for i,row in enumerate(c['barycentricControls']):
        assert real_controls[i][2]==eps*decode(row[2])
    midpoint_z=sum(F(comb(3,i),8)*p[2] for i,p in enumerate(real_controls))
    assert midpoint_z>0 and real_controls[0][2]>0
    assert c['controls'][3]==mutant_proof['cases'][1]['containment']['controls'][0]
    result['mutant']={'request':str(request_path),'proof':str(proof_path),'bridge':str(changed_path),
                      'epsilon':str(eps),'epsilonFloat32Bits':eps_bits,'realProducer':producer,
                      'publicVerifier':public,'bridgeVerifier':bridge,
                      'outsideOriginalF':{'control0Z':str(real_controls[0][2]),'curveAtHalfZ':str(midpoint_z),
                                           'originalPlane':'z=0','PLStartZ':str(decode(mutant_proof['cases'][0]['approximation']['samples'][0]['point'][2]))},
                      'maxControlErrorSquaredUpper':str(max_upper),'allErrorsFitDelta':True,
                      'unchanged':['A','B','E','barycentricControls','idealWorld','idealBarycentric','source_sha256','delta','tau']}
    save('review-results.json',result)
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    main()
