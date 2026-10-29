from pathlib import Path
import hashlib,json,subprocess,shutil
b=Path(__file__).parent;r=Path('C:/Users/sandr/OrthoSculptCAD');s=b.parent/'v03-worker-pool-parent'
assert (s/'index-before.bin').read_bytes()==(b/'index-after-temp.bin').read_bytes()
assert (s/'autocrlf-before.txt').read_bytes()==(b/'autocrlf-after-temp.txt').read_bytes()
m=json.loads((b/'manifest.json').read_text());runs=[]
for mode in ['t','f']:
 e=b/mode
 for n,h in m.items():assert hashlib.sha256((e/n).read_bytes()).hexdigest()==h,(mode,n)
 shutil.copyfile(r/'docs/verification/v03-worker-pool-evidence/independent/quality/witnesses.cjs',e/'witnesses.cjs')
 cfg={'compilerOptions':{'target':'ES2022','module':'CommonJS','lib':['ES2022','DOM'],'types':[],'strict':True,'skipLibCheck':True,'rootDir':str(e/'src/compute'),'outDir':str(e/'compiled'),'noEmitOnError':True},'files':[str(e/'src/compute/resourceLedger.ts'),str(e/'src/compute/workerPool.ts')]}
 (e/'tsconfig.json').write_text(json.dumps(cfg,indent=2)+'\n')
 for label,args in [('compile',['node','--max-old-space-size=128','--max-semi-space-size=8',str(r/'node_modules/typescript/bin/tsc'),'-p',str(e/'tsconfig.json')]),('witness',['node','--max-old-space-size=128','--max-semi-space-size=8',str(e/'witnesses.cjs')])]:
  x=subprocess.run(args,cwd=e,capture_output=True,timeout=120);(b/(mode+'-'+label+'.stdout.log')).write_bytes(x.stdout);(b/(mode+'-'+label+'.stderr.log')).write_bytes(x.stderr);assert x.returncode==0,(mode,label,x.stderr.decode('utf-8','replace'))
 result=json.loads((e/'witness-results.json').read_text());assert result['tests']==29 and result['passed']==29 and result['failed']==0 and result['assertions']==754
 runs.append({'autocrlf':mode=='t','bytePaths':len(m),'compileExit':0,'UNITTests':29,'assertions':754,'witnessExit':0})
report={'scope':'Explicit byte-bound subset export, not full repository or browser execution','runs':runs,'originalIndexPreserved':True,'autocrlfConfigPreserved':True,'sourceSHA256':m['src/compute/workerPool.ts'],'manifest':m}
(b/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'runs':runs,'oldIndexPreserved':True,'configPreserved':True}))
