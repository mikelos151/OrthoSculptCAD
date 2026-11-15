from pathlib import Path
import subprocess,json,hashlib,os
ROOT=Path('C:/Users/sandr/OrthoSculptCAD');OUT=Path(__file__).parent
records=[]
for phase,source in [('before',OUT/'before/src/compute'),('candidate',ROOT/'src/compute')]:
 cfg={'compilerOptions':{'target':'ES2022','module':'ES2022','moduleResolution':'bundler','lib':['ES2022','DOM'],'types':[],'strict':True,'noUnusedLocals':True,'noUnusedParameters':True,'skipLibCheck':True,'declaration':True,'emitDeclarationOnly':True,'outDir':(OUT/'api'/phase).as_posix(),'rootDir':source.as_posix()},'files':[(source/f).as_posix()for f in ['resourceLedger.ts','workerPool.ts','nativeHandoff.ts','nativeHandoff.worker.ts']]}
 p=OUT/('api-'+phase+'.json');p.write_text(json.dumps(cfg,indent=2)+'\n')
 cmd=['node','--max-old-space-size=128','--max-semi-space-size=8',str(ROOT/'node_modules/typescript/bin/tsc'),'-p',str(p)]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,timeout=120,env=dict(os.environ,NODE_OPTIONS=''))
 (OUT/('api-'+phase+'.stdout.log')).write_bytes(r.stdout);(OUT/('api-'+phase+'.stderr.log')).write_bytes(r.stderr)
 meta={'command':cmd,'exit':r.returncode,'cwd':str(ROOT)};records.append(meta);(OUT/('api-'+phase+'.command.json')).write_text(json.dumps(meta,indent=2)+'\n');assert r.returncode==0
proof={f:hashlib.sha256((OUT/'api/before'/f).read_bytes()).hexdigest()for f in ['workerPool.d.ts','nativeHandoff.d.ts','resourceLedger.d.ts']}
assert all((OUT/'api/before'/f).read_bytes()==(OUT/'api/candidate'/f).read_bytes()for f in proof)
(OUT/'public-api-proof.json').write_text(json.dumps({'unchanged':True,'declaration_hashes':proof,'commands':records},indent=2)+'\n');print('declaration API byte-identical:',list(proof))
