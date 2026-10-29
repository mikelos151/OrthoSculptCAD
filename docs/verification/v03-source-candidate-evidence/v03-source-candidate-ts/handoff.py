import pathlib, hashlib, json, re, subprocess
root=pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
out=pathlib.Path(__file__).parent
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
runs=[json.loads(line) for line in (out/'runs.jsonl').read_text(encoding='utf-8').splitlines()]
for run in runs:
    log=out/(run['label']+'.log')
    run['log']=str(log)
    run['logSha256']=sha(log)
    text=log.read_text(encoding='utf-8')
    run['testSummary']=[line.strip() for line in text.splitlines() if re.match(r'\s*(Tests|Test Files|Errors)\s',line)]
files={p: {'sha256':sha(root/p), 'bytes':(root/p).stat().st_size} for p in ['src/trimline/source-candidate.ts','tests/v03-source-candidate.test.ts']}
by_label={r['label']:r for r in runs}
for label in ['12-validator-allocation-error-green','12-typecheck-serial-retry','13-related-regression']:
    assert by_label[label]['exitCode']==0
    assert by_label[label]['files']=={p:meta['sha256'] for p,meta in files.items()}
plan=root/'docs/plans/v03-source-bound-spans-design.md'
assert sha(plan)=='c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf'
oracle_path=root/'tests/fixtures/v03-source-candidate-oracle.json'
oracle=json.loads(oracle_path.read_text(encoding='utf-8'))
assert len(oracle['cases'])==len({case['id'] for case in oracle['cases']})
related=(out/'13-related-regression.log').read_text(encoding='utf-8')
focused=(out/'12-validator-allocation-error-green.log').read_text(encoding='utf-8')
counts=lambda text:{'passed':int(re.findall(r'\bTests\s+(\d+) passed',text)[-1]),'reportedTotal':int(re.findall(r'\bTests\s+\d+ passed \((\d+)\)',text)[-1])}
import os
def git(*args):
    key={('branch','--show-current'):'SOURCE_CANDIDATE_GIT_BRANCH',('rev-parse','HEAD'):'SOURCE_CANDIDATE_GIT_HEAD',('status','--short'):'SOURCE_CANDIDATE_GIT_STATUS',('diff','--cached','--name-only'):'SOURCE_CANDIDATE_GIT_STAGED'}[args]
    return os.environ[key].strip()
result={
 'scope':'M0c3a owned SourceCandidateStore only; not independent acceptance or audited S',
 'repository':str(root),'branch':git('branch','--show-current'),'head':git('rev-parse','HEAD'),
 'ownedFiles':files,'plan':{'path':str(plan),'sha256':sha(plan)},
 'oracle':{'path':str(oracle_path),'sha256':sha(oracle_path),'cases':len(oracle['cases']),'faces':sum(len(c['expected']['faces']) for c in oracle['cases']),'consumption':'Untouched generated JSON; direct live describe/resolve comparisons; integers checked before typed arrays; no Python implementation inspected'},
 'verification':{'focused':counts(focused),'related':counts(related),'typecheck':{'exitCode':0,'log':str(out/'12-typecheck-serial-retry.log')},'sourceAndTestHashesMatchAllFinalSuccessfulRuns':True},
 'tdd':{'initialExecutableRed':'01-capture-red-executable.log','verticalTracers':['01-capture','02-binding','03-lifecycle','04-preflight','05-private-validation','06-buffer-reservation','07-pending-dispose','08-failure-rollback','09-face-ordinal','10-intrinsic-kind','12-validator-allocation-error'],'additionalCoverageNotClaimedAsRed':['retired h1 release during pending h2','same-context real public decoder/certifier composition','nearby plates and B/C ordering','independent Python fixture interoperability'],'history':'runs.jsonl and per-run stdout/stderr logs retain real outcomes and then-current file hashes. Final related run also retains exact source/test byte snapshots; historical states were not retroactively fabricated.'},
 'exercised':['Native WebCrypto SHA canonical whole-source preimage','Synchronous bit-owned exact subviews; intrinsic kind/buffer/range/resizable checks','Actual io assertMesh and assertTexture semantics on private snapshot','Public fromFloat32Bits and certifyFaceCubic with same cumulative ctx; real sampleCubic composition','Deep immutable outputs and opaque runtime handle authentication','Exact S+preimage budget boundaries and preallocation observation','Retirement, foreign/fake handles, closed/busy priorities, repeated release and pending h2','Gated real digest completion and clearly labelled rejection/allocation failure injection; dispose STALE_SOURCE wins'],
 'issuesEncountered':[{'label':'01-capture-green-attempt','issue':'Canonical domain NUL length was one byte short; corrected using domain.length and independent SHA assertion passed.'},{'label':'10-intrinsic-kind-red','issue':'Vitest worker exited unexpectedly once. Immediate unchanged retry produced the intended concrete failing assertion; fixed native kind authentication and passed.'},{'label':'11-typecheck-before-coverage','issue':'ES2022 type declarations lack resizable ArrayBuffer constructor overload. Test now invokes the real native constructor via Reflect.construct; no config changed.'},{'label':'12-typecheck','issue':'Actual tsc process aborted with JS heap out-of-memory during concurrent execution. Unchanged serial retry exited 0.'}],
 'limitsAndNotRun':['No source admission/audited:true, adapter, UI, Worker, cut/shell/export or dist/ZIP changes','No clinical or full-product claim; full regression and independent reviews remain parent-owned','Buffer-byte ledger is not total RSS/native crypto/GC accounting; no immediate GC or JS sandbox claim','Pending-lifecycle gates wrap real native digest completion, not invented success hashes; injected failures are explicitly labelled'],
 'worktreeAtHandoff':git('status','--short'),'stagedNames':git('diff','--cached','--name-only'),
 'writes':'Only the two named new repository files plus this owned scratch tree. No staging/commits/reset/stash; concurrent unrelated worktree paths not edited.',
 'runs':runs,
 'reproduce':{'focused':'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-ts/run.py rerun-focused','related':'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-ts/run.py rerun-related related','typecheck':'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-ts/run.py rerun-typecheck tsc'}
}
(out/'handoff.json').write_text(json.dumps(result,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ['ownedFiles','oracle','verification','stagedNames']},indent=2))
print('Handoff: '+str(out/'handoff.json'))
