from pathlib import Path
import json,subprocess,shutil,sys,os
ROOT=Path('C:/Users/sandr/OrthoSculptCAD');OUT=Path(__file__).parent
phase=sys.argv[1];dest=OUT/'runs'/phase;dest.mkdir(parents=True,exist_ok=False)
for f in ['src/compute/workerPool.ts','src/compute/nativeHandoff.ts','tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts']:
 p=dest/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/f,p)
config={'root':ROOT.as_posix(),'cacheDir':(OUT/'vite-cache').as_posix(),'test':{'include':['tests/v03-worker-pool.test.ts','tests/v03-native-handoff.test.ts','tests/v03-resource-ledger.test.ts'],'environment':'node','maxWorkers':1,'fileParallelism':False,'execArgv':['--max-old-space-size=256','--max-semi-space-size=8']}}
(dest/'vitest.config.mjs').write_text('export default '+json.dumps(config)+';\n')
cmd=['node','--max-old-space-size=256','--max-semi-space-size=8',str(ROOT/'node_modules/vitest/vitest.mjs'),'run','--config',str(dest/'vitest.config.mjs'),'--configLoader','native','--maxWorkers=1','--no-file-parallelism','--reporter=verbose','--reporter=json','--outputFile.json='+str(dest/'tests.json')]+sys.argv[2:]
env=dict(os.environ,NODE_OPTIONS='');p=subprocess.run(cmd,cwd=ROOT,capture_output=True,timeout=180,env=env)
(dest/'stdout.log').write_bytes(p.stdout);(dest/'stderr.log').write_bytes(p.stderr)
meta={'command':cmd,'cwd':str(ROOT),'exit':p.returncode};(dest/'command.json').write_text(json.dumps(meta,indent=2)+'\n')
if(dest/'tests.json').exists():
 data=json.loads((dest/'tests.json').read_text());meta.update({k:data.get(k)for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']});meta['failures']=[{'file':r['name'],'name':t['fullName'],'message':t['failureMessages'][0][:700]}for r in data['testResults']for t in r['assertionResults']if t['status']=='failed']
else:meta['stderr']=p.stderr.decode('utf8','replace')[-4000:]
(dest/'summary.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({k:v for k,v in meta.items()if k not in ['command','failures']},indent=2));print('failures:',len(meta.get('failures',[])),'; raw logs:',dest);sys.exit(p.returncode)
