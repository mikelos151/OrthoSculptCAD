"""Reproduce only this scratch spike; never modify the repository or dependencies."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
REPO=Path('C:/Users/sandr/OrthoSculptCAD')
CWD=Path('C:/Users/sandr')
EXPECTED_HEAD='f288ffccb0d1eb2f2f901d9a03e1daa408b289db'
EXPECTED_PLAN='c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf'
NODE_OPTIONS='--max-old-space-size=128 --max-semi-space-size=8'
# The packaged WindowsApps git is executable from the tool's Bash but
# CreateProcess from this Python returns WinError 5. Use the already installed
# user-local Git, independently probed read-only; no copies/install/ACL changes.
GIT='C:/Users/sandr/AppData/Local/hermes/tools/git-2.53.0+3-win32-x64/mingw64/bin/git.exe'
SOURCE_PATHS=[REPO/'src'/p for p in (
    'types.ts','geometry/auditTypes.ts','geometry/core.ts','geometry/intersections.ts','geometry/audit.ts',
    'io/validation.ts','trimline/numerics.ts','trimline/bezier.ts','trimline/face-cubic.ts','trimline/source-candidate.ts')]
SOURCE_PATHS += [REPO/'tsconfig.json',REPO/'node_modules/typescript/package.json',
                 REPO/'node_modules/typescript/bin/tsc',REPO/'node_modules/typescript/lib/_tsc.js',
                 REPO/'tests/reference/v03_source_candidate_oracle.py',
                 REPO/'tests/reference/v03_face_cubic_verify.py',
                 REPO/'tests/reference/v03_bezier_verify.py',
                 REPO/'docs/plans/v03-source-bound-spans-design.md']
sys.dont_write_bytecode=True

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def dump(name,data):
    (ROOT/name).write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')

def main():
    (ROOT/'logs').mkdir(exist_ok=True)
    env=dict(os.environ,NODE_OPTIONS=NODE_OPTIONS,PYTHONDONTWRITEBYTECODE='1')
    records=[]
    before={p.as_posix():sha(p) for p in SOURCE_PATHS}
    assert before[(REPO/'docs/plans/v03-source-bound-spans-design.md').as_posix()]==EXPECTED_PLAN
    def run(label,args):
        result=subprocess.run(args,cwd=CWD,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
        out=result.stdout.decode('utf-8',errors='replace')
        err=result.stderr.decode('utf-8',errors='replace')
        log=dict(label=label,argv=list(map(str,args)),cwd=CWD.as_posix(),
                 environmentOverrides=dict(NODE_OPTIONS=NODE_OPTIONS,PYTHONDONTWRITEBYTECODE='1'),
                 exitCode=result.returncode,stdout=out,stderr=err)
        records.append(log)
        dump('logs/'+label+'.json',log)
        dump('commands-and-results.json',records)
        print(f'{label}: exit={result.returncode}')
        if out: print(out,end='')
        if err: print(err,end='')
        if result.returncode:
            raise RuntimeError(f'{label} failed; actual output preserved')
        return out,err
    head,_=run('00-head',[GIT,'-C',REPO.as_posix(),'rev-parse','HEAD'])
    assert head.strip()==EXPECTED_HEAD
    status_before,_=run('01-initial-status',[GIT,'-C',REPO.as_posix(),'status','--short'])
    run('02-node-version',['node','--version'])
    run('03-python-version',[sys.executable,'--version'])
    run('04-typescript-version',['node',(REPO/'node_modules/typescript/bin/tsc').as_posix(),'--version'])
    run('05-exact-fixtures',[sys.executable,(ROOT/'exact_fixtures.py').as_posix()])
    emitted,_=run('06-strict-subset-compile',['node',(REPO/'node_modules/typescript/bin/tsc').as_posix(),
                         '-p',(ROOT/'tsconfig.json').as_posix(),'--listEmittedFiles'])
    emitted_paths=[Path(line.removeprefix('TSFILE: ').strip()) for line in emitted.splitlines() if line.startswith('TSFILE: ')]
    assert len(emitted_paths)==10 and all(p.is_relative_to(ROOT) for p in emitted_paths)
    run('07-actual-existing-api-harness',['node',(ROOT/'actual_harness.mjs').as_posix()])
    public_out,_=run('08-complete-public-verifier',[sys.executable,
        (REPO/'tests/reference/v03_face_cubic_verify.py').as_posix(),
        '--input',(ROOT/'actual-local-face-proof.json').as_posix()])
    public=json.loads(public_out)
    assert public==dict(passed=True,cases=5,leaves=60,samples=65)
    _,test_err=run('09-focused-regression-tests',[sys.executable,(ROOT/'test_fixture_regression.py').as_posix()])
    match=re.search(r'Ran (\d+) tests?',test_err)
    assert match and 'OK' in test_err
    test_count=int(match.group(1))
    head_after,_=run('10-final-head',[GIT,'-C',REPO.as_posix(),'rev-parse','HEAD'])
    assert head_after.strip()==EXPECTED_HEAD
    status_after,_=run('11-final-status',[GIT,'-C',REPO.as_posix(),'status','--short'])
    after={p.as_posix():sha(p) for p in SOURCE_PATHS}
    assert before==after,'Read-only dependency changed during spike; evidence needs re-run'
    actual=json.loads((ROOT/'actual-results.json').read_text(encoding='utf-8'))
    rows=actual['rows']
    handoff=dict(verdict='VALIDATED existing local-candidate PASS versus whole-S audit FAIL/UNKNOWN; admission remains BLOCKED',
        scope='scratch-only synthetic TESTDATA fixture/proof spike; no production changes, no admission implementation',
        repo=REPO.as_posix(),branch='feature/trimline-v03',head=EXPECTED_HEAD,
        normativeSourcePlanSHA256=EXPECTED_PLAN,scratch=ROOT.as_posix(),
        exactPositive=dict(vertices=8,faces=12,edges=18,components=1,cyclicVertexLinks=8,signedVolume='1'),
        cases=len(rows),localCandidatePass=len(rows),
        observedRequiredAuditPass=[r['id'] for r in rows if r['observedRequiredAuditPass']],
        freshAuditBlocks=[dict(id=r['id'],complete=r['complete'],orientation=r['orientation'],
                              checks=r['checkStatuses']) for r in rows if not r['observedRequiredAuditPass']],
        savedReportExperiment='3 labeled synthetic untrusted old-report associations; no external API or production reload claim',
        selfcrossExactWitness=dict(faces=[[0,2,1],[4,5,6]],segment=[['4/5','4/5','0'],['1','4/5','0']],
                                   squaredLength='1/25',signedVolume='7/12',polynomialIdentity=True),
        zeroPairBudget='UNKNOWN; incomplete; no automatic PASS',minimumThickness='UNKNOWN in every actual audit',
        completePublicProof=public,focusedUnittestCount=test_count,
        nodeOptions=NODE_OPTIONS,compile='Actual strict ES2022/ESNext/bundler tsconfig subset; 10 emitted existing-code modules',
        actualNativeDigest='Native Node WebCrypto SHA-256 agrees with independent Python hashlib for all 5 whole sources',
        noProductionCodeChanges=True,sourceHashesStable=before==after,
        repositoryStatusBefore=status_before.strip().splitlines(),repositoryStatusAfter=status_after.strip().splitlines(),
        blockers=[
            'auditMesh exercised on public input mesh, NOT candidate-private bytes; positive candidate still lacks authority',
            'No retained private audit owner/shared-ledger working-set proof or admission token',
            'No cut/shell/export consumer admission gate or native Worker/stale-publication fences tested',
            'Selfcross fresh audit has known intersection FAIL AND complete=false (numeric ambiguity), kept honest',
            'Not tracer4 admission acceptance; only independently exercised fixtures for parent review'],
        entryPoints=['README.md','run_spike.py','catalog.json','exact-topology.json','exact-intersection-witness.json',
                     'actual-results.json','actual-positive-audit.json','actual-audit-reports.json',
                     'actual-local-face-proof.json','synthetic-untrusted-saved-PASS-claims.json',
                     'test_fixture_regression.py','commands-and-results.json','hashes.json'])
    dump('handoff.json',handoff)
    artifacts={p.relative_to(ROOT).as_posix():sha(p) for p in sorted(ROOT.rglob('*'))
               if p.is_file() and p.name!='hashes.json' and '__pycache__' not in p.parts}
    dump('hashes.json',dict(algorithm='SHA-256',generatedAtUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            sourceFiles=before,sourceFilesAfter=after,
                            emittedModules={p.relative_to(ROOT).as_posix():sha(p) for p in emitted_paths},
                            artifactFiles=artifacts,
                            selfExclusion='hashes.json intentionally excluded from its own hash map'))
    print(json.dumps(dict(verdict=handoff['verdict'],focusedTests=test_count,publicProof=public,
                          nativeWholeSourceDigests=len(rows),sourceHashesStable=True,
                          handoff=(ROOT/'handoff.json').as_posix()),sort_keys=True))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
