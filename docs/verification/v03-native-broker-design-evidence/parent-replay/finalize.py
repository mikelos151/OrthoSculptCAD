from pathlib import Path
import hashlib
import json

root = Path('C:/Users/sandr/OrthoSculptCAD')
scratch = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design')
plan = root / 'docs/plans/v03-native-broker-g1b-design.md'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
start = json.loads((scratch / 'source-start.json').read_text())
end = json.loads((scratch / 'source-end.json').read_text())
validation = json.loads((scratch / 'design-validation.json').read_text())
probe = json.loads((scratch / 'native-probe-results.json').read_text())
assert start['sha256'] == end['sha256']
assert start['head'] == end['head'] == '2a586bd3abe3c801e7fe23764fecc77b8c770b50'
assert end['status'].strip() == '?? docs/plans/v03-native-broker-g1b-design.md'
assert validation['planSHA256'] == sha(plan)
assert all(item['ok'] for item in validation['checks'])
assert probe['status'] == 'EXISTING_BOUNDARY_CONFIRMED' and not probe['errors']
assert probe['browserClosed'] is True
handoff = {
    'status': 'DESIGN_DRAFT_COMPLETE_PARENT_INDEPENDENT_REVIEW_REQUIRED_BEFORE_CODE',
    'plan': str(plan),
    'planSHA256': sha(plan),
    'planLines': len(plan.read_text(encoding='utf-8').splitlines()),
    'head': end['head'],
    'trackedFilesCompared': len(end['sha256']),
    'trackedSourcesUnchanged': True,
    'repositoryStatus': end['status'],
    'scope': 'New plan + dedicated scratch only; no implementation/staging/commit or dependency/config/profile/skill/release changes',
    'nativeProbe': {
        'command': 'node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design/native-boundary-probe.mjs',
        'exitCode': 0,
        'checks': validation['nativeProbeChecks'],
        'browser': probe['browserVersion'],
        'resultSHA256': sha(scratch / 'native-probe-results.json'),
        'scope': 'Observed existing accepted G1a logical/native boundary only; no invented native responses; terminate invocation is not physical-thread completion',
    },
    'designValidation': {
        'command': 'node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design/verify-design.mjs',
        'exitCode': 0,
        'status': validation['status'],
        'scope': validation['scope'],
    },
    'beforeCodeGate': 'Parent independent design review of final hash, not yet performed here',
    'notAccepted': validation['unaccepted'],
    'issues': ['Initial Python subprocess git: WinError 5/exit 1; recovered via direct shell git and file-based hashing.'],
}
(scratch / 'handoff.json').write_text(json.dumps(handoff, indent=2) + '\n', encoding='utf-8')
paths = sorted(p for p in scratch.iterdir() if p.is_file() and p.name != 'sha256-manifest.json')
manifest = {'scope': 'Scratch files except this manifest, plus final plan', 'plan': {'path': str(plan), 'sha256': sha(plan)}, 'scratchFiles': {p.name: sha(p) for p in paths}, 'scratchFileCount': len(paths)}
(scratch / 'sha256-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'planSHA256': handoff['planSHA256'], 'lines': handoff['planLines'], 'trackedUnchanged': handoff['trackedFilesCompared'], 'nativeChecks': handoff['nativeProbe']['checks'], 'scratchManifestFiles': len(paths), 'handoff': str(scratch / 'handoff.json')}, indent=2))
