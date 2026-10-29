"""Verify replay and read-only scope; not production/API validation."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).parent
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
FIX = HERE.parent/'v03-source-admission-ledger-contract-fix'
sha = lambda b: hashlib.sha256(b).hexdigest()
start = json.loads((HERE/'review-input-verification.json').read_text(encoding='utf-8'))
now = {str(p.relative_to(ROOT)).replace('\\','/'): sha(p.read_bytes()) for d in ('src','tests','docs') for p in (ROOT/d).rglob('*') if p.is_file()}
assert start['repository_snapshot'] == now, 'repository src/tests/docs changed during rereview'
for name, expected in start['read_only_evidence_snapshot'].items():
    assert sha(Path(name).read_bytes()) == expected, name
results = json.loads((HERE/'witness-results.json').read_text(encoding='utf-8'))
assert results['kind'] == 'SPEC_MODEL_NOT_IMPLEMENTATION' and results['ok']
assert results['vector_count'] == len(results['results']) == len({v['name'] for v in results['results']}) == 33
assert results['projection_graphs'] == 729
assert (HERE/'witness-results.json').read_bytes() == (FIX/'witness-results.json').read_bytes()
assert 'resident-undo-refused-512' in (HERE/'negative-history-escape.log').read_text()
assert "'OK', 'BUDGET'" in (HERE/'negative-history-escape.log').read_text()
assert 'resident-undo-accepted-768' in (HERE/'negative-sum-refs.log').read_text()
assert "'BUDGET', 'OK'" in (HERE/'negative-sum-refs.log').read_text()
assert (HERE/'exit-codes.log').read_text().splitlines() == ['witness=0','negative-history-escape=1','negative-sum-refs=1','verify-artifacts=0']
head = (HERE/'git-head-end.txt').read_text().strip()
assert head == 'f288ffccb0d1eb2f2f901d9a03e1daa408b289db'
status = (HERE/'git-status-end.txt').read_text().splitlines()
expected_status = ['?? docs/plans/v03-source-admission-owner-design.md','?? docs/verification/v03-source-admission-design-evidence/','?? docs/verification/v03-source-admission-fixture-evidence/','?? docs/verification/v03-source-candidate-native-runtime-evidence/']
assert status == expected_status, status
report = dict(ok=True,repository_files_unchanged=len(now),read_only_evidence_files_unchanged=len(start['read_only_evidence_snapshot']),HEAD=head,git_status_unchanged=True,plan_sha256_start=start['plan_sha256'],plan_sha256_end=now['docs/plans/v03-source-admission-owner-design.md'],source_sha256=now['src/trimline/source-candidate.ts'],replay_results_byte_identical_to_fix=True,vector_count=results['vector_count'],projection_graphs=results['projection_graphs'],exit_codes=dict(witness=0,negative_history_escape=1,negative_sum_refs=1,verify_artifacts=0),artifact_hashes={p.name:sha(p.read_bytes()) for p in HERE.iterdir() if p.is_file() and p.name != 'final-verification.json'})
(HERE/'final-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'artifact_hashes'},indent=2))
