"""Readonly review runner: all evidence and test temp files stay here."""
import os, pathlib, subprocess, sys, json, hashlib
ROOT=pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
OUT=pathlib.Path(__file__).resolve().parent
ENV=dict(os.environ, PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(OUT))
runs=[]
commands=[('typescript', ['node','node_modules/vitest/vitest.mjs','run','tests/v03-face-cubic.test.ts','--reporter=json','--outputFile='+str(OUT/'typescript-results.json')], dict(ENV,ORTHO_FACE_CUBIC_EVIDENCE_OUT=str(OUT/'untouched-real-ts.json'))),
('python', [sys.executable,'-m','unittest','discover','-s','tests/reference','-p','test_v03_face_cubic*.py','-v'], ENV),
('fresh-cli', [sys.executable,'tests/reference/v03_face_cubic_verify.py','--input',str(OUT/'untouched-real-ts.json')], ENV)]
for name, command, env in commands:
    result=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True,timeout=180)
    (OUT/(name+'.stdout.log')).write_text(result.stdout,encoding='utf-8')
    (OUT/(name+'.stderr.log')).write_text(result.stderr,encoding='utf-8')
    runs.append(dict(name=name,command=command,exit_code=result.returncode,stdout=result.stdout,stderr=result.stderr))
sourcefiles=['src/trimline/face-cubic.ts','tests/v03-face-cubic.test.ts','tests/reference/v03_face_cubic_verify.py','tests/reference/test_v03_face_cubic_verify.py','tests/reference/test_v03_face_cubic_interop.py','tests/fixtures/v03-face-cubic-proof-actual.json']
report={'runs':runs,'sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sourcefiles}}
if (OUT/'typescript-results.json').exists():
    ts=json.loads((OUT/'typescript-results.json').read_text(encoding='utf-8'))
    report['typescript']={k:ts[k] for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','success']}
if (OUT/'untouched-real-ts.json').exists():
    data=(OUT/'untouched-real-ts.json').read_bytes(); bundle=json.loads(data)
    report['producer']={'sha256':hashlib.sha256(data).hexdigest(),'cases':len(bundle['cases']),'leaves':sum(len(c['approximation']['leaves']) for c in bundle['cases']),'samples':sum(len(c['approximation']['samples']) for c in bundle['cases']),'matches_repo_fixture':data==(ROOT/'tests/fixtures/v03-face-cubic-proof-actual.json').read_bytes()}
(OUT/'focused-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
raise SystemExit(any(r['exit_code']!=0 for r in runs))
