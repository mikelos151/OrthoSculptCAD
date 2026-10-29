"""Retain stdout, stderr, exact argv and exit status for each TDD run."""
import json
from pathlib import Path
import subprocess
import sys

root = Path('C:/Users/sandr/OrthoSculptCAD')
label = sys.argv[1]
command = [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests/reference', '-p', 'test_v03_source_candidate_oracle.py', '-v']
result = subprocess.run(command, cwd=root, text=True, capture_output=True)
record = {'command': command, 'cwd': str(root), 'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
Path(__file__).with_name(label + '.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record, indent=2))
sys.exit(result.returncode)
