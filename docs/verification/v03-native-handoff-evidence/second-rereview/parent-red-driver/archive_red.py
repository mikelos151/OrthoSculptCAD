from pathlib import Path
import json,hashlib,shutil
r=Path('C:/Users/sandr/OrthoSculptCAD');s=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch');d=r/'docs/verification/v03-native-handoff-evidence/second-rereview';assert not d.exists();files=[]
for label,name in [('spec','v03-native-handoff-teardown-spec-rereview'),('quality','v03-native-handoff-teardown-quality-rereview'),('parent-integration-red','v03-native-handoff-integration-parent-red'),('parent-b1-red','v03-native-handoff-b1-parent-red'),('parent-red-driver','v03-native-handoff-second-fix-parent')]:
 base=s/name
 for p in sorted(base.rglob('*')):
  if not p.is_file():continue
  q=d/label/p.relative_to(base);q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);raw=q.read_bytes();assert raw==p.read_bytes();files.append({'path':q.relative_to(r).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
for name in ['src/compute/nativeHandoff.ts','src/compute/workerPool.ts','tests/v03-native-handoff.test.ts','tests/v03-worker-pool.test.ts']:
 p=r/name;q=d/'pre-second-fix-source'/name;q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);raw=q.read_bytes();files.append({'path':q.relative_to(r).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
(d/'index.json').write_text(json.dumps({'files':files,'count':len(files),'status':'HOLD_Q2_INTEGRATION_AND_B1, parent independently reproduced boundary55/51/4,repro20/18/2,matrix124/106/18 each exit1; UNIT faults, no demonstrated native exploit','next':'Second and last auto-fix cycle; narrowly authorized workerPool dependency correction plus nativeHandoff/test regressions, no acceptance/commit'},indent=2)+'\n');print(json.dumps({'archivedFiles':len(files),'status':'HOLD_Q2_INTEGRATION_B1'}))
