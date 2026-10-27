"""Finish handoff from retained REAL execution logs; no evidence replacement."""
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
from unittest.mock import patch

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
REFERENCE = ROOT / 'tests/reference'
sys.path.insert(0, str(REFERENCE))
import v03_face_cubic_verify as verifier
import v03_bezier_verify as old
from test_v03_face_cubic_verify import approximation_projection


def read_json(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))


def write_new(name, value):
    with (OUT / name).open('x', encoding='utf-8', newline='\n') as stream:
        if isinstance(value, str):
            stream.write(value)
        else:
            json.dump(value, stream, indent=2)
            stream.write('\n')


focused = read_json('FINAL-focused-run.json')
assert focused['exit_code'] == 0
count = int(re.search(r'Ran (\d+) tests', focused['stderr']).group(1))
cli = read_json('REAL-synthetic-cli-runs.json')
assert [entry['exit_code'] for entry in cli] == [0, 1, 1, 2, 2, 2]
original = read_json('synthetic-math-edge-linear-NOT-TS.json')
weight = read_json('synthetic-canonical-weight-mutant-NOT-TS.json')
offplane = read_json('synthetic-canonical-offplane-mutant-NOT-TS.json')
combined = read_json('synthetic-two-cases-NOT-TS.json')
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
negative_old_controls = {name: old.verify_bundle(approximation_projection(document))
                         for name, document in [('weight-mutant', weight), ('offplane-mutant', offplane)]}
counts = {'cases': len(original['cases']),
          'leaves': sum(len(case['approximation']['leaves']) for case in original['cases']),
          'samples': sum(len(case['approximation']['samples']) for case in original['cases'])}
assert summary == dict(passed=True, **counts)
with patch.object(verifier, 'MAX_OPERATIONS', budget.operations):
    assert verifier.verify_bundle(original)['passed'] is True
    assert verifier.verify_bundle(dict(original, cases=[combined['cases'][1]]))['passed'] is True
    try:
        verifier.verify_bundle(combined)
    except old.BudgetExceeded:
        pass
    else:
        raise AssertionError('shared inverse budget incorrectly reset')

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
git = read_json('git-observations.json')
assert git['exit_code'] == 0 and git['old_verifier_diff_empty'] and git['cached_diff_names_empty']
head = git['stdout'].splitlines()[-1]

handoff = {
    'scope': 'Implementer B: independent Python inverse chart + bounded unchanged public M0c1 composition only',
    'provenance': 'ALL fixtures are hand-derived synthetic mathematical certificates; NONE is TS output.',
    'producer_interop': 'NOT performed; parent must feed untouched real producer export after both authors finish.',
    'repo': str(ROOT), 'head': head,
    'owned_files': [str(read_paths[0]), str(read_paths[1])],
    'focused_tests': {'passed': True, 'test_count': count, 'log': 'FINAL-focused-run.json'},
    'synthetic_summary': summary, 'synthetic_counts': counts,
    'inverse_counters_one_synthetic_case': counters,
    'inverse_budget_instances_observed': len(observed_budgets),
    'old_real_public_verify_calls_observed': old_calls,
    'containment_negative_controls_old_projection': negative_old_controls,
    'two_individually_passing_cases_joint_inverse_unknown': True,
    'cli_runs': cli, 'tdd_cycle_logs': log_index,
    'tdd_notes': ['First callable-namespace assertion RED retained in 01-public-RED.json.',
                  'One behavior was added and run before the next. Already-green math/negative/count coverage is labeled COVERAGE, not fabricated RED.',
                  '02-schema-RED and 03-canonical-RED include missing-validation assertions plus genuine missing-validation exceptions, not typo/import failures.',
                  '28-structural-budget-GREEN-attempt1 failed: earlier threshold probe omitted structural work; retained intact. Attempt2 observes the full real public path and exactly one inverse budget.'],
    'issues': ['Initial evidence collector completed real CLI/focused runs but native subprocess Git execution failed with WindowsApps PermissionError. Original logs retained; real Bash terminal Git observations used by finish_handoff.py.'],
    'git_observations': git, 'sha256': sha,
    'remaining': ['Parent untouched real producer export interoperability, canonical weight/off-plane mutants on that export.',
                  'Parent fresh independent math/spec and quality/security review; later serial regressions.'],
    'limitations': ['Supplied closed triangle only: no source identity, global CAD, clinical or release/exe claim.',
                    'Two algorithmic reference budgets are not process RSS or wall-time guarantees.'],
}
write_new('handoff.json', handoff)
lines = [
    '# Implementer B handoff', '',
    '- Implemented only `tests/reference/v03_face_cubic_verify.py` and its unittest file.',
    '- Independent signed inverse chart: first XY/XZ/YZ nonzero minor, recovered simplex, exact unused-axis residual; whole-cubic hull proof, not point sampling.',
    '- Strict literal new format and bounded file/JSON/rational/count validation; no aliases, coercion or epsilon.',
    '- Exactly one cumulative inverse budget and one unchanged real public old verifier call per bundle.',
    '- Focused result: ' + str(count) + ' tests, exit0 (`FINAL-focused-run.json`).',
    '- Real CLI on mathematical NOT-TS fixture: PASS exit0; canonical weight/off-plane mutants FAIL exit1; inverse/old/joint controlled exhaustion UNKNOWN exit2.',
    '- Synthetic counts: ' + json.dumps(counts) + '; actual inverse counters: ' + json.dumps(counters) + '.',
    '- Both canonical mutant approximation projections PASS the unchanged real M0c1 verifier.',
    '- Original RED/GREEN logs retained; already-green coverage labeled honestly. Failed structural GREEN attempt1 retained; final threshold observes the full public path.',
    '- SHA256 map, exact commands, all CLI stdout/exit and actual terminal Git observations: `handoff.json`.',
    '- Collector issue: native Python subprocess Git PermissionError after CLI/focused evidence saved; retained and recovered through real terminal Git observations, without fabricated output.',
    '- No new TS or TS-author evidence read; no stage/commit/reset/stash, skills/config edits, browser/full Vitest/regression runs.',
    '- Remaining: parent untouched real producer export interoperability, fresh reviews and serial acceptance. No prediction of producer case/leaf counts.',
    '', '## Re-run', '', '```bash',
    'PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests/reference -p test_v03_face_cubic_verify.py -v',
    'python tests/reference/v03_face_cubic_verify.py --input ' + repr(str(OUT / 'synthetic-math-edge-linear-NOT-TS.json')),
    '```', '',
    'M0c2 supplied-triangle foundation only, not full smooth-surface CAD, cut/shell/collar, clinical suitability or exe release.',
]
write_new('HANDOFF.md', '\n'.join(lines) + '\n')
print(json.dumps({'focused_tests': count, 'synthetic_summary': summary,
                  'inverse_counters': counters, 'cli_exit_codes': [entry['exit_code'] for entry in cli],
                  'log_count': len(log_index), 'handoff': str(OUT / 'handoff.json'),
                  'owned_sha256': {str(path): sha[str(path)] for path in read_paths[:2]}}, indent=2))
