from pathlib import Path
import json,hashlib,shutil,subprocess,os
r=Path('C:/Users/sandr/OrthoSculptCAD');s=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch');out=Path(__file__).parent;checks=[]
def run(label,args,cwd):
 x=subprocess.run(args,cwd=cwd,capture_output=True,timeout=180,env=dict(os.environ,NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8'));(out/(label+'.stdout.log')).write_bytes(x.stdout);(out/(label+'.stderr.log')).write_bytes(x.stderr);checks.append({'label':label,'command':args,'exit':x.returncode});(out/'replay-commands.json').write_text(json.dumps(checks,indent=2)+'\n');assert x.returncode==0,(label,x.returncode,x.stderr.decode('utf-8','replace'));return x
for kind,src,phases in [('spec','v03-native-handoff-teardown-spec-rereview',[('boundary',55)]),('quality','v03-native-handoff-teardown-quality-rereview',[('witness',87),('repro',20),('matrix',124)])]:
 base=s/src;p=out/'replay'/kind;assert not p.exists();p.mkdir(parents=True)
 for n in ['run.mjs','loader.mjs','package.json','tsconfig.json']+[('witness.mjs'if phase=='witness'else phase+'.mjs')for phase,_ in phases]:shutil.copyfile(base/n,p/n)
 if kind=='spec':
  original=(p/'run.mjs').read_text();needle='C:/Users/sandr/AppData/Local/hermes/cache/scratch/'+src;assert original.count(needle)==1;(p/'run.mjs').write_text(original.replace(needle,p.as_posix()))
 cfg=json.loads((p/'tsconfig.json').read_text());cfg['compilerOptions']['outDir']=str(p/'compiled');(p/'tsconfig.json').write_text(json.dumps(cfg,indent=2)+'\n');run(kind+'-compile',['node','--max-old-space-size=128','--max-semi-space-size=8',str(r/'node_modules/typescript/bin/tsc'),'-p',str(p/'tsconfig.json')],p)
 for phase,count in phases:
  name='witness.mjs'if phase=='witness'else phase+'.mjs';assert(p/name).read_bytes()==(base/name).read_bytes();run(kind+'-'+phase,['node',str(p/'run.mjs'),phase],p);v=json.loads((p/(phase+'-results.json')).read_text());assert(v['total'],v['passed'],v['failed'])==(count,count,0)
a=s/'v03-native-handoff-integration-fix';h=json.loads((a/'handoff.json').read_text());native=[]
for kind in ['pool','handoff']:
 base=a/('native-'+kind);p=out/('native-'+kind);assert not p.exists();p.mkdir()
 names=['native-cli.mjs','fixture.mjs']if kind=='pool'else['native-cli.mjs','fixture-matrix.mjs','fixture-roundtrip.mjs']
 for n in names:shutil.copyfile(base/n,p/n)
 phase='final-parent'
 if kind=='handoff':
  original=(p/'native-cli.mjs').read_text();needle="dir='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix/native-handoff'";assert original.count(needle)==1;(p/'native-cli.mjs').write_text(original.replace(needle,"dir='"+p.as_posix()+"'"))
 run('native-'+kind,['node',str(p/'native-cli.mjs')]+([phase]if kind=='handoff'else[]),p)
 v=json.loads((p/('native-results.json'if kind=='pool'else'phases/'+phase+'/native-results.json')).read_text());assert v['passed']and all(v['closed'].values());assert all(x['pass']for x in v['result']['checks']);expected=119 if kind=='pool' else 71;assert len(v['result']['checks'])==expected;assert v['hashes']==h['verification']['native'][kind]['hashes'];assert not v.get('pageErrors',v.get('errors',[]))and not v.get('externalRequests',v.get('external',[]));native.append({'kind':kind,'checks':expected,'metrics':v['result']['metrics'],'closed':v['closed'],'sourceAndServedHashesMatchAuthor':True})
u=json.loads((out/'parent-results.json').read_text());assert u['unit']['numTotalTests']==u['unit']['numPassedTests']==u['unitExpectedTotal']==1414;assert u['unit']['numFailedTests']==u['unit']['numPendingTests']==0 and u['pythonTests']==71;assert all(u[k]==0 for k in ['unitExit','typecheckExit','pythonExit','npmAuditExit']);result={'fullNode':1414,'python':71,'UNITWitnesses':{'original':87,'boundary':55,'minimalB1':20,'matrixB1':124},'native':native,'commands':checks,'reviews':'Final independent reviewers pending; no acceptance/commit'};(out/'replay-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='commands'}))
