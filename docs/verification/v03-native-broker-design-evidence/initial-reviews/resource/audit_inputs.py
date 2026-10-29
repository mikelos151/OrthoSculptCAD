"""Read-only input integrity checks; write evidence only to this owned scratch."""
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
OUT = pathlib.Path(__file__).parent
PROBE = OUT.parent / 'v03-native-broker-g1b-design'
EXPECTED = {
    'docs/plans/v03-native-broker-g1b-design.md': '6b9d5ead108a81f32daf24bca112f2d33300274fe31dfb78858000e80943c558',
    'docs/plans/v03-source-admission-owner-design.md': '800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce',
    'src/compute/resourceLedger.ts': 'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109',
    'tests/v03-resource-ledger.test.ts': '643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95',
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

phase = sys.argv[1]
assert phase in ('before', 'after')
files = []
for name, expected in EXPECTED.items():
    data = (ROOT / name).read_bytes()
    actual = digest(data)
    assert actual == expected, (name, actual, expected)
    files.append({'path': name, 'bytes': len(data), 'lines': len(data.splitlines()), 'sha256': actual})
manifest = json.loads((PROBE / 'sha256-manifest.json').read_text())
probe_files = []
for name in ('native-boundary-probe.mjs', 'native-probe-results.json', 'handoff.json'):
    actual = digest((PROBE / name).read_bytes())
    assert actual == manifest['scratchFiles'][name], name
    probe_files.append({'path': str(PROBE / name), 'sha256': actual})
probe = json.loads((PROBE / 'native-probe-results.json').read_text())
checks = [e for e in probe['result']['events'] if 'check' in e]
assert len(checks) == 12 and all(e['pass'] for e in checks)
assert not probe['errors'] and probe['sourceSHA256'] == EXPECTED['src/compute/resourceLedger.ts']
record = {'phase': phase, 'files': files, 'probe_files': probe_files, 'probe_recorded_checks': len(checks), 'probe_scope': 'Existing G1a boundary; reviewed as data, not replayed; no G1b acceptance', 'ok': True}
if phase == 'after':
    before = json.loads((OUT / 'inputs-before.json').read_text())
    assert before['files'] == files
    assert before['probe_files'] == probe_files
    record['before_after_identical'] = True
(OUT / ('inputs-' + phase + '.json')).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps(record, indent=2))
