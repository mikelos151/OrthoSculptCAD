"""Focused cycle runner. Logs are exclusive, including failed greens."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
label = sys.argv[1]
command = [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/reference',
           '-p', 'test_v03_face_cubic_verify.py', '-v']
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
record = {'label': label, 'command': command, 'cwd': str(ROOT),
          'PYTHONDONTWRITEBYTECODE': '1', 'exit_code': result.returncode,
          'stdout': result.stdout, 'stderr': result.stderr,
          'files': {name: hashlib.sha256((ROOT / 'tests/reference' / name).read_bytes()).hexdigest()
                    for name in ['v03_face_cubic_verify.py', 'test_v03_face_cubic_verify.py']}}
with (OUT / (label + '.json')).open('x', encoding='utf-8') as stream:
    json.dump(record, stream, indent=2)
print(label, 'exit', result.returncode, '\n', result.stdout, result.stderr[-3500:])
raise SystemExit(result.returncode)
