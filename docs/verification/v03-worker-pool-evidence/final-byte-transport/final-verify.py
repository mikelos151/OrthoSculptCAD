from pathlib import Path
import hashlib,json,subprocess,shutil
b=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/pb1');r=Path('C:/Users/sandr/OrthoSculptCAD');m=json.loads((b/'final-manifest.json').read_text());runs=[]
for mode in ['tt','ff']:
 e=b/mode
 for n,h in m.items():assert hashlib.sha256((e/n).read_bytes()).hexdigest()==h,(mode,n)
 shutil.copyfile(e/'docs/verification/v03-worker-pool-evidence/independent/quality/witnesses.cjs',e/'witnesses.cjs');cfg={'compilerOptions':{'target':'ES2022','module':'CommonJS','lib':['ES2022','DOM'],'types':[],'strict':True,'skipLibCheck':True,'rootDir':str(e/'src/compute'),'outDir':str(e/'compiled'),'noEmitOnError':True},'files':[str(e/'src/compute/resourceLedger.ts'),str(e/'src/compute/workerPool.ts')]};(e/'tsconfig.json').write_text(json.dumps(cfg)+'\n')
 for label,args in [('compile',['node','--max-old-space-size=128','--max-semi-space-size=8',str(r/'node_modules/typescript/bin/tsc'),'-p',str(e/'tsconfig.json')]),('witness',['node','--max-old-space-size=128','--max-semi-space-size=8',str(e/'witnesses.cjs')])]:
  x=subprocess.run(args,cwd=e,capture_output=True,timeout=120);(b/(mode+'-'+label+'.stdout.log')).write_bytes(x.stdout);(b/(mode+'-'+label+'.stderr.log')).write_bytes(x.stderr);assert x.returncode==0,(mode,label)
 v=json.loads((e/'witness-results.json').read_text());assert v['passed']==29 and v['failed']==0 and v['assertions']==754;runs.append({'autocrlf':mode=='tt','bytePaths':len(m),'compileExit':0,'witnessExit':0,'UNITTests':29,'assertions':754})
(b/'final-export-results.json').write_text(json.dumps({'runs':runs,'scope':'Actual staged 658-path subset; final attributes included; UNIT not browser'},indent=2)+'\n');print(json.dumps({'runs':runs}))
