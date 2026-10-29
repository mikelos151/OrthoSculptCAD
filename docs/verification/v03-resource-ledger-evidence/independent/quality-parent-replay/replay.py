"""Replay independent review in this scratch directory; repository remains read-only."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
EXPECTED = {
    'src/compute/resourceLedger.ts': '075773df84d918336203a90079562c8eab141798c763e2b2b3a6571ce2e90254',
    'tests/v03-resource-ledger.test.ts': '643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95',
    'docs/plans/v03-source-admission-owner-design.md': '800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce',
}


def hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in EXPECTED}


def run(name, args):
    process = subprocess.run(args, cwd=OUT, capture_output=True, text=True)
    record = {'command': args, 'cwd': str(OUT), 'exit_code': process.returncode,
              'stdout': process.stdout, 'stderr': process.stderr}
    (OUT / f'replay-{name}.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(json.dumps(record, indent=2))
    return process.returncode


before = hashes()
if before != EXPECTED:
    raise SystemExit('Input hash mismatch; review must not silently move to another candidate')
node = ['node', '--max-old-space-size=128', '--max-semi-space-size=8']
compile_exit = run('compile', node + [str(ROOT / 'node_modules/typescript/bin/tsc'), '--project', str(OUT / 'tsconfig.json')])
witness_exit = None
if compile_exit == 0:
    witness_exit = run('witness', node + [str(OUT / 'witness.cjs')])
after = hashes()
# Native Python cannot launch this packaged Git executable (observed WinError 5).
# Read the same local metadata without writing or running another environment.
gitdir = ROOT / '.git'
if gitdir.is_file():
    gitdir = (ROOT / gitdir.read_text().strip().removeprefix('gitdir: ')).resolve()
head = (gitdir / 'HEAD').read_text().strip()
if head.startswith('ref: '):
    refname = head.removeprefix('ref: ')
    refpath = gitdir / refname
    if refpath.exists():
        head = refpath.read_text().strip()
    else:
        head = next(line.split()[0] for line in (gitdir / 'packed-refs').read_text().splitlines()
                    if line and not line.startswith(('#', '^')) and line.split()[1] == refname)
verification = {'before': before, 'after': after, 'unchanged': before == after,
                'expected_match': after == EXPECTED, 'git_head_source': 'read-only git metadata; separate bash git verification also recorded',
                'git_head': head, 'compile_exit': compile_exit, 'witness_exit': witness_exit}
(OUT / 'replay-verification.json').write_text(json.dumps(verification, indent=2), encoding='utf-8')
print(json.dumps(verification, indent=2))
sys.exit(0 if compile_exit == 0 and witness_exit == 0 and before == after == EXPECTED and
         head == 'f288ffccb0d1eb2f2f901d9a03e1daa408b289db' else 1)
