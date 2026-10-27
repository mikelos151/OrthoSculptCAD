"""Collect REAL Python executions on mathematical fixtures, NOT TS output."""
import copy
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from unittest.mock import patch

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
REFERENCE = ROOT / 'tests/reference'
sys.path.insert(0, str(REFERENCE))
import v03_face_cubic_verify as verifier
import v03_bezier_verify as old
from test_v03_face_cubic_verify import mathematical_fixture, approximation_projection, rat


def write_new(name, value):
    path = OUT / name
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        if isinstance(value, str):
            stream.write(value)
        else:
            json.dump(value, stream, indent=2, ensure_ascii=True)
            stream.write('\n')
    return path


def run(command):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                            env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), timeout=60)
    return {'command': command, 'cwd': str(ROOT), 'PYTHONDONTWRITEBYTECODE': '1',
            'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}


original = mathematical_fixture()
original_path = write_new('synthetic-math-edge-linear-NOT-TS.json', original)
weight = copy.deepcopy(original)
weight['cases'][0]['containment']['barycentricControls'][1] = [rat(Fraction(1, 3)), rat(Fraction(2, 3)), rat(0)]
weight_path = write_new('synthetic-canonical-weight-mutant-NOT-TS.json', weight)
offplane = copy.deepcopy(original)
case = offplane['cases'][0]
points = list(case['containment']['controls']) + case['approximation']['leaves'][0]['controls']
points += [sample['point'] for sample in case['approximation']['samples']]
for point in points:
    point[2] = rat(Fraction(int(point[2]['n']), int(point[2]['d'])) + Fraction(1, 997))
offplane_path = write_new('synthetic-canonical-offplane-mutant-NOT-TS.json', offplane)

cli = []
for path, expected in [(original_path, 0), (weight_path, 1), (offplane_path, 1)]:
    result = run([sys.executable, str(REFERENCE / 'v03_face_cubic_verify.py'), '--input', str(path)])
    assert result['exit_code'] == expected, result
    cli.append(result)

negative_old_controls = {name: old.verify_bundle(approximation_projection(document))
                         for name, document in [('weight-mutant', weight), ('offplane-mutant', offplane)]}

observed_budgets = []
real_budget = verifier._InverseBudget
class ObservedBudget(real_budget):
    def __init__(self):
        super().__init__()
        observed_budgets.append(self)

with patch.object(verifier, '_InverseBudget', ObservedBudget):
    with patch.object(old, 'verify_bundle', wraps=old.verify_bundle) as observed_old:
        summary = verifier.verify_bundle(original)
        old_calls = observed_old.call_count
assert len(observed_budgets) == 1 and old_calls == 1
budget = observed_budgets[0]
counters = {name: getattr(budget, name) for name in ['operations', 'numeric_chars', 'limb_work']}

second = copy.deepcopy(original['cases'][0])
second['id'] = 'synthetic-second-not-TS'
combined = dict(original, cases=original['cases'] + [second])
combined_path = write_new('synthetic-two-cases-NOT-TS.json', combined)
with patch.object(verifier, 'MAX_OPERATIONS', budget.operations):
    assert verifier.verify_bundle(original)['passed'] is True
    assert verifier.verify_bundle(dict(original, cases=[second]))['passed'] is True
    try:
        verifier.verify_bundle(combined)
    except old.BudgetExceeded:
        combined_unknown = True
    else:
        raise AssertionError('shared inverse budget incorrectly reset')

for setup, path in [('v.MAX_OPERATIONS = 0', original_path),
                    ('v.bezier.MAX_OPERATIONS = 0', original_path),
                    ('v.MAX_OPERATIONS = ' + str(budget.operations), combined_path)]:
    code = ('import sys; sys.path.insert(0, ' + repr(str(REFERENCE)) + '); '
            'import v03_face_cubic_verify as v; ' + setup + '; '
            'sys.exit(v.main(["--input", ' + repr(str(path)) + ']))')
    result = run([sys.executable, '-c', code])
    assert result['exit_code'] == 2, result
    assert json.loads(result['stdout']) == {'passed': False, 'status': 'UNKNOWN',
                                           'error': 'verification budget exhausted'}
    cli.append(result)

focused = run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/reference',
               '-p', 'test_v03_face_cubic_verify.py', '-v'])
assert focused['exit_code'] == 0, focused
match = re.search(r'Ran (\d+) tests', focused['stderr'])
assert match
write_new('FINAL-focused-run.json', focused)
write_new('REAL-synthetic-cli-runs.json', cli)

read_paths = [REFERENCE / 'v03_face_cubic_verify.py', REFERENCE / 'test_v03_face_cubic_verify.py',
              REFERENCE / 'v03_bezier_verify.py', ROOT / 'tests/fixtures/v03-face-cubic-proof.schema.json',
              ROOT / 'docs/plans/v03-face-cubic-containment.md']
artifacts = sorted(p for p in OUT.iterdir() if p.is_file())
sha = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in read_paths + artifacts}
log_index = []
for path in sorted(OUT.glob('*.json')):
    if re.match(r'\d\d-', path.name):
        record = json.loads(path.read_text(encoding='utf-8'))
        log_index.append({'file': path.name, 'label': record['label'], 'exit_code': record['exit_code'],
                          'test_count': int(re.search(r'Ran (\d+) test', record['stderr']).group(1))})

head = run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
status = run(['git', '-C', str(ROOT), 'status', '--short'])
old_diff = run(['git', '-C', str(ROOT), 'diff', '--', 'tests/reference/v03_bezier_verify.py'])
assert old_diff['exit_code'] == 0 and old_diff['stdout'] == ''
counts = {'cases': len(original['cases']),
          'leaves': sum(len(case['approximation']['leaves']) for case in original['cases']),
          'samples': sum(len(case['approximation']['samples']) for case in original['cases'])}
assert summary == dict(passed=True, **counts)

handoff = {
    'scope': 'Implementer B only; independent Python inverse chart + bounded old public verifier composition',
    'provenance': 'ALL evidence fixtures are hand-derived synthetic mathematical certificates; NONE is TS output.',
    'producer_interop': 'NOT performed; parent must feed untouched real producer export after both authors finish.',
    'repo': str(ROOT), 'head': head['stdout'].strip(),
    'owned_files': [str(read_paths[0]), str(read_paths[1])],
    'focused_tests': {'passed': True, 'test_count': int(match.group(1)), 'log': 'FINAL-focused-run.json'},
    'synthetic_summary': summary, 'synthetic_counts': counts,
    'inverse_counters_one_synthetic_case': counters,
    'inverse_budget_instances_observed': len(observed_budgets),
    'old_real_public_verify_calls_observed': old_calls,
    'containment_negative_controls_old_projection': negative_old_controls,
    'two_individually_passing_cases_joint_inverse_unknown': combined_unknown,
    'cli_runs': cli, 'tdd_cycle_logs': log_index,
    'tdd_notes': ['First callable-namespace assertion RED is retained in 01-public-RED.json.',
                  'Each behavior was run before the next was added. Already-green negative/math/count tests are labeled COVERAGE, not fabricated RED.',
                  '02-schema-RED and 03-canonical-RED include expected missing-validation assertions plus genuine missing-validation exceptions, not typo/import failures.',
                  '28-structural-budget-GREEN-attempt1 failed because the earlier threshold probe omitted structural work; retained intact. Attempt2 observes the full real public path and exactly one inverse budget.'],
    'readonly_old_verifier_diff': old_diff,
    'git_status_observed': status,
    'sha256': sha,
    'remaining': ['Parent real six-case producer interop and canonical mutants on untouched producer export.',
                  'Parent fresh independent math/spec and quality/security review; later serial regressions.'],
    'limitations': ['Only one supplied closed triangle per case; no source binding, global CAD, clinical or release/exe claim.',
                    'Two algorithmic reference budgets do not guarantee process RSS or wall time.'],
}
write_new('handoff.json', handoff)
lines = [
    '# Implementer B handoff', '',
    '- Implemented only `tests/reference/v03_face_cubic_verify.py` and its unittest file.',
    '- Independent signed inverse chart: first XY/XZ/YZ nonzero minor, recovered simplex and exact unused-axis residual.',
    '- Strict literal new format and bounded file/JSON/rational/count validation; no aliases, coercion, epsilon or sampling proof.',
    '- Exactly one cumulative inverse budget and one unchanged real public old verifier invocation per bundle.',
    '- Focused result: ' + str(int(match.group(1))) + ' tests, exit0 (`FINAL-focused-run.json`).',
    '- Real CLI evidence on mathematical NOT-TS fixture: PASS exit0; canonical weight/off-plane mutants FAIL exit1; inverse/old/joint controlled exhaustion UNKNOWN exit2.',
    '- Synthetic counts: ' + json.dumps(counts) + '; actual inverse counters: ' + json.dumps(counters) + '.',
    '- Both canonical mutant approximation projections PASS the unchanged real M0c1 verifier.',
    '- Original RED/GREEN logs retained; already-green coverage labeled honestly. Failed GREEN attempt1 for structural threshold retained; fixed by observing the full public path.',
    '- SHA256 map, exact commands, every CLI stdout/exit and Git observations: `handoff.json`.',
    '- No new TS files or TS-author evidence read; no stage/commit/reset/stash, skills/config changes, browser or full Vitest/regression runs.',
    '- Remaining: parent untouched real producer export interoperability, fresh reviews and serial acceptance. No prediction of producer case/leaf counts.',
    '', '## Re-run', '',
    '```bash',
    'PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests/reference -p test_v03_face_cubic_verify.py -v',
    'python tests/reference/v03_face_cubic_verify.py --input ' + repr(str(original_path)),
    '```', '',
    'This is the M0c2 supplied-triangle foundation only, not full smooth-surface CAD, cut/shell/collar, clinical suitability or an exe release.',
]
write_new('HANDOFF.md', '\n'.join(lines) + '\n')
print(json.dumps({'focused_tests': int(match.group(1)), 'synthetic_summary': summary,
                  'inverse_counters': counters, 'cli_exit_codes': [entry['exit_code'] for entry in cli],
                  'log_count': len(log_index), 'handoff': str(OUT / 'handoff.json')}, indent=2))
