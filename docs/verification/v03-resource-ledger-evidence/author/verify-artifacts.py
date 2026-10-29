from pathlib import Path
import hashlib
import json
import re

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = json.loads((OUT / 'baseline.json').read_text())
changed = [name for name, digest in baseline.items() if sha(ROOT / name) != digest]
assert not changed, changed
owned = ['src/compute/resourceLedger.ts', 'tests/v03-resource-ledger.test.ts']
current = {p.relative_to(ROOT).as_posix() for folder in ['src', 'tests'] for p in (ROOT / folder).rglob('*') if p.is_file()}
assert current - set(baseline) == set(owned), current - set(baseline)
assert sha(ROOT / 'src/trimline/source-candidate.ts') == '983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b'
assert sha(ROOT / 'docs/plans/v03-source-admission-owner-design.md') == '800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce'
phases = []
for n in range(1, 15):
    red = f'{n:02d}-RED' if n != 12 else '12b-RED'
    green = f'{n:02d}-GREEN'
    assert (OUT / f'{red}.exit.txt').read_text().strip() == '1'
    assert (OUT / f'{green}.exit.txt').read_text().strip() == '0'
    for phase in [red, green]:
        for suffix in ['command.txt', 'log', 'exit.txt']:
            assert (OUT / f'{phase}.{suffix}').is_file()
        for name in ['resourceLedger.ts', 'v03-resource-ledger.test.ts']:
            assert (OUT / 'phases' / phase / name).is_file()
    phases.append({'behavior': n, 'red': red, 'red_exit': 1, 'green': green, 'green_exit': 0})
for phase in ['15-conformance', '16-related-regression', '17-final', 'tsc-final', 'tsc-emit', 'native-smoke']:
    assert (OUT / f'{phase}.exit.txt').read_text().strip() == '0'
smoke = json.loads((OUT / 'native-smoke.log').read_text().strip())
assert smoke['passed'] and smoke['nativeArrayBuffer'] and smoke['logicalTransferOnly']
final_log = (OUT / '17-final.log').read_text()
assert re.search(r'Tests\s+890 passed \(890\)', final_log)
assert re.search(r'Test Files\s+6 passed \(6\)', final_log)
source = (ROOT / owned[0]).read_text()
functions = re.findall(r'export (?:function|const) (\w+)', source)
types = re.findall(r'export (?:type|interface) (\w+)', source)
result = {
    'passed': True,
    'scope': 'G1a primitive implementation; pending parent replay and review; not source admission',
    'owned_repository_files': owned,
    'unchanged_existing_src_tests': len(baseline),
    'existing_src_tests_changed': changed,
    'repository_file_sha256': {name: sha(ROOT / name) for name in owned},
    'source_candidate_sha256_start_end': sha(ROOT / 'src/trimline/source-candidate.ts'),
    'plan_sha256_start_end': sha(ROOT / 'docs/plans/v03-source-admission-owner-design.md'),
    'functional_tdd_cycles': phases,
    'unexpected_green': {'phase': '12-RED', 'exit': 0, 'explanation': 'Sparse fixture also duplicated a key, so existing duplicate validation masked the hole. Strengthened fixture to distinct second key; real 12b-RED then failed with unclassified TypeError/partial-publication risk. No code changed between the two attempts.'},
    'compile_issue_fixed': {'log': 'tsc-01.log', 'exit': 2, 'issue': 'TS7053 after Array.isArray narrowed iteration input to any[]', 'fix': 'Typed PlanEntry callback and one field snapshot before validation', 'final_exit': 0},
    'final_ledger_tests': 16,
    'final_selected_regression_tests': 890,
    'final_selected_test_files': 6,
    'tsc_no_emit': 0,
    'tsc_standalone_emit': 0,
    'native_smoke': smoke,
    'runtime_exports': functions,
    'type_exports': types,
    'matrix_rows': {'1': ['03'], '2': ['05'], '3': ['04'], '4': ['04'], '5': ['07'], '6': ['02', 'conformance exact 1024'], '7': ['05', '08'], '8': ['05', '09'], '9': ['08', '09']},
    'not_run_or_claimed': ['full project 1208-test suite', 'Python oracle test suite', 'App integration', 'native Worker/transfer/postMessage/SHA/ACK/terminate', 'source admission/audited S', 'RSS/heap/JS overhead proof', 'clinical/native EXE acceptance'],
    'notes': ['Native ArrayBuffer tests ran in Node/V8, not browser.', 'Two later conformance tests characterize existing green implementation; not counted as new RED/GREEN cycles.', 'Realm cap is lifetime per ledger; lease/ref caps count active records. Caller-retained retired identities are authenticated weakly, without retained payloads.', 'Parent-curated untracked docs were not written by this task.']
}
(OUT / 'handoff.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'passed': True, 'unchanged_existing_src_tests': len(baseline), 'functional_cycles': len(phases), 'ledger_tests': 16, 'selected_regression_tests': 890, 'hashes': result['repository_file_sha256']}))
