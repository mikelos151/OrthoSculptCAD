from pathlib import Path
import json,hashlib,re,collections
r=Path('C:/Users/sandr/OrthoSculptCAD');s=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix');h=json.loads((s/'handoff.json').read_text());p=s/'artifact-manifest.json';assert hashlib.sha256(p.read_bytes()).hexdigest()=='6493d5f6e2b433161e48314e6123f29cc16d5b3b311c292d710d4c79867eb43a';m=json.loads(p.read_text());entries=m.get('files',m.get('entries'));assert isinstance(entries,list)and len(entries)==224
roots={k:Path(v)for k,v in m.get('roots',{'scratch':str(s),'repository':str(r)}).items()};assert all(p in [r,s]for p in roots.values())
for e in entries:
 p=roots[e['root']]/e['path'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==e['sha256'],e['path']
for n,v in h['changes']['files'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==v['after'],n
before=r/'docs/verification/v03-native-handoff-evidence/second-rereview/pre-second-fix-source'
for n in ['tests/v03-native-handoff.test.ts','tests/v03-worker-pool.test.ts']:assert (r/n).read_bytes().startswith((before/n).read_bytes()),n
names=['src/compute/resourceLedger.ts','src/compute/workerPool.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts'];patterns={'credentials':r"(?i)(?:api_key|secret|password|passwd)\s*=\s*['\"][^'\"]{6,}['\"]",'dynamicExecution':r'\b(?:eval|exec)\s*\(','networkOrProcess':r'\b(?:fetch|XMLHttpRequest|WebSocket|child_process)\b'};scan={k:[{'path':n,'line':i}for n in names for i,line in enumerate((r/n).read_text().splitlines(),1)if re.search(rx,line)]for k,rx in patterns.items()}
print(json.dumps({'manifestEntriesVerified':len(entries),'roots':dict(collections.Counter(e['root']for e in entries)),'allOld33Handoff24PoolPreservedBytePrefix':True,'sourceHashes':{n:hashlib.sha256((r/n).read_bytes()).hexdigest()for n in names},'staticScan':scan,'nativeMetadata':{k:v for k,v in h['verification'].items()if 'native' in k.lower()},'nativeCLIs':[p.relative_to(s).as_posix()for p in s.rglob('*cli*.mjs')]}))
