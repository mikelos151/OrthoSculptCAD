"""Verify review evidence and hash every owned artifact, excluding the manifest itself."""
import hashlib
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parent
review=json.loads((ROOT/'review.json').read_text(encoding='utf-8'))
before=json.loads((ROOT/'before-hashes.json').read_text(encoding='utf-8'))
after=json.loads((ROOT/'after-hashes.json').read_text(encoding='utf-8'))
results=json.loads((ROOT/'replay/spec-results.json').read_text(encoding='utf-8'))
independent=json.loads((ROOT/'independent-results.json').read_text(encoding='utf-8'))
assert review['passed'] and not review['security_concerns'] and not review['logic_errors']
assert results['tests_run']==42 and results['classification_cases']==36 and results['deadline_tests']==6
assert results['failures']==results['errors']==0 and results['successful']
assert independent['checks_passed']==len(independent['checks'])==19
assert (ROOT/'head-end.stdout').read_text().strip()==review['scope']['head_end']
assert not (ROOT/'tracked-diff.stdout').read_bytes()
for name in ['audit-before','audit-after','spec-cases','bootstrap','independent-checks','head-end','tracked-diff']:
    assert (ROOT/f'{name}.exit').read_text().strip()=='0',name
assert (ROOT/'independent-checks-first-failure.exit').read_text().strip()=='1'
for key in ['plan_sha256','initial_plan_sha256','artifact_manifest_sha256','artifact_hashes','source_hashes','original_review_sha256']:
    assert before[key]==after[key],key
assert len(before['artifact_hashes'])==59 and len(before['source_hashes'])==1932
assert after['artifact_mismatches']==after['changed_from_fixer_before']==[]
assert all(after['protected_sections_unchanged'].values())
checks={'review_json_valid':True,'spec_counts_verified':True,'input_source_artifact_hashes_unchanged':True,'exit_witnesses_verified':True,'head_unchanged':True,'tracked_diff_empty':True,'scope':'DESIGN_ONLY_SPEC_MODEL_NOT_PRODUCTION'}
(ROOT/'final-verification.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
manifest={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='artifact-manifest.json'}
(ROOT/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
for name,digest in json.loads((ROOT/'artifact-manifest.json').read_text()).items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
print(json.dumps(checks,indent=2))
print('Own artifact manifest entries:',len(manifest))
print('review.json sha256:',manifest['review.json'])
