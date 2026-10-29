import subprocess, pathlib, sys, json, hashlib
root=pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
out=pathlib.Path(__file__).parent
label=sys.argv[1]
mode=sys.argv[2] if len(sys.argv)>2 else 'focused'
files=['tests/v03-source-candidate.test.ts']
if mode=='related': files += ['tests/v03-face-cubic.test.ts','tests/v03-bezier.test.ts','tests/v03-numerics.test.ts','tests/v03-numerics-oracle.test.ts']
cmd=['C:/Program Files/nodejs/node.exe',str(root/'node_modules/typescript/bin/tsc'),'--noEmit'] if mode=='tsc' else ['C:/Program Files/nodejs/node.exe',str(root/'node_modules/vitest/vitest.mjs'),'run',*files,'--maxWorkers=1','--reporter=verbose']
import os
env=os.environ.copy()
for key in ['ORTHO_FACE_CUBIC_EVIDENCE_OUT','ORTHO_BEZIER_EVIDENCE_OUT']: env.pop(key,None)
for path in ['src/trimline/source-candidate.ts','tests/v03-source-candidate.test.ts']:
    if (root/path).exists():
        target=out/'snapshots'/label/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((root/path).read_bytes())
r=subprocess.run(cmd,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
text=r.stdout+r.stderr
(out/(label+'.log')).write_text(text,encoding='utf-8')
record={'label':label,'command':cmd,'exitCode':r.returncode,'files':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['src/trimline/source-candidate.ts','tests/v03-source-candidate.test.ts'] if (root/p).exists()}}
with (out/'runs.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(record)+'\n')
print(text); print(json.dumps(record))
sys.exit(r.returncode)
