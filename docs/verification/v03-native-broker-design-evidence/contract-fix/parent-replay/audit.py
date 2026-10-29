"""Read-only repository provenance; writes only this owned scratch directory."""
import hashlib, json, pathlib, subprocess, sys
ROOT = pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
OUT = pathlib.Path(__file__).parent
PLAN = 'docs/plans/v03-native-broker-g1b-design.md'
def run(*args):
    key = {('rev-parse','HEAD'): 'head', ('branch','--show-current'): 'branch', ('status','--short'): 'status', ('ls-files','-z'): 'tracked', ('diff','--exit-code'): 'diff', ('diff','--cached','--exit-code'): 'index_diff'}[args]
    prefix = OUT/f'{phase}-{key}'
    return {'command': ['git', '-C', str(ROOT), *args], 'exit_code': int(prefix.with_suffix('.exit').read_text()), 'stdout': prefix.with_suffix('.stdout').read_bytes().decode('utf-8'), 'stderr': prefix.with_suffix('.stderr').read_bytes().decode('utf-8')}
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
phase = sys.argv[1]
commands = {key: run(*args) for key,args in {
    'head': ('rev-parse','HEAD'), 'branch': ('branch','--show-current'),
    'status': ('status','--short'), 'tracked': ('ls-files','-z'),
    'diff': ('diff','--exit-code'), 'index_diff': ('diff','--cached','--exit-code')}.items()}
assert all(v['exit_code'] == 0 for v in commands.values()), commands
tracked = commands['tracked']['stdout'].split('\0')[:-1]
result = {'phase': phase, 'commands': commands, 'tracked_hashes': {p: sha(ROOT/p) for p in tracked}, 'plan_sha256': sha(ROOT/PLAN), 'initial_snapshot_sha256': sha(ROOT/'docs/verification/v03-native-broker-design-evidence/initial-plan.md')}
assert result['tracked_hashes']['src/compute/resourceLedger.ts'] == 'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109'
if phase == 'before':
    assert result['plan_sha256'] == '6b9d5ead108a81f32daf24bca112f2d33300274fe31dfb78858000e80943c558'
    (OUT/'plan-before.md').write_bytes((ROOT/PLAN).read_bytes())
else:
    before = json.loads((OUT/'before.json').read_text())
    assert result['tracked_hashes'] == before['tracked_hashes'], 'Tracked bytes changed'
    assert result['commands']['head']['stdout'] == before['commands']['head']['stdout']
    assert result['initial_snapshot_sha256'] == before['initial_snapshot_sha256']
(OUT/f'{phase}.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'phase': phase, 'tracked_count': len(tracked), 'plan_sha256': result['plan_sha256'], 'head': commands['head']['stdout'].strip(), 'branch': commands['branch']['stdout'].strip(), 'status': commands['status']['stdout'], 'tracked_diff_exit': commands['diff']['exit_code'], 'index_diff_exit': commands['index_diff']['exit_code']}, indent=2))
