"""Finalize design-only evidence in owned scratch; no repository writes."""
import difflib, hashlib, json, pathlib, re
OUT=pathlib.Path(__file__).parent
ROOT=pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
PLAN=ROOT/'docs/plans/v03-native-broker-g1b-design.md'
def digest(data): return hashlib.sha256(data).hexdigest()
before=(OUT/'plan-before.md').read_bytes(); after=PLAN.read_bytes()
old=before.decode('utf-8'); new=after.decode('utf-8')
assert digest(before)=='6b9d5ead108a81f32daf24bca112f2d33300274fe31dfb78858000e80943c558'
assert before==(ROOT/'docs/verification/v03-native-broker-design-evidence/initial-plan.md').read_bytes()
def sections(text):
    return {int(m.group(1)):m.group(0) for m in re.finditer(r'^## (\d+)\..*?(?=^## |\Z)',text,re.M|re.S)}
s0,s1=sections(old),sections(new)
protected={str(n):s0[n]==s1[n] for n in (2,3,7,9)}
assert all(protected.values()),protected
old_api=re.search(r'```ts.*?```',old,re.S).group(0)
assert old_api==re.search(r'```ts.*?```',new,re.S).group(0)
assert 'Worker pętle później sprawdzają tę samą pozostałą duration.' not in new
for phrase in ('main-enforced only','zero 56..63','max **2**','3 realm capabilities',
               'przed zależnymi kernelami G2c/G3','stary captured binding w kroku 1',
               'jeden last-retired','Token rezerwować **przed**'):
    assert phrase in new,phrase
patch=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/docs/plans/v03-native-broker-g1b-design.md',tofile='b/docs/plans/v03-native-broker-g1b-design.md'))
(OUT/'design.patch').write_text(patch,encoding='utf-8',newline='')
(OUT/'plan-after.md').write_bytes(after)
added=sum(x.startswith('+') and not x.startswith('+++') for x in patch.splitlines())
removed=sum(x.startswith('-') and not x.startswith('---') for x in patch.splitlines())
# Added-lines-only security scan; normative prose containing grant/token isn't a secret.
patterns=[r'(api_key|secret|password|token|passwd)\s*=\s*[\"\'][^\"\']{6,}[\"\']',r'os\.system\(',r'shell\s*=\s*True',r'\b(eval|exec)\(',r'pickle\.loads?\(']
security=[line for line in patch.splitlines() if line.startswith('+') and not line.startswith('+++') and any(re.search(p,line,re.I) for p in patterns)]
assert not security,security
provenance0=json.loads((OUT/'before.json').read_text())
provenance1=json.loads((OUT/'after.json').read_text())
assert provenance0['tracked_hashes']==provenance1['tracked_hashes']
assert provenance1['plan_sha256']==digest(after)
spec=json.loads((OUT/'spec-results.json').read_text())
assert spec['successful'] and not spec['errors'] and not spec['failures']
assert spec['tests_run']==spec['classification_cases']+spec['deadline_tests']
# Check real failure logs, not only expected shell status.
for label in ('deadline','correlation','current'):
    raw=(OUT/f'spec-{label}-red.log').read_text(encoding='utf-8')
    assert 'AssertionError' in raw and 'FAILED (failures=1)' in raw and 'ERROR:' not in raw
for label in ('deadline','correlation','current'):
    assert '\nOK\n' in (OUT/f'spec-{label}-green.log').read_text(encoding='utf-8')
commands=[dict(command=f'python {OUT.as_posix()}/test_spec.py',phase=label+' scaffold',exit_code=1,output=f'spec-{label}-red.log',meaning='SPEC scaffold behavioral refusal; not production RED') for label in ('deadline','correlation','current')]
commands += [dict(command=f'python {OUT.as_posix()}/test_spec.py',phase=label,exit_code=0,output=f'spec-{label}-green.log') for label in ('deadline','correlation','current')]
commands += [dict(command=f'python {OUT.as_posix()}/spec_cases.py',exit_code=0,output='spec-full.log',meaning='symbolic SPEC only')]
result=dict(scope='DESIGN ONLY: fixes G1B-DEADLINE-WIRE and G1B-CORRELATION-ORDER; closely related clarifications only',
            repository=str(ROOT),plan=str(PLAN),patch='design.patch',plan_before_sha256=digest(before),plan_after_sha256=digest(after),
            original_lines=len(old.splitlines()),new_lines=len(new.splitlines()),added_diff_lines=added,removed_diff_lines=removed,
            protected_sections_unchanged=protected,proposed_G1a_interface_unchanged=True,
            tracked_count=len(provenance1['tracked_hashes']),all_tracked_bytes_unchanged=True,
            G1a_sha256=provenance1['tracked_hashes']['src/compute/resourceLedger.ts'],
            branch=provenance1['commands']['branch']['stdout'].strip(),head=provenance1['commands']['head']['stdout'].strip(),
            git_before=provenance0['commands']['status'],git_after=provenance1['commands']['status'],
            untracked_caveat='Parallel actor owns workerPool.ts/test and other parent evidence; not read or modified; do not attribute all untracked files to this task.',
            spec=spec,commands=commands,added_lines_security_findings=security,
            issues_encountered=['Initial Python subprocess git capture failed PermissionError WinError 5; raw audit-before.log retained. Actual bash git capture succeeded; no settings changed.','write_file refused test_spec.py overwrite despite full read; file unchanged by refused call; expanded matrix written as new spec_cases.py.'],
            approval=False,fresh_parent_review_required=True,full_transport_status='HOLD pending fresh independent review; no transport implementation/native acceptance',
            G1b1a_scope='Independent pool only; max2/3 domains unchanged; no global app-cap migration claim',
            not_claimed=['production changes','native GREEN','worker-clock GREEN','G1b2 migration','source ACTIVE/admission','G2c/G3 mixed-positive','clinical CAD','EXE','RSS'],
            owned_repo_writes=['docs/plans/v03-native-broker-g1b-design.md'],owned_scratch=str(OUT))
(OUT/'handoff.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
manifest={p.name:digest(p.read_bytes()) for p in sorted(OUT.iterdir()) if p.is_file() and p.name not in ('artifact-manifest.json','finalize.log')}
(OUT/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({key:result[key] for key in ('plan_after_sha256','original_lines','new_lines','added_diff_lines','removed_diff_lines','protected_sections_unchanged','tracked_count','all_tracked_bytes_unchanged','spec','approval','full_transport_status')},indent=2,ensure_ascii=False))
