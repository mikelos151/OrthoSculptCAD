"""Exercise actual TS evidence export and refusal paths; never read new Python verifier."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

repo = Path('C:/Users/sandr/OrthoSculptCAD')
scratch = Path(__file__).parent
command = ['node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/v03-face-cubic.test.ts', '--maxWorkers=1']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(label, output=None, focused=True, expected=0):
    env = os.environ.copy()
    env.pop('ORTHO_FACE_CUBIC_EVIDENCE_OUT', None)
    if output is not None:
        env['ORTHO_FACE_CUBIC_EVIDENCE_OUT'] = str(output)
    cmd = command + (['-t', 'exports untouched real face cubic proofs'] if focused else [])
    result = subprocess.run(cmd, cwd=repo, env=env, capture_output=True, encoding='utf-8', errors='replace')
    with (scratch / (label + '.log')).open('x', encoding='utf-8') as stream:
        stream.write('COMMAND: ' + subprocess.list2cmdline(cmd) + '\nORTHO_FACE_CUBIC_EVIDENCE_OUT=' + repr(output) + '\n')
        stream.write(result.stdout + result.stderr + '\nEXIT: ' + str(result.returncode) + '\n')
    print(label, 'exit', result.returncode)
    print(result.stdout + result.stderr)
    assert result.returncode == expected


# Final original file: exclusively created by the real TS producer.
proof = scratch / 'finalproof-delivery.json'
assert not proof.exists()
run('final-export', str(proof))
original_hash = sha(proof)
document = json.loads(proof.read_text(encoding='utf-8'))
counts = {'cases': len(document['cases']),
          'leaves': sum(len(c['approximation']['leaves']) for c in document['cases']),
          'samples': sum(len(c['approximation']['samples']) for c in document['cases'])}
assert document['format'] == 'OrthoSculptFaceCubicProof' and document['version'] == 1
assert [c['id'] for c in document['cases']] == ['nonaxis-curved', 'edge-linear', 'vertex-constant', 'xz-chart', 'yz-chart', 'thin-constant']
from jsonschema import Draft202012Validator
schema = json.loads((repo / 'tests/fixtures/v03-face-cubic-proof.schema.json').read_text(encoding='utf-8'))
Draft202012Validator(schema).validate(document)
print('SCHEMA: valid (shape only, not independent mathematical verification)')

# Refusal must not overwrite the actual proof, including after an existing file error.
run('export-exclusive-refusal', str(proof), expected=1)
assert sha(proof) == original_hash
relative = 'v03-face-cubic-must-not-write.json'
assert not (repo / relative).exists()
run('export-relative-refusal', relative, expected=1)
assert not (repo / relative).exists()
outside = repo / 'v03-face-cubic-must-not-write.json'
run('export-outside-refusal', str(outside), expected=1)
assert not outside.exists()

# With env absent, the focused suite writes neither proof files nor a default artifact.
# Snapshot BEFORE calling run; its own log is expected and excluded after return.
before = {p.name: sha(p) for p in scratch.iterdir() if p.is_file()}
repo_before = sorted(p.name for p in repo.iterdir())
run('final-default-focused', focused=False)
after = {p.name: sha(p) for p in scratch.iterdir() if p.is_file() and p.name != 'final-default-focused.log'}
assert before == after
assert repo_before == sorted(p.name for p in repo.iterdir())
assert sha(proof) == original_hash
summary = {'path': str(proof), 'sha256': original_hash, 'bytes': proof.stat().st_size, **counts,
           'per_case': [{'id': c['id'], 'leaves': len(c['approximation']['leaves']), 'samples': len(c['approximation']['samples'])} for c in document['cases']],
           'schema_valid': True, 'default_nondestructive': True, 'exclusive_refusal_preserved_bytes': True}
with (scratch / 'delivery-summary.json').open('x', encoding='utf-8') as stream:
    json.dump(summary, stream, indent=2)
print(json.dumps(summary, indent=2))
