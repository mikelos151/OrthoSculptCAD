"""Independent runnable witness for closure of BRIDGE-SAMEFACE-1 only.
Run after run_tests.py in this fresh evidence directory; no input writes.
"""
from pathlib import Path
from fractions import Fraction as F
import copy
import importlib.util
import json
import subprocess
import sys
import check_bridge
from prepare import ROOT, ORIGINAL, PRIOR, REPO, save, sha
from run_tests import run

def load(path):
    return json.loads(Path(path).read_text(encoding='utf8'))

def rational(x):
    return F(int(x['n']), int(x['d']))

def expect_face_rejection(path):
    try:
        check_bridge.verify(path)
    except ValueError as exc:
        assert str(exc) == 'ordered reference triangle mismatch', str(exc)
        return {'exception':'ValueError','reason':str(exc)}
    raise AssertionError('tilted bridge was accepted')

def traced_verify(path):
    original = check_bridge.public.verify_bundle
    calls=[]
    def traced(proof):
        calls.append(proof)
        return original(proof)
    check_bridge.public.verify_bundle = traced
    try:
        summary=check_bridge.verify(path)
    finally:
        check_bridge.public.verify_bundle=original
    assert len(calls)==1
    assert len(calls[0]['cases'])==2
    return {'summary':summary,'completePublicVerifierCalls':len(calls)}

def exact_geometry(data):
    proof=load(data['real_proof_path'])
    triangles=(((0,0,0),(1,0,0),(0,1,0)),((1,0,0),(0,0,0),(0,-1,1)))
    for face,case in enumerate(proof['cases']):
        tri=tuple(tuple(rational(x) for x in point) for point in case['containment']['triangle'])
        assert tri==triangles[face]
        for row,weights,point in zip(data['controls'][face],case['containment']['barycentricControls'],case['containment']['controls']):
            # Independently reconstruct world coordinates from the same ordered triangle.
            iw=[tuple(F(x) for x in pair) for pair in row['idealWorld']]
            ib=[tuple(F(x) for x in pair) for pair in row['idealBarycentric']]
            world=[tuple(sum(tri[k][axis]*ib[k][coef] for k in range(3)) for coef in range(2)) for axis in range(3)]
            assert iw==world
            rw=[sum(tri[k][axis]*rational(weights[k]) for k in range(3)) for axis in range(3)]
            assert rw==list(map(rational,point))
    return {'sameOrderedFaces':True,'idealWorldFromSameTriangle':True,'rationalWorldFromSameTriangle':True,'controls':8}

if __name__=='__main__':
    results={}
    prior=load(ROOT/'review-results.json')
    mutant=prior['mutant']
    proof=load(mutant['proof'])
    results['preservedRealTiltedProof']={'sha256':sha(Path(mutant['proof'])),
        'public':check_bridge.public.verify_bundle(proof),
        'fixedBridge':expect_face_rejection(mutant['bridge'])}
    assert results['preservedRealTiltedProof']['public']=={'passed':True,'cases':2,'leaves':8,'samples':10}
    # Re-execute unchanged old checker on precisely the historical adversarial bridge.
    old_path=ROOT/'old_checker.py'
    with old_path.open('xb') as stream:
        stream.write((ORIGINAL/'check_bridge.py').read_bytes())
    assert old_path.read_bytes()==(ORIGINAL/'check_bridge.py').read_bytes()
    spec=importlib.util.spec_from_file_location('old_checker',old_path)
    old=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    results['preservedRealTiltedProof']['oldBridge']=old.verify(mutant['bridge'])
    assert results['preservedRealTiltedProof']['oldBridge']['passed']
    # Fresh genuine TS regeneration of the original tilted request, not a proof mutation.
    directory=ROOT/'fresh-tilted-witness'
    directory.mkdir()
    request=directory/'request.json'
    with request.open('xb') as out:
        out.write(Path(mutant['request']).read_bytes())
    fresh_proof=directory/'real-face-proof.json'
    producer=run('fresh-tilted-producer',['node',ROOT/'producer.cjs',request,fresh_proof],0)
    assert fresh_proof.read_bytes()==Path(mutant['proof']).read_bytes()
    bridge=load(mutant['bridge'])
    bridge['real_proof_path']=str(fresh_proof)
    fresh_bridge=directory/'bridge-reference.json'
    save(fresh_bridge,bridge)
    public=run('fresh-tilted-public',[sys.executable,'-B',REPO/'tests/reference/v03_face_cubic_verify.py','--input',fresh_proof],0)
    fixed=run('fresh-tilted-fixed',[sys.executable,'-B',ROOT/'check_bridge.py','--input',fresh_bridge],1)
    assert json.loads(fixed['stdout'])=={'passed':False,'status':'REFUSED','reason':'ordered reference triangle mismatch'}
    p=load(fresh_proof)
    z=rational(p['cases'][0]['containment']['controls'][0][2])
    plz=rational(p['cases'][0]['approximation']['samples'][0]['point'][2])
    assert z==plz==F(9,131072)>0
    t=F(1,2)
    coeff=[(1-t)**3,3*(1-t)**2*t,3*(1-t)*t*t,t**3]
    half_z=sum(b*rational(row[2]) for b,row in zip(coeff,p['cases'][0]['containment']['controls']))
    assert half_z==F(73731,2147483648)>0
    results['freshRealTiltedProof']={'producer':json.loads(producer['stdout']),
        'byteIdenticalToPriorGenuineTSProof':True,'sha256':sha(fresh_proof),
        'public':json.loads(public['stdout']),'fixedBridge':expect_face_rejection(fresh_bridge),
        'originalFPlane':'z=0','control0Z':str(z),'PLStartZ':str(plz),'curveAtHalfZ':str(half_z),
        'oldBridge':old.verify(fresh_bridge)}
    assert results['freshRealTiltedProof']['oldBridge']['maxControlErrorSquaredUpper']=='81/17179869184'
    assert F(81,17179869184)<F(1,1000000)
    # Original acceptance proofs are still admitted by the new checker, not just fresh copies.
    historical=load(ORIGINAL/'results.json')
    results['historicalOriginals']={}
    for key,row in historical['primary'].items():
        data=load(row['results_path'])
        assert sha(Path(row['real_proof_path']))==row['realProofSha256']
        results['historicalOriginals'][key]={'verification':traced_verify(row['results_path']),
                                         'geometry':exact_geometry(data)}
    results['freshPositive']={}
    for name in ('fresh-curved','fresh-straight'):
        cli=json.loads(load(ROOT/(name+'.command.json'))['stdout'])
        data=load(cli['results'])
        results['freshPositive'][name]={'results':cli['results'],'verification':traced_verify(cli['results']),
                                       'geometry':exact_geometry(data),'budget':data['budget']}
    curved=load(results['freshPositive']['fresh-curved']['results'])
    assert list(map(F,curved['controls'][1][3]['idealWorld'][2]))==[F(1,32),F(1,8)]
    assert F(1,4)**2+F(-1,4)**2==F(1,8)
    assert F(1,1000)+F(1,250)==F(1,200)
    results['mathematicalConstants']={'idealUnfoldedDerivative':['1/4','-1/4','0'],
        'positiveSquaredNormAndDot':'1/8','delta':'1/1000','tau':'1/250','sum':'1/200',
        'exactEndpointScope':'shared seam E only','farCurvedGZ':'1/32+sqrt(2)/8',
        'rationalAndPLExactG1':False}
    results['compiledAgainstPrior']={}
    for row in prior['fresh']['compiled']:
        actual=sha(ROOT/'compiled'/row['name'])
        assert actual==row['sha256']
        results['compiledAgainstPrior'][row['name']]={'sha256':actual,'identical':True}
    results['negative']={}
    for name in ('negative-coarse','negative-overspend','negative-cap'):
        cmd=load(ROOT/(name+'.command.json'))
        cli=json.loads(cmd['stdout'])
        refusal=load(cli['evidence'])
        assert refusal['producerCalled'] is False
        results['negative'][name]={'exit':cmd['exit'],'refusal':refusal}
    save(ROOT/'witness-results.json',results)
    print(json.dumps({'witness':'PASS','results':str(ROOT/'witness-results.json'),
        'freshTiltedPublic':results['freshRealTiltedProof']['public'],
        'fixedRejection':results['freshRealTiltedProof']['fixedBridge'],
        'oldBridgeStillPasses':results['freshRealTiltedProof']['oldBridge']['passed']}))
