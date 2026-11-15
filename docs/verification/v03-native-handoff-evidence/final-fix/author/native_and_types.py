from pathlib import Path
import json,hashlib,subprocess,shutil,os
ROOT=Path('C:/Users/sandr/OrthoSculptCAD');OUT=Path(__file__).parent
records=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(name,cmd):
 p=subprocess.run(cmd,cwd=ROOT,capture_output=True,timeout=300,env=dict(os.environ,NODE_OPTIONS=''))
 (OUT/(name+'.stdout.log')).write_bytes(p.stdout);(OUT/(name+'.stderr.log')).write_bytes(p.stderr)
 row={'name':name,'command':cmd,'cwd':str(ROOT),'exit':p.returncode};records.append(row);(OUT/(name+'.command.json')).write_text(json.dumps(row,indent=2)+'\n')
 print(name,'exit',p.returncode,p.stdout.decode('utf8','replace')[-2500:]);assert p.returncode==0,(name,p.stderr.decode('utf8','replace')[-2500:])
run('full-tsc512',['node','--max-old-space-size=512','--max-semi-space-size=8',str(ROOT/'node_modules/typescript/bin/tsc'),'-p',str(ROOT/'tsconfig.json'),'--noEmit'])
proof={}
for label,source,files in [('native-pool','v03-worker-pool-core',['native-cli.mjs','fixture.mjs']),('native-handoff','v03-native-handoff-core',['native-cli.mjs','fixture-matrix.mjs','fixture-roundtrip.mjs'])]:
 src=OUT.parent/source;dest=OUT/label;dest.mkdir(exist_ok=False)
 for f in files:shutil.copyfile(src/f,dest/f)
 if label=='native-handoff':
  p=dest/'native-cli.mjs';text=p.read_text();assert text.count(src.as_posix())==1;p.write_text(text.replace(src.as_posix(),dest.as_posix()))
 proof[label]={'source':str(src),'files':{f:{'original':sha(src/f),'copy':sha(dest/f),'path_only_change':f=='native-cli.mjs'and label=='native-handoff'}for f in files}}
 for f in files:
  if f=='native-cli.mjs'and label=='native-handoff':assert (dest/f).read_text().replace(dest.as_posix(),src.as_posix())==(src/f).read_text()
  else:assert sha(src/f)==sha(dest/f)
run('native-pool',['node','--max-old-space-size=128','--max-semi-space-size=8',str(OUT/'native-pool/native-cli.mjs')])
pool=json.loads((OUT/'native-pool/native-results.json').read_text());assert pool['passed'];assert len(pool['result']['checks'])==119;assert all(c['pass']for c in pool['result']['checks']);assert all(pool['closed'].values())
run('native-handoff',['node','--max-old-space-size=128','--max-semi-space-size=8',str(OUT/'native-handoff/native-cli.mjs'),'candidate'])
handoff=json.loads((OUT/'native-handoff/phases/candidate/native-results.json').read_text());assert handoff['passed'];assert len(handoff['result']['checks'])==71;assert all(c['pass']for c in handoff['result']['checks']);assert all(handoff['closed'].values())
(OUT/'native-copy-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
summary={'commands':records,'serial':True,'pool':{'checks':len(pool['result']['checks']),'metrics':pool['result']['metrics'],'browser':pool['result']['browser'],'closed':pool['closed'],'hashes':pool['hashes']},'handoff':{'checks':len(handoff['result']['checks']),'metrics':handoff['result'].get('metrics'),'browser':handoff['result'].get('browserVersion'),'closed':handoff['closed'],'hashes':handoff['hashes']}}
(OUT/'native-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print('all native and full-tsc verified')
