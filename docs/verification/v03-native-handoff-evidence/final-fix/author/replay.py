from pathlib import Path
import subprocess,json,os,sys,hashlib
ROOT=Path('C:/Users/sandr/OrthoSculptCAD');OUT=Path(__file__).parent
records=[]
def run(name,cmd,cwd=ROOT):
 p=subprocess.run(cmd,cwd=cwd,capture_output=True,timeout=180,env=dict(os.environ,NODE_OPTIONS=''))
 (OUT/(name+'.stdout.log')).write_bytes(p.stdout);(OUT/(name+'.stderr.log')).write_bytes(p.stderr)
 row={'name':name,'command':cmd,'cwd':str(cwd),'exit':p.returncode};records.append(row)
 (OUT/(name+'.command.json')).write_text(json.dumps(row,indent=2)+'\n')
 print(name,'exit',p.returncode);assert p.returncode==0,(name,p.stderr.decode('utf8','replace')[-1000:])
for label,phases in [('spec',[('boundary',55)]),('quality',[('witness',87),('repro',20),('matrix',124)])]:
 d=OUT/label
 for f,proof in json.loads((d/'unchanged-witnesses.json').read_text()).items():assert hashlib.sha256((d/f).read_bytes()).hexdigest()==proof['original']
 inputs={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()for p in (ROOT/'src/compute').glob('*.ts')}
 (d/'fresh-compile-inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
 run(label+'-strict128',['node','--max-old-space-size=128','--max-semi-space-size=8',str(ROOT/'node_modules/typescript/bin/tsc'),'-p',str(d/'tsconfig.json')])
 for phase,count in phases:
  run(label+'-'+phase,['node',str(d/'run.mjs'),phase],d)
  data=json.loads((d/(phase+'-results.json')).read_text());assert(data['total'],data['passed'],data['failed'])==(count,count,0),(label,phase,data['total'],data['passed'],data['failed'])
  records[-1].update({'total':data['total'],'passed':data['passed'],'failed':data['failed']});print('checks',count,'all passed')
(OUT/'replay-summary.json').write_text(json.dumps(records,indent=2)+'\n')
