from pathlib import Path
import hashlib,json,shutil
root=Path('C:/Users/sandr/OrthoSculptCAD')
out=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix')
review=out.parent/'v03-native-handoff-quality-review'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(review/'artifact-manifest.json')=='53793823e487d379177a2241f12f33a096e003132c10ee333f81c111019a4ec5'
m=json.loads((review/'artifact-manifest.json').read_text())
assert len(m['files'])==m['entries']==39
for e in m['files']:
 p=(review if e.get('root','scratch')=='scratch' else root)/e['path']
 assert sha(p)==e['sha256'],str(p)
files={}
for p in root.rglob('*'):
 if any(x in ('.git','node_modules') for x in p.relative_to(root).parts):continue
 if p.is_file():files[p.relative_to(root).as_posix()]=sha(p)
(out/'input-start.json').write_text(json.dumps(files,indent=2))
(out/'original-review-hashes.json').write_text(json.dumps({p.name:sha(p) for p in [review/'review.json',review/'witness.mjs',review/'run.mjs',review/'artifact-manifest.json']},indent=2))
for name in ['witness.mjs','loader.mjs']:
 d=out/'quality'/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(review/name,d)
(out/'quality/package.json').write_text('{"type":"module"}')
config={'compilerOptions':{'target':'ES2022','module':'ES2022','moduleResolution':'bundler','lib':['ES2022','DOM'],'types':[],'strict':True,'noUnusedLocals':True,'noUnusedParameters':True,'skipLibCheck':True,'outDir':str(out/'quality/compiled'),'rootDir':str(root/'src/compute')},'files':[str(root/'src/compute'/n) for n in ['resourceLedger.ts','workerPool.ts','nativeHandoff.ts','nativeHandoff.worker.ts']]}
(out/'quality/tsconfig.json').write_text(json.dumps(config,indent=2))
(out/'vitest.config.mjs').write_text("export default {root:'C:/Users/sandr/OrthoSculptCAD',cacheDir:"+json.dumps(str(out/'vite-cache').replace('\\','/'))+",test:{include:['tests/v03-resource-ledger.test.ts','tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts'],environment:'node',maxWorkers:1,fileParallelism:false}};\n")
print(json.dumps({'frozen_files':len(files),'quality_manifest_verified':len(m['files']),'sources':{n:files[n] for n in ['src/compute/nativeHandoff.ts','tests/v03-native-handoff.test.ts','src/compute/resourceLedger.ts','src/compute/nativeHandoff.worker.ts','src/compute/workerPool.ts']}}))
