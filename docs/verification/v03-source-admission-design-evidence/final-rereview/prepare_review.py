"""Read-only input verification; all writes confined to this reviewer scratch."""
from pathlib import Path
import hashlib
import json
import difflib

HERE = Path(__file__).parent
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
FIX = HERE.parent / 'v03-source-admission-ledger-contract-fix'
PLAN = 'docs/plans/v03-source-admission-owner-design.md'
sha = lambda b: hashlib.sha256(b).hexdigest()

manifest = json.loads((FIX/'artifact-verification.json').read_text(encoding='utf-8'))
artifact_checks = {}
for name, expected in manifest['artifact_hashes'].items():
    observed = sha((FIX/name).read_bytes())
    assert observed == expected, (name, observed, expected)
    artifact_checks[name] = observed
before = (FIX/'plan-before.md').read_bytes()
archived = (ROOT/'docs/verification/v03-source-admission-design-evidence/initial-plan.md').read_bytes()
after = (ROOT/PLAN).read_bytes()
assert before == archived
assert sha(before) == '1504d3ae9596fe6456b648972e7388a8d28c26dced926cf66be6e7c1088c23ea'
assert sha(after) == '800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce'
b, a = before.decode('utf-8').splitlines(keepends=True), after.decode('utf-8').splitlines(keepends=True)
patch = ''.join(difflib.unified_diff(b,a,fromfile='before/'+PLAN,tofile='after/'+PLAN))
assert patch.encode('utf-8') == (FIX/'targeted.patch').read_bytes()
hunks = [dict(kind=t, old=[i+1,j+1], new=[k+1,l+1]) for t,i,j,k,l in difflib.SequenceMatcher(None,b,a,autojunk=False).get_opcodes() if t != 'equal']
added = sum(h['new'][1]-h['new'][0] for h in hunks)
removed = sum(h['old'][1]-h['old'][0] for h in hunks)
assert (added, removed) == (62,5)
inputs = {str(p.relative_to(ROOT)).replace('\\','/'): sha(p.read_bytes()) for d in ('src','tests','docs') for p in (ROOT/d).rglob('*') if p.is_file()}
original = json.loads((FIX/'input-hashes-start.json').read_text(encoding='utf-8'))
changed = sorted(k for k in inputs.keys() | original.keys() if inputs.get(k) != original.get(k))
assert changed == [PLAN], changed
copies = {}
for name in ('contract_witness.py','verify_artifacts.py','plan-before.md','input-hashes-start.json'):
    data = (FIX/name).read_bytes()
    (HERE/name).write_bytes(data)
    assert sha((HERE/name).read_bytes()) == sha(data)
    copies[name] = sha(data)
for name in ('contract_witness.py','verify_artifacts.py'):
    compile((HERE/name).read_text(encoding='utf-8'),str(HERE/name),'exec')
all_read_inputs = {str(p): sha(p.read_bytes()) for folder in (FIX, HERE.parent/'v03-source-admission-budget-review', HERE.parent/'v03-source-admission-owner-review') for p in folder.iterdir() if p.is_file()}
record = dict(ok=True, plan_sha256=sha(after), plan_bytes=len(after), plan_lines=len(a), original_matches_archived=True, snapshot_files=len(inputs), changed_from_initial_fix_snapshot=changed, diff_hunks=hunks, added_lines=added, removed_lines=removed, artifact_checks=artifact_checks, byte_identical_replay_copies=copies, replay_output_directory=str(HERE), repository_snapshot=inputs, read_only_evidence_snapshot=all_read_inputs)
(HERE/'review-input-verification.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in record.items() if k not in ('repository_snapshot','read_only_evidence_snapshot','artifact_checks')},indent=2))
