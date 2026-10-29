from pathlib import Path
import json, hashlib, re, difflib
O=Path(__file__).parent
R=Path('C:/Users/sandr/OrthoSculptCAD')
A=O.parent/'v03-worker-pool-core'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
phases=[]
for d in sorted((A/'phases').iterdir()):
    if not d.is_dir(): continue
    cmd=json.loads((d/'command.json').read_text())
    text=(d/'output.log').read_text(encoding='utf-8')
    tests=(d/'v03-worker-pool.test.ts').read_text(encoding='utf-8')
    phases.append(dict(phase=d.name,command=cmd,summary=re.findall(r'^.*(?:Tests\s+|Test Files\s+|AssertionError:|TypeError:|Error:|FAIL\s).*$',text,re.M),test_names=re.findall(r"it\('([^']+)'",tests),hashes={n:sha(d/n) for n in ['command.json','output.log','workerPool.ts','v03-worker-pool.test.ts']}))
cycles=[]
for p in phases:
    if not p['phase'].endswith('-red'): continue
    n=p['phase'][:-4]; red=A/'phases'/p['phase']; green=A/'phases'/(n+'-green')
    gc=json.loads((green/'command.json').read_text())
    rt=(red/'v03-worker-pool.test.ts').read_bytes(); gt=(green/'v03-worker-pool.test.ts').read_bytes()
    source_diff=''.join(difflib.unified_diff((red/'workerPool.ts').read_text().splitlines(True),(green/'workerPool.ts').read_text().splitlines(True),fromfile=p['phase'],tofile=n+'-green'))
    (O/(n+'-source.diff')).write_text(source_diff,encoding='utf-8')
    cycles.append(dict(id=n,red_exit=p['command']['exit'],green_exit=gc['exit'],assertion_failure=any('AssertionError' in x for x in p['summary']),same_test_bytes=rt==gt,raw_log=str(red/'output.log'),source_diff=str(O/(n+'-source.diff'))))
assert len(cycles)==14 and all(c['red_exit']==1 and c['green_exit']==0 and c['same_test_bytes'] for c in cycles)
final=(A/'phases/final-green/v03-worker-pool.test.ts').read_bytes()
assert final==(R/'tests/v03-worker-pool.test.ts').read_bytes()
assert sha(A/'phases/final-green/workerPool.ts')==sha(R/'src/compute/workerPool.ts')
assert len(re.findall(rb"\bit\('",final))==24
assert len(re.findall(r"\bit\('",(R/'tests/v03-resource-ledger.test.ts').read_text()))==16
native=json.loads((A/'native-results.json').read_text())
checks=native['result']['checks']; events=native['workerEvents']
created=[x for x in events if x['type']=='created']; closed=[x for x in events if x['type']=='close-notification']
assert len(checks)==119 and all(x['pass'] for x in checks)
assert len(created)==49 and len(closed)==49 and sorted(x['id'] for x in created)==sorted(x['id'] for x in closed)
assert all(native['closed'].values()) and native['pageErrors']==[] and native['externalRequests']==[]
verified_hashes={}
for f,h in native['hashes']['source'].items():
    assert sha(R/f)==h
    verified_hashes[f]=h
for f,h in native['hashes']['served'].items():
    p=A/('fixture.mjs' if f=='fixture.mjs' else 'served/'+f)
    assert sha(p)==h
    verified_hashes[str(p)]=h
out=dict(phases=phases,cycles=cycles,cycles_count=len(cycles),final_tests=dict(G1a=16,pool=24,total=40,raw_log=str(A/'phases/final-green/output.log')),native_existing_observations=dict(not_reexecuted=True,checks=len(checks),created=len(created),close_notifications=len(closed),metrics=native['result']['metrics'],closed=native['closed'],verified_hashes=verified_hashes),limitations=['Author evidence inspected as data, not executed.','Immediate GREEN is existing coverage, not TDD RED.','Native observations apply only to isolated pool, never the global App cap.'])
(O/'evidence-audit.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(cycles=cycles,phase_count=len(phases),final_tests=out['final_tests'],native=out['native_existing_observations']),indent=2))
