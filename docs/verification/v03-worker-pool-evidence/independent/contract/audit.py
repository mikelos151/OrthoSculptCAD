"""Read-only source/input hashing; writes only this review scratch."""
import hashlib
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
FIX = pathlib.Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-contract-fix')
ORIGINAL = REPO / 'docs/verification/v03-native-broker-design-evidence/initial-plan.md'
PLAN = REPO / 'docs/plans/v03-native-broker-g1b-design.md'
EXPECTED_PLAN = '45cc11a03a92218670bff1fdf77d5fcd1c8f089a318044bdfe9269cecd1285a3'
EXPECTED_ORIGINAL = '6b9d5ead108a81f32daf24bca112f2d33300274fe31dfb78858000e80943c558'

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def sections(p):
    text = p.read_text(encoding='utf-8')
    chunks = re.split(r'(?m)(?=^## \d+\.)', text)
    return {re.match(r'## (\d+)\.', c).group(1): c for c in chunks if re.match(r'## (\d+)\.', c)}

def capture(phase):
    manifest = json.loads((FIX/'artifact-manifest.json').read_text(encoding='utf-8'))
    artifact_hashes = {}
    for name in manifest:
        p = FIX / name
        assert p.resolve().is_relative_to(FIX.resolve())
        artifact_hashes[name] = sha(p)
    mismatches = [name for name, digest in artifact_hashes.items() if digest != manifest[name]]
    tracked = json.loads((FIX/'before.json').read_text(encoding='utf-8'))['tracked_hashes']
    source_hashes = {name: sha(REPO/name) for name in tracked}
    changed = [name for name in tracked if tracked[name] != source_hashes[name]]
    before, after = sections(ORIGINAL), sections(PLAN)
    result = dict(phase=phase, plan_sha256=sha(PLAN), initial_plan_sha256=sha(ORIGINAL),
                  artifact_manifest_sha256=sha(FIX/'artifact-manifest.json'),
                  artifact_hashes=artifact_hashes, artifact_mismatches=mismatches,
                  source_hashes=source_hashes, source_count=len(source_hashes),
                  changed_from_fixer_before=changed,
                  protected_sections_unchanged={n: before[n] == after[n] for n in ['2','3','7','9']},
                  proposed_internal_interface_unchanged=before['4'].split('```ts',1)[1].split('```',1)[0] == after['4'].split('```ts',1)[1].split('```',1)[0],
                  original_review_sha256=sha(pathlib.Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-lifecycle-review/review.json')))
    (ROOT/f'{phase}-hashes.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    assert result['plan_sha256'] == EXPECTED_PLAN
    assert result['initial_plan_sha256'] == EXPECTED_ORIGINAL
    assert not mismatches, mismatches
    assert not changed, changed
    assert all(result['protected_sections_unchanged'].values())
    assert result['proposed_internal_interface_unchanged']
    if phase == 'before':
        replay = ROOT/'replay'
        replay.mkdir(exist_ok=True)
        for name in ['spec_cases.py','test_spec.py','spec_model.py']:
            shutil.copyfile(FIX/name, replay/name)
            assert sha(replay/name) == artifact_hashes[name]
    else:
        prior = json.loads((ROOT/'before-hashes.json').read_text(encoding='utf-8'))
        for field in ['plan_sha256','initial_plan_sha256','artifact_manifest_sha256','artifact_hashes','source_hashes','original_review_sha256']:
            assert result[field] == prior[field], field
        for name in ['spec_cases.py','test_spec.py','spec_model.py']:
            assert sha(ROOT/'replay'/name) == artifact_hashes[name]
    print(json.dumps({k:v for k,v in result.items() if k not in ['source_hashes','artifact_hashes']},indent=2))
    print(f'Validated {len(artifact_hashes)} completed artifact hashes and {len(source_hashes)} tracked file hashes; replay copies exact.')

if __name__ == '__main__':
    capture(sys.argv[1])
