import os, sys, subprocess
from pathlib import Path
root = Path('C:/Users/sandr/OrthoSculptCAD')
out = Path(__file__).parent / (sys.argv[1] + '.log')
command = ['node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/v03-face-cubic.test.ts', '--maxWorkers=1', *sys.argv[2:]]
result = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
with out.open('x', encoding='utf-8') as stream:
    stream.write('COMMAND: ' + subprocess.list2cmdline(command) + '\n' + result.stdout + '\nEXIT: ' + str(result.returncode) + '\n')
print(result.stdout)
print('EXIT:', result.returncode, 'LOG:', out)
sys.exit(result.returncode)
