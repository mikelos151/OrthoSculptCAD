"""Keep actual independent-verifier red/green output outside the repository."""
import os
from pathlib import Path
import subprocess
import sys

scratch = Path(__file__).resolve().parent
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", TMPDIR=str(scratch), TEMP=str(scratch), TMP=str(scratch))
command = [sys.executable, "-m", "unittest", "discover", "-s", "tests/reference", "-p", "test_v03_bezier_verify.py", "-v"]
run = subprocess.run(command, cwd="C:/Users/sandr/OrthoSculptCAD", env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = "$ " + " ".join(command) + "\n" + run.stdout + "\nEXIT=" + str(run.returncode) + "\n"
(scratch / (sys.argv[1] + ".log")).write_text(output, encoding="utf-8")
print(output)
sys.exit(run.returncode)
