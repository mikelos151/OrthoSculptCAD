"""Read-only review runner; every output is under this owned directory."""
from pathlib import Path
import subprocess
import sys
import os
import json
import hashlib
import struct
from fractions import Fraction
import importlib.util
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
EXPECTED = {
'docs/plans/v03-source-bound-spans-design.md':'c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf',
'docs/plans/v03-source-candidate-oracle-contract.md':'043c304fe5ebba2dc920fa858a2e7937dedd53ff71e53bbd61ff84fc9dea1b44',
'src/trimline/source-candidate.ts':'983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b',
 'tests/v03-source-candidate.test.ts':'8939b5b676194c3b5bca29f9d0f2cd7b889ce2c4d22ccf06327309fb08a97188',
 'tests/reference/v03_source_candidate_oracle.py':'39244a4056d8e081c7a89b43b9aa7fde220c3c3f879addf8e92c0253105015e8',
 'tests/reference/test_v03_source_candidate_oracle.py':'2153073511ba578c7456c04e95091fcbc1b3543bfa4fb6486ffb46bcf4fb7c3b',
 'tests/fixtures/v03-source-candidate-oracle.json':'cca26c881316cbebf35b0950483f00596dce8e02460ab2103180f0b987b10ac9'}

def hashes():
    actual = {p:hashlib.sha256((REPO/p).read_bytes()).hexdigest() for p in EXPECTED}
    assert actual == EXPECTED
    return actual

commands = []
def run(command, log):
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=128 --max-semi-space-size=8', PYTHONDONTWRITEBYTECODE='1')
    p = subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (ROOT/log).write_text(p.stdout+p.stderr,encoding='utf-8')
    commands.append({'argv':command,'exit_code':p.returncode,'log':log})
    print(json.dumps(commands[-1]),flush=True)
    assert p.returncode == 0, p.stdout+p.stderr
    return p.stdout


def decode(bits):
    # Independent expression: explicit integer hidden bit and signed dyadic scale.
    assert type(bits) is int and 0 <= bits < 2**32
    sign = -1 if bits & 0x80000000 else 1
    exponent, tail = (bits // 2**23) % 256, bits % 2**23
    assert exponent != 255
    return sign * (Fraction(tail,2**149) if exponent == 0 else Fraction(2**23+tail)*Fraction(2)**(exponent-150))


def canonical(m,s):
    def n(x): return x.to_bytes(4,'little')
    def text(x):
        b=x.encode('utf-8'); return n(len(b))+b
    b=b'OrthoSculptSourceCandidate\x00'+n(1)+n(len(m['positionsBits'])//3)+n(len(m['indices'])//3)
    for key in ['positionsBits','indices']:
        b += b''.join(n(v) for v in m[key])
    for key in ['colorsBits','uvsBits']:
        b += bytes([key in m])
        if key in m: b += b''.join(n(v) for v in m[key])
    b += bytes([{'synthetic':1,'imported':2}.get(m.get('source'),0)])+text(m['name'])
    b += bytes(['textureUrl' in m])
    if 'textureUrl' in m: b += text(m['textureUrl'])
    return b+text(s['units'])+b'\x01'+text(s['frameId'])


def main():
    before = hashes()
    fixture = json.loads((REPO/'tests/fixtures/v03-source-candidate-oracle.json').read_bytes())
    assert set(fixture)=={'format','version','cases'}
    assert fixture['format']=='OrthoSculptSourceCandidateOracle' and fixture['version']==1
    faces=0
    for c in fixture['cases']:
        m,s,e=c['mesh'],c['stamp'],c['expected']
        b=canonical(m,s)
        assert e['sourceDigest']=='sha256:'+hashlib.sha256(b).hexdigest()
        assert e['vertexCount']==len(m['positionsBits'])//3 and e['faceCount']==len(m['indices'])//3
        assert len(e['faces'])==e['faceCount']
        for ordinal,f in enumerate(e['faces']):
            assert f['sourceFace']==ordinal
            ids=m['indices'][3*ordinal:3*ordinal+3]; assert f['vertexIDs']==ids
            bits=[m['positionsBits'][3*i:3*i+3] for i in ids]; assert f['positionBits']==bits
            ratios=[[decode(v) for v in row] for row in bits]
            assert f['triangle']==[[{'n':str(v.numerator),'d':str(v.denominator)} for v in row] for row in ratios]
            faces+=1
    assert len(fixture['cases'])==31 and faces==121
    sys.path.insert(0,str(REPO/'tests/reference'))
    import v03_source_candidate_oracle as oracle
    import test_v03_source_candidate_oracle as tests
    import v03_face_cubic_verify as verifier
    assert oracle.generate_fixture()==fixture
    # The original CLI test hardcodes an author's scratch root; redirect only its
    # Path.home() to our root. All original seven test bodies/assertions stay intact.
    with (ROOT/'python-unittest.log').open('w',encoding='utf-8') as log:
        with patch.object(tests.Path,'home',return_value=ROOT):
            result=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(tests))
    assert result.wasSuccessful() and result.testsRun==7
    run(['node',str(REPO/'node_modules/typescript/bin/tsc'),'-p',str(ROOT/'tsconfig.json')],'strict-subset-compile.log')
    run(['node',str(ROOT/'runtime-witness.cjs')],'runtime.log')
    live=json.loads((ROOT/'runtime-actual.json').read_bytes())
    for c,actual,hexbytes in zip(fixture['cases'],live['outputs'],live['capturedBytes'],strict=True):
        assert actual['id']==c['id']
        assert bytes.fromhex(hexbytes)==canonical(c['mesh'],c['stamp'])
    proof=json.loads((ROOT/'actual-face-proof.json').read_bytes())
    summary=verifier.verify_bundle(proof)
    assert summary['passed'] is True
    (ROOT/'python-public-proof-verifier.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    # Reject actual producer controls without altering field names or proof shape.
    import copy
    mutant=copy.deepcopy(proof)
    value=mutant['cases'][0]['containment']['controls'][0][2]
    mutant['cases'][0]['containment']['controls'][0][2]={'n':str(int(value['n'])+int(value['d'])),'d':value['d']}
    try:
        verifier.verify_bundle(mutant)
    except ValueError:
        mutation_rejected=True
    else:
        raise AssertionError('off-plane mutation not rejected')
    rejected=[]
    for case in live['invalidFrames']:
        if case['accepted']:
            s=dict(fixture['cases'][0]['stamp'],frameId=case['frameId'])
            try: oracle.validate_input(fixture['cases'][0]['mesh'],s)
            except ValueError: rejected.append(case['frameId'])
            else: raise AssertionError('oracle unexpectedly permits illegal frame')
    by_id={c['id'].removeprefix('TESTDATA-'):c for c in fixture['cases']}
    pairs=[('tetra-base','distant-position'),('tetra-base','distant-index'),('unreferenced-base','unreferenced-change'),('rgb-base','rgb-distant'),('uv-base','uv-distant'),('texture-png','texture-png-change'),('all-attrs','all-attrs-namechange')]
    for a,b in pairs:
        assert by_id[a]['expected']['faces'][0]==by_id[b]['expected']['faces'][0]
        assert by_id[a]['expected']['sourceDigest']!=by_id[b]['expected']['sourceDigest']
    for key in ['epoch','revision','generation']:
        assert by_id[key]['expected']['sourceDigest']==by_id['tetra-base']['expected']['sourceDigest']
    assert by_id['frame']['expected']['sourceDigest']!=by_id['tetra-base']['expected']['sourceDigest']
    assert by_id['negative-zero']['expected']['faces'][0]['triangle']==by_id['tetra-base']['expected']['faces'][0]['triangle']
    assert by_id['negative-zero']['expected']['sourceDigest']!=by_id['tetra-base']['expected']['sourceDigest']
    after=hashes()
    results={'fixture_cases':31,'fixture_faces':faces,'fixture_unique_digests':len({c['expected']['sourceDigest'] for c in fixture['cases']}),
      'original_python_tests':result.testsRun,'original_python_tests_passed':True,'cli_test_path_redirect_only':True,
      'all_native_sha_preimages_independently_equal':True,'public_proof_verifier':summary,'actual_off_plane_mutation_rejected':mutation_rejected,
      'accepted_illegal_frames_rejected_by_python':rejected,'end_hashes_unchanged':before==after,'hashes':after,'commands':commands}
    (ROOT/'witness-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps(results,indent=2))

if __name__=='__main__': main()
