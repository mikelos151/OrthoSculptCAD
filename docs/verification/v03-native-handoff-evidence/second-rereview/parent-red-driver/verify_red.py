from pathlib import Path
import json,hashlib,shutil,subprocess
s=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch');repo=Path('C:/Users/sandr/OrthoSculptCAD');counts={};out=[]
items=[('spec','v03-native-handoff-teardown-spec-rereview','v03-native-handoff-integration-parent-red','014be0ec611f2c561a77cfd5b0988c5ef98d91c0aec3a1d7367e7c5f4473c66b',['boundary']),('quality','v03-native-handoff-teardown-quality-rereview','v03-native-handoff-b1-parent-red','4f3dd29dbc307548bb0650e4269714ea1ab38a998a29be067d1f3e3e165ee797',['repro','matrix'])]
for label,dirname,clone,expected,phases in items:
 base=s/dirname;m=json.loads((base/'artifact-manifest.json').read_text());assert hashlib.sha256((base/'artifact-manifest.json').read_bytes()).hexdigest()==expected
 entries=m.get('files',m.get('entries'));assert isinstance(entries,list)
 roots={k:Path(v)for k,v in m.get('roots',{'scratch':str(base)}).items()};assert all(v in [base,repo]for v in roots.values())
 for e in entries:
  p=roots[e.get('root','scratch')]/e['path'];raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==e['sha256'],(label,e['path'])
 counts[label]=len(entries);p=s/clone;assert not p.exists();shutil.copytree(base,p)
 if label=='spec':
  old=(p/'run.mjs').read_text();oldpath='C:/Users/sandr/AppData/Local/hermes/cache/scratch/'+dirname;assert old.count(oldpath)==1;(p/'run.mjs').write_text(old.replace(oldpath,'C:/Users/sandr/AppData/Local/hermes/cache/scratch/'+clone))
 cfg=json.loads((p/'tsconfig.json').read_text());cfg['compilerOptions']['outDir']=str(p/'compiled');(p/'tsconfig.json').write_text(json.dumps(cfg,indent=2)+'\n')
 c=subprocess.run(['node','--max-old-space-size=128','--max-semi-space-size=8',str(repo/'node_modules/typescript/bin/tsc'),'-p',str(p/'tsconfig.json')],capture_output=True,timeout=120);(p/'parent-compile.stdout.log').write_bytes(c.stdout);(p/'parent-compile.stderr.log').write_bytes(c.stderr);assert c.returncode==0,(label,c.stderr.decode('utf-8','replace'))
 for phase in phases:
  x=subprocess.run(['node',str(p/'run.mjs'),phase],capture_output=True,timeout=120);(p/('parent-'+phase+'.stdout.log')).write_bytes(x.stdout);(p/('parent-'+phase+'.stderr.log')).write_bytes(x.stderr);assert x.returncode==1,(label,phase,x.returncode);v=json.loads((p/(phase+'-results.json')).read_text());expected_counts={'boundary':(55,51,4),'repro':(20,18,2),'matrix':(124,106,18)}[phase];assert(v['total'],v['passed'],v['failed'])==expected_counts
  out.append({'kind':label,'phase':phase,'compileExit':c.returncode,'exit':x.returncode,'total':v['total'],'passed':v['passed'],'failed':v['failed'],'failureNames':[a['name']for a in v['results']if not a['passed']]})
(Path(__file__).parent/'parent-red-summary.json').write_text(json.dumps({'verifiedManifestEntries':counts,'replays':out},indent=2)+'\n');print(json.dumps({'verifiedManifestEntries':counts,'replays':[{k:v for k,v in row.items()if k!='failureNames'}for row in out]}))
