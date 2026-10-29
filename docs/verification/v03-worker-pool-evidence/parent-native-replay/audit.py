from pathlib import Path
import hashlib, json, re
root = Path('C:/Users/sandr/OrthoSculptCAD')
scratch = Path(__file__).parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
start = json.loads((scratch / 'source-start.json').read_text())
end = {name: sha(root / name) if (root / name).is_file() else None for name in start}
changed = [name for name in start if start[name] != end[name]]
new = {name: sha(root / name) for name in ['src/compute/workerPool.ts', 'tests/v03-worker-pool.test.ts']}
phases = []
for d in sorted((scratch / 'phases').iterdir()):
    command = json.loads((d / 'command.json').read_text())
    phases.append({'phase': d.name, **command, 'source_sha256': sha(d / 'workerPool.ts'), 'tests_sha256': sha(d / 'v03-worker-pool.test.ts')})
reds = [p for p in phases if p['phase'].endswith('-red')]
greens = [p for p in phases if p['phase'].endswith('-green')]
assert all(p['exit'] == 1 for p in reds)
assert all(p['exit'] == 0 for p in greens)
assert len(reds) == len([p for p in greens if p['phase'] != 'final-green'])
native = json.loads((scratch / 'native-results.json').read_text())
commands = json.loads((scratch / 'final-commands.json').read_text())
assert all(p['exit'] == 0 for p in commands)
assert native['passed'] and all(c['pass'] for c in native['result']['checks'])
assert not changed
assert native['hashes']['source']['src/compute/workerPool.ts'] == new['src/compute/workerPool.ts']
assert native['hashes']['source']['src/compute/resourceLedger.ts'] == start['src/compute/resourceLedger.ts']
assert start['src/compute/resourceLedger.ts'] == 'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109'
assert start['tests/v03-resource-ledger.test.ts'] == '643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95'
scan = {}
for name in new:
    text = (root / name).read_text()
    scan[name] = { 'secrets': bool(re.search(r'(?:api_key|password|secret)\s*=\s*[\"\'][^\"\']{6,}', text, re.I)), 'eval_or_exec': bool(re.search(r'\b(?:eval|exec)\s*\(', text)), 'network_or_process_api': bool(re.search(r'\b(?:fetch|XMLHttpRequest|spawn|execSync)\s*\(', text)) }
assert not any(v for values in scan.values() for v in values.values())
audit = {'protected_file_count': len(start), 'changed_protected_files': changed, 'source_end': end, 'new_file_hashes': new, 'phases': phases, 'red_green_cycles': len(reds), 'static_scan': scan}
(scratch / 'source-end.json').write_text(json.dumps(audit, indent=2))
print(json.dumps({k:v for k,v in audit.items() if k not in ['source_end','phases']}, indent=2))
print('native_checks', len(native['result']['checks']), 'all_pass', all(c['pass'] for c in native['result']['checks']))
