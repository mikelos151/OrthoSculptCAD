from pathlib import Path
import hashlib,json,shutil,subprocess
ROOT=Path('C:/Users/sandr/OrthoSculptCAD')
OUT=Path(__file__).parent
EDIT=['src/compute/workerPool.ts','src/compute/nativeHandoff.ts','tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts']
READ=['src/compute/resourceLedger.ts','src/compute/nativeHandoff.worker.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert not (OUT/'before.json').exists()
for f in EDIT+READ:
 p=OUT/'before'/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/f,p)
(OUT/'before.json').write_text(json.dumps({f:sha(ROOT/f) for f in EDIT+READ},indent=2)+'\n')
for label,dirname,expected,count in [('spec','v03-native-handoff-teardown-spec-rereview','014be0ec611f2c561a77cfd5b0988c5ef98d91c0aec3a1d7367e7c5f4473c66b',68),('quality','v03-native-handoff-teardown-quality-rereview','4f3dd29dbc307548bb0650e4269714ea1ab38a998a29be067d1f3e3e165ee797',53)]:
 base=OUT.parent/dirname;m=base/'artifact-manifest.json';assert sha(m)==expected
 data=json.loads(m.read_text());entries=data.get('files',data.get('entries'));assert len(entries)==count
 roots={k:Path(v)for k,v in data.get('roots',{'scratch':str(base)}).items()}
 for e in entries:
  p=roots[e.get('root','scratch')]/e['path'];assert sha(p)==e['sha256'],str(p)
 dest=OUT/label;dest.mkdir()
 for f in ['run.mjs','tsconfig.json','package.json','loader.mjs','witness.mjs']+(['boundary.mjs'] if label=='spec' else ['repro.mjs','matrix.mjs']):shutil.copyfile(base/f,dest/f)
 if label=='spec':
  p=dest/'run.mjs';text=p.read_text();old=base.as_posix();assert text.count(old)==1;p.write_text(text.replace(old,dest.as_posix()))
 cfg=json.loads((dest/'tsconfig.json').read_text());cfg['compilerOptions']['outDir']=(dest/'compiled').as_posix();(dest/'tsconfig.json').write_text(json.dumps(cfg,indent=2)+'\n')
 proof={f:{'original':sha(base/f),'copy':sha(dest/f)}for f in ['loader.mjs','witness.mjs']+(['boundary.mjs']if label=='spec'else['repro.mjs','matrix.mjs'])}
 assert all(v['original']==v['copy']for v in proof.values());(dest/'unchanged-witnesses.json').write_text(json.dumps(proof,indent=2)+'\n')
 print(label,'verified manifest',len(entries),'unchanged witnesses',len(proof))
(OUT/'root-cause.md').write_text('''# Root cause, ranked hypotheses before edits\n1. Q2: pool stop removes two listeners in one unprotected sequence; first throw prevents second removal and native terminate. Predict cleanup position 4/5 fails with terminate=0 and occupied slot.\n2. B1: dispose reentered from facade cleanup calls pool.dispose while original stopWorker owns completion; native E is caught as cleanup and replaced by snapshot-derived NATIVE_TERMINATE. Predict exact E mismatch only for facade cleanup disposal, not native terminate reentry.\n3. Q1 regression alternative: return publication after revoke. Already independently closed; retain legacy tests and unchanged witnesses.\nNo change to authority, ABI, resourceLedger, endpoint, source admission, App, dependencies or product architecture.\n''')
print('snapshots ready')
