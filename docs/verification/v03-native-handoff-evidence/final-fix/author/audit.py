from pathlib import Path
import json,hashlib,difflib,re,shutil
ROOT=Path('C:/Users/sandr/OrthoSculptCAD');OUT=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=json.loads((OUT/'before.json').read_text());allowed=['src/compute/workerPool.ts','src/compute/nativeHandoff.ts','tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts']
expected=['b5a7457bde19616b61247ca690bf2b1bc5f387cd3067db3ad56cb9c115878e64','c57931244eb8a3b885fef9f55a9398417f16148a100ad3be9269de2f9a46a827','0f977cb7b128492ec33667f805c553de074d1417c60c08bacd6316c0190bc5a7','ca275490a8514f139afb32b838b9572bc16a34336b8b4e6de37073eea49d86bc']
assert[before[f]for f in allowed]==expected
scope=json.loads((OUT/'scope-before.json').read_text());changes=[]
for f,h in scope['files'].items():
 now=sha(ROOT/f)if(ROOT/f).is_file()else None
 if h!=now:changes.append(f)
assert set(changes)==set(allowed),changes
allpaths={p.relative_to(ROOT).as_posix()for d in ['src','tests','docs/plans']for p in (ROOT/d).rglob('*')if p.is_file()}
assert not(allpaths-set(scope['files']))
assert(OUT/'tracked-before.bin').read_bytes()==(OUT/'tracked-after.bin').read_bytes()
proof={'frozen_count':len(scope['files']),'changed_only_allowed':changes,'coverage':scope['coverage'],'tracked_path_set_unchanged':True,'sha256':{f:{'before':h,'after':sha(ROOT/f)}for f,h in before.items()},'tests_append_only':{}}
for f in allowed:
 p=OUT/'final'/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/f,p)
 if f.startswith('tests/'):
  old=(OUT/'before'/f).read_bytes();new=(ROOT/f).read_bytes();same=new.startswith(old);proof['tests_append_only'][f]=same
  assert same,f
(OUT/'scope-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
diff=''.join(''.join(difflib.unified_diff((OUT/'before'/f).read_text().splitlines(keepends=True),(ROOT/f).read_text().splitlines(keepends=True),fromfile='a/'+f,tofile='b/'+f))for f in allowed)
(OUT/'minimal.diff').write_text(diff)
added='\n'.join(line[1:]for line in diff.splitlines()if line.startswith('+')and not line.startswith('+++'))
patterns={'secret':r"(?i)(api_key|secret|password|passwd)\s*=\s*['\"][^'\"]{6,}",'shell_injection':r'os\.system\(|subprocess.*shell=True','eval_exec':r'\beval\(|\bexec\(','pickle':r'pickle\.loads?\('}
scan={k:re.findall(p,added)for k,p in patterns.items()};assert not any(scan.values())
(OUT/'static-scan.json').write_text(json.dumps({'scope':'added lines only, baseline-to-candidate four-file diff','results':scan},indent=2)+'\n')
audit={}
for name,red,green in [('q2-pool','q2-pool-red','q2-pool-green'),('q2-composition','q2-composition-red','q2-composition-green'),('b1','b1-red','b1-green')]:
 a=OUT/'runs'/red;b=OUT/'runs'/green
 tests={f:sha(a/f)==sha(b/f)for f in allowed if f.startswith('tests/')};assert all(tests.values())
 audit[name]={'red':json.loads((a/'summary.json').read_text()),'green':json.loads((b/'summary.json').read_text()),'identical_tests':tests,'production_pair':{f:{'red':sha(a/f),'green':sha(b/f)}for f in allowed if f.startswith('src/')}}
audit['vertical_continuity']={'q2poolgreen_to_compositionred':all(sha(OUT/'runs/q2-pool-green'/f)==sha(OUT/'runs/q2-composition-red'/f)for f in allowed if f.startswith('src/')),'q2compositiongreen_to_b1red':all(sha(OUT/'runs/q2-composition-green'/f)==sha(OUT/'runs/b1-red'/f)for f in allowed if f.startswith('src/')),'b1green_to_final_coverage_production_unchanged':all(sha(OUT/'runs/b1-green'/f)==sha(ROOT/f)for f in allowed if f.startswith('src/'))}
assert all(audit['vertical_continuity'].values())
audit['classification']={'pool_red':{'selected':8,'failed':8},'composition_red':{'selected':15,'failed':6,'existing_coverage_passed':9},'b1_red':{'selected':30,'failed':18,'existing_coverage_passed':12},'additional_existing_coverage':80,'no_manufactured_red':True}
(OUT/'tdd-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
# Assert native results serve this exact candidate, never historical compiled modules.
pool=json.loads((OUT/'native-pool/native-results.json').read_text());native=json.loads((OUT/'native-handoff/phases/candidate/native-results.json').read_text())
for f,h in pool['hashes']['source'].items():assert sha(ROOT/f)==h
for f,h in native['hashes']['source'].items():assert sha(ROOT/'src/compute'/f)==h
for label in ['spec','quality']:
 d=OUT/label
 for f,h in json.loads((d/'fresh-compile-inputs.json').read_text()).items():assert sha(ROOT/f)==h
 for f,v in json.loads((d/'unchanged-witnesses.json').read_text()).items():assert sha(d/f)==v['original']
print(json.dumps({'frozen':len(scope['files']),'changed':changes,'hashes':proof['sha256'],'append_only':proof['tests_append_only'],'vertical':audit['vertical_continuity'],'static_scan_clean':not any(scan.values())},indent=2))
