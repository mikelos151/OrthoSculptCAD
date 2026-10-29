"""Run unedited copied tests and real CLIs sequentially; keep exact output."""
from pathlib import Path
import json
import os
import subprocess
import sys
from prepare import save
ROOT = Path(__file__).resolve().parent
ENV = {**os.environ, 'PYTHONDONTWRITEBYTECODE':'1'}

def run(name, args, expected):
    proc = subprocess.run([str(x) for x in args], cwd=ROOT, env=ENV, text=True, capture_output=True)
    record = {'name':name, 'cwd':str(ROOT), 'argv':[str(x) for x in args],
              'expectedExit':expected, 'exit':proc.returncode, 'stdout':proc.stdout, 'stderr':proc.stderr}
    save(ROOT/(name+'.command.json'),record)
    with (ROOT/(name+'.log')).open('x',encoding='utf8') as out:
        out.write('$ '+subprocess.list2cmdline(record['argv'])+'\n'+proc.stdout+proc.stderr+'\nexit='+str(proc.returncode)+'\n')
    print(json.dumps(record), flush=True)
    if proc.returncode != expected:
        raise AssertionError(name+': unexpected exit')
    return record

if __name__=='__main__':
    results=[]
    results.append(run('focused-tilted-regression', [sys.executable,'-B','-m','unittest','-v',
        'test_review_regression.IndependentAdversarialTests.test_same_face_bridge_must_reject_real_ts_tilted_original_F'],0))
    results.append(run('original-12-tests', [sys.executable,'-B','-m','unittest','-v','test_spike'],0))
    results.append(run('fixed-3-tests', [sys.executable,'-B','-m','unittest','-v','test_same_face_binding'],0))
    results.append(run('reviewer-4-tests', [sys.executable,'-B','-m','unittest','-v','test_review_regression'],0))
    results.append(run('fresh-curved', [sys.executable,'-B','spike.py','--curved'],0))
    results.append(run('fresh-straight', [sys.executable,'-B','spike.py'],0))
    results.append(run('negative-coarse', [sys.executable,'-B','spike.py','--curved','--bits','2'],1))
    results.append(run('negative-overspend', [sys.executable,'-B','spike.py','--delta','1/500'],1))
    results.append(run('negative-cap', [sys.executable,'-B','spike.py','--bits','257'],2))
    save(ROOT/'commands-and-results.json',results)
