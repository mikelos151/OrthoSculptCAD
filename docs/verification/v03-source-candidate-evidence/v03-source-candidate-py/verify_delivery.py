"""Read only owned outputs and frozen contract; retain delivery evidence."""
import hashlib
import json
from pathlib import Path
import re

root = Path('C:/Users/sandr/OrthoSculptCAD')
scratch = Path(__file__).parent
owned = ['tests/reference/v03_source_candidate_oracle.py',
         'tests/reference/test_v03_source_candidate_oracle.py',
         'tests/fixtures/v03-source-candidate-oracle.json']
files = {name: {'bytes': len((root / name).read_bytes()),
                'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
         for name in owned}
fixture = json.loads((root / owned[2]).read_bytes())
cases = fixture['cases']
assert len(cases) == 31
assert len({c['id'] for c in cases}) == 31
faces = sum(c['expected']['faceCount'] for c in cases)
assert faces == 121
assert faces == sum(len(c['expected']['faces']) for c in cases)
assert all(c['id'].startswith('TESTDATA-') for c in cases)
assert all(re.fullmatch('sha256:[0-9a-f]{64}', c['expected']['sourceDigest']) for c in cases)
plan = root / 'docs/plans/v03-source-bound-spans-design.md'
plan_hash = hashlib.sha256(plan.read_bytes()).hexdigest()
assert plan_hash == 'c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf'
tracers = ['f32', 'canonical', 'optional', 'validation', 'faces', 'fixture', 'cli']
tdd = []
for i, tracer in enumerate(tracers, 1):
    pair = {}
    for state, expected_exit in [('red', 1), ('green', 0)]:
        name = f'{i:02d}-{state}-{tracer}.json'
        log = json.loads((scratch / name).read_text(encoding='utf-8'))
        assert log['exit_code'] == expected_exit
        assert '\nERROR:' not in log['stderr']
        pair[state] = name
    tdd.append({'tracer': tracer, **pair})
final_log = json.loads((scratch / '09-final-tests.json').read_text(encoding='utf-8'))
assert final_log['exit_code'] == 0
count = int(re.search(r'Ran (\d+) test', final_log['stderr'])[1])
assert count == 7
record = {
    'scope': 'Independent synthetic test-oracle expected values only; no runtime authority, audit admission, reload proof or clinical acceptance.',
    'files': files, 'caseCount': len(cases), 'faceCount': faces,
    'uniqueSourceDigests': len({c['expected']['sourceDigest'] for c in cases}),
    'reviewedPlanSha256': plan_hash,
    'contractSha256': hashlib.sha256((root / 'docs/plans/v03-source-candidate-oracle-contract.md').read_bytes()).hexdigest(),
    'generatorCommand': 'python -B tests/reference/v03_source_candidate_oracle.py --output tests/fixtures/v03-source-candidate-oracle.json',
    'generatorSummary': json.loads((scratch / 'generate-fixture.log').read_text(encoding='utf-8')),
    'testCommand': 'python -B -m unittest discover -s tests/reference -p test_v03_source_candidate_oracle.py -v',
    'testCount': count, 'testExitCode': final_log['exit_code'],
    'finalTestLog': '09-final-tests.json', 'verticalTdd': tdd,
}
assert record['generatorSummary']['sha256'] == files[owned[2]]['sha256']
(scratch / 'delivery-evidence.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps(record, indent=2))
