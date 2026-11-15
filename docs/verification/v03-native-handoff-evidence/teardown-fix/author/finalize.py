from pathlib import Path
import hashlib,json,difflib,re,shutil
root=Path('C:/Users/sandr/OrthoSculptCAD')
out=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text())
write=lambda p,v:p.write_text(json.dumps(v,indent=2,ensure_ascii=False),encoding='utf-8')
allowed=['src/compute/nativeHandoff.ts','tests/v03-native-handoff.test.ts']
start=load(out/'input-start.json');end={}
for p in root.rglob('*'):
 if any(x in ('.git','node_modules') for x in p.relative_to(root).parts):continue
 if p.is_file():end[p.relative_to(root).as_posix()]=sha(p)
write(out/'input-end.json',end)
changed=sorted(p for p in start if start[p]!=end.get(p));added=sorted(set(end)-set(start));deleted=sorted(set(start)-set(end))
assert changed==sorted(allowed) and not added and not deleted,(changed,added,deleted)
review=out.parent/'v03-native-handoff-quality-review'
assert sha(review/'artifact-manifest.json')=='53793823e487d379177a2241f12f33a096e003132c10ee333f81c111019a4ec5'
m=load(review/'artifact-manifest.json')
for e in m['files']:
 p=review/e['path'];assert sha(p)==e['sha256'] and p.stat().st_size==e['bytes'],e
assert len(m['files'])==m['entries']==39
original=load(out/'original-review-hashes.json');assert all(sha(review/n)==h for n,h in original.items())
assert (out/'git-head-end.txt').read_text().strip()=='25980b612ced5dc79ce966208cb7ce4edbb1546b'
before=(out/'runs/baseline/v03-native-handoff.test.ts').read_text()
after=(root/allowed[1]).read_text()
expected=before.replace("import { describe, expect, it } from 'vitest';","import { afterEach, describe, expect, it, vi } from 'vitest';")
assert after.startswith(expected+'\n'), 'original test bodies changed'
patch='';stats={};whitespace=[]
for name in allowed:
 old=(out/'runs/baseline'/Path(name).name).read_text().splitlines(keepends=True)
 new=(root/name).read_text().splitlines(keepends=True)
 diff=list(difflib.unified_diff(old,new,fromfile='before/'+name,tofile='after/'+name))
 patch+=''.join(diff)
 plus=[s[1:].rstrip('\r\n') for s in diff if s.startswith('+') and not s.startswith('+++')]
 stats[name]={'added':len(plus),'removed':sum(s.startswith('-') and not s.startswith('---') for s in diff)}
 whitespace += [{'file':name,'line':s} for s in plus if s.rstrip()!=s]
assert not whitespace,whitespace
(out/'minimal.diff').write_text(patch,encoding='utf-8',newline='\n')
write(out/'static-checks.json',{'exact_baseline_diff':stats,'added_line_trailing_whitespace':whitespace,'original_28_test_behaviors_byte_preserved_except_import':True,'security_self_review':{'hardcoded_credentials':False,'dynamic_execution':False,'external_IO_added':False,'API_changes':False},'git_no_index_check':{'actual_exit':1,'meaning':'files differ; both stdout logs empty, stderr contains only LF/CRLF warnings; no attributes/config changed'},'python_whitespace_check_exit':0})
protected={p:{'start':start[p],'end':end[p],'unchanged':start[p]==end[p]} for p in ['src/compute/resourceLedger.ts','src/compute/nativeHandoff.worker.ts','src/compute/workerPool.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md']}
write(out/'protected-unchanged.json',{'repository':str(root),'snapshot_scope':'all regular repository files excluding .git and node_modules; no dependency writes/install','start_count':len(start),'end_count':len(end),'changed':changed,'added':added,'deleted':deleted,'unchanged_count':sum(start[p]==end[p] for p in start),'named_protected':protected,'original_quality_entries_verified_unchanged':39,'original_review_hashes_unchanged':True})
runs={}
for d in sorted((out/'runs').iterdir()):
 assert load(d/'input-start.json')==load(d/'input-end.json'),d
 runs[d.name]={**load(d/'result.json'),'command':load(d/'command.json')['command'],'cwd':str(root),'artifacts':d.relative_to(out).as_posix()}
assert runs['q1-red']['actual_exit']==1 and runs['q2-red']['actual_exit']==1
assert load(out/'runs/q1-red/input-start.json')[allowed[0]]==start[allowed[0]]
assert load(out/'runs/q1-red/input-start.json')[allowed[1]]==load(out/'runs/q1-green/input-start.json')[allowed[1]]
assert load(out/'runs/q1-green/input-start.json')[allowed[0]]==load(out/'runs/q2-red/input-start.json')[allowed[0]]
assert load(out/'runs/q2-red/input-start.json')[allowed[1]]==load(out/'runs/q2-green/input-start.json')[allowed[1]]
for name in ['strict128-final','quality87','full-tsc512','native71','focused-final']:
 assert runs[name]['actual_exit']==0
 assert load(out/'runs'/name/'input-start.json')[allowed[0]]==end[allowed[0]]
 assert load(out/'runs'/name/'input-start.json')[allowed[1]]==end[allowed[1]]
f=load(out/'focused-final-results.json');q=load(out/'quality/witness-results.json');n=load(out/'native/phases/fixed/native-results.json')
assert f['numTotalTests']==f['numPassedTests']==73 and f['numFailedTests']==0
assert q['total']==q['passed']==len(q['results'])==87 and q['failed']==0 and all(x['passed'] for x in q['results'])
assert n['passed'] and len(n['result']['checks'])==71 and all(x['pass'] for x in n['result']['checks'])
assert n['result']['metrics']=={'constructors':12,'terminates':12,'peak':2,'live':0}
assert all(n['closed'].values()) and not n['errors'] and not n['external']
for name,h in n['hashes']['source'].items():assert sha(root/'src/compute'/name)==h
for name in allowed:
 target=out/'delivered-source'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,target)
counts={Path(t['name']).name:len(t['assertionResults']) for t in f['testResults']}
handoff={'scratch':str(out),'repository':str(root),'head':(out/'git-head-end.txt').read_text().strip(),'scope':'Wyłącznie Q1/Q2 wyjątkowego teardown G1b1b input-only; trzeci kontekst fixer','status':'FIX_READY_FOR_PARENT_REVIEW_NOT_ACCEPTANCE','acceptance':False,'modified_files':{name:{'before_sha256':start[name],'after_sha256':end[name]} for name in allowed},'diff_stats':stats,'tdd':{'q1':{'red_exit':1,'red':'28 PASS / 1 FAIL; pending 1 zamiast 0','green_exit':0,'green':'69/69 focused','tests_identical_red_to_green':True},'q2':{'red_exit':1,'red':'29 PASS / 2 FAIL; terminate 0 zamiast 1 (release i RETURN)','green_exit':0,'green':'71/71 focused','tests_identical_red_to_green':True},'additional_controls':{'classification':'existing-behavior coverage after correction; no artificial RED or further production change','cases':2,'scope':'actual terminate failure + reentrant dispose, with/without listener throw; exact error identity, charge/slot retention, no retry'}},'verification':{'focused':{'total':73,'passed':73,'failed':0,'files':counts,'original_handoff_cases':28,'added_handoff_cases':5},'quality':{'total':87,'passed':87,'failed':0,'witness_bytes_unchanged':True,'compiled_actual_fixed_source':True,'kind':'UNIT; no native fault reachability claim'},'strict128':{'actual_exit':0,'types':[],'lib':['ES2022','DOM'],'strict':True,'semiSpaceMiB':8},'full_project_typescript512':{'actual_exit':0,'semiSpaceMiB':8},'native':{'checks':71,'passed':71,'metrics':n['result']['metrics'],'devtools_created':sum(w['type']=='created' for w in n['workers']),'devtools_closed_before_context_teardown':sum(w['type']=='closed' for w in n['workers']),'closed':n['closed'],'unexpected_errors':n['errors'],'external_network':n['external'],'relocation_only_runner':True,'fixtures_unchanged':True,'source_hashes_match_delivery':True},'protected_repository_files_unchanged':len(start)-len(allowed),'all_run_inputs_stable':True},'encountered':[{'run':'strict128','actual_exit':2,'cause':'TS2769: union listener overload in cleanup tuple iteration','resolution':'three typed removal closures; strict128-final and full-tsc512 exit 0; failed output preserved'},{'run':'quality87','actual_exit':0,'warning':'Node experimental loader warning only; original loader retained'},{'run':'git no-index --check','actual_exit':1,'cause':'different untracked files; stdout empty, LF/CRLF warnings only; independent whitespace scan clean'}],'runs':runs,'not_performed':['full project Node/Python regression (parent-owned)','fresh independent review/acceptance (parent-owned)','staging/commit/reset/stash/clean','App/API/dependency/config/docs/skill changes'],'remaining':'Parent: fresh spec/quality review, full serial regression and acceptance. G1b1b remains UNACCEPTED.'}
write(out/'handoff.json',handoff)
lines=['# HANDOFF — Q1/Q2 G1b1b (bez akceptacji)','',
'- Zmieniono wyłącznie `src/compute/nativeHandoff.ts` i `tests/v03-native-handoff.test.ts`.',
'- Q1: reentrant revoke jest tylko zatrzaskiem podczas trwającego terminala; pierwotne wywołanie zachowuje completion ownership. Po sukcesie kończy dokładny prywatny ticket; brak odtworzenia RETURNED/resolve po dispose.',
'- Q2: każda z trzech prób usunięcia listenera ma osobny catch. Błąd cleanup zachowany oddzielnie od błędu terminate; nie blokuje terminalnej próby. RETURN z błędem cleanup nie publikuje wyniku.',
'- Kontrolowane refs zwalniane dopiero po potwierdzonym sukcesie. Rzeczywisty błąd terminate zachowuje slot i 5 B job; release/dispose nie ponawiają terminate. Niezwiązany MAIN/history hold i dane pozostają nietknięte; stary callback nie wpływa na h2.',
'', '## Pionowe TDD',
'- Q1 RED: exit 1, 28 PASS + 1 FAIL (`pending=1` zamiast 0); GREEN: exit 0, 69/69 focused. Test identyczny RED→GREEN.',
'- Q2 RED po Q1 GREEN: exit 1, 29 PASS + 2 FAIL (`terminate=0` zamiast 1, release/RETURN); GREEN: exit 0, 71/71 focused. Testy identyczne RED→GREEN.',
'- Dwa dodatkowe przypadki fail-closed (terminate throw + reentrant dispose, bez/z cleanup throw) od razu GREEN: uczciwie existing-behavior coverage, bez sztucznego RED i bez dalszej zmiany zachowania produkcyjnego.',
'- Końcowe focused: 73/73 = G1a 16 + pool 24 + handoff 33 (stare 28 bez zmiany treści asercji + 5 przypadków).',
'', '## Weryfikacja',
'- Quality: 87/87, exit 0, witness i loader bajtowo identyczne; kompilacja bieżącego poprawionego źródła do własnego `quality/compiled`.',
'- Strict ES2022+DOM/types[] 128 MiB/semi8: exit 0. Pełny projekt TypeScript 512 MiB/semi8: exit 0.',
'- Chromium: 71/71, 12 constructor/12 terminate, peak=2, live=0; 9/9 DevTools Workers zamkniętych przed context teardown; context/browser/server zamknięte, port odmawia połączenia. Fixture-matrix i fixture-roundtrip bez zmian; runner zmienia wyłącznie jeden literal katalogu scratch. Czyta aktualne repo.',
'- Q1/Q2 są wyłącznie UNIT fault injection, NIE dowodem wykonalnego błędu natywnego Workera ani exploitu.',
'- Zachowano nieudany strict128 (TS2769); poprawka dotyczy wyłącznie typowania trzech cleanup closures. Node loader emituje oryginalne ostrzeżenie. `git diff --no-index --check` exit 1 oznacza różnice, stdout pusty i wyłącznie ostrzeżenia LF/CRLF; niezależny scan whitespace czysty.',
'', '## Integralność',
f'- Zamrożono {len(start)} plików repo (bez `.git`/`node_modules`); dokładnie 2 dozwolone zmienione, {len(start)-2} identycznych, brak dodanych/usuniętych. `protected-unchanged.json` oraz pełne `input-start.json`/`input-end.json`.',
'- Oryginalny quality manifest o podanym SHA i wszystkie 39 entries ponownie zweryfikowane bez zmian. Chronione resourceLedger, worker, pool i oba plany bajtowo identyczne. HEAD bez zmian.',
'- Surowe stdout/stderr, rzeczywiste exits, komendy oraz source/test snapshots każdego kroku: `runs/`. Dokładny diff względem zastanego niecommitowanego źródła: `minimal.diff`. Końcowe kopie: `delivered-source/`.',
]
for name in allowed:lines.append(f'- SHA256 `{name}`: `{end[name]}`.')
lines+=['','## Replay (z katalogu repo)',
'Każda dokładna komenda znajduje się w `runs/<nazwa>/command.json`; nie uruchamiać oryginalnego quality runnera w jego katalogu.',
'```bash',
'node --max-old-space-size=256 --max-semi-space-size=8 node_modules/vitest/vitest.mjs run --config '+str(out/'vitest.config.mjs').replace('\\','/'),
'node --max-old-space-size=128 --max-semi-space-size=8 node_modules/typescript/bin/tsc -p '+str(out/'quality/tsconfig.json').replace('\\','/'),
'node --max-old-space-size=128 --max-semi-space-size=8 --loader file:///'+str(out/'quality/loader.mjs').replace('\\','/')+' '+str(out/'quality/witness.mjs').replace('\\','/'),
'node --max-old-space-size=512 --max-semi-space-size=8 node_modules/typescript/bin/tsc --noEmit',
'node --max-old-space-size=256 --max-semi-space-size=8 '+str(out/'native/native-cli.mjs').replace('\\','/')+' parent-fresh-phase',
'```',
'Nowe replaye muszą mieć własne wyjścia/kopie, aby nie nadpisać zamrożonych dowodów. Q1/Q2 RED odtwarzalne z zachowanych snapshotów we własnej kopii, bez cofania wspólnego worktree.',
'', '## Pozostałe bramki',
'Brak stagingu/commitu i brak pełnego Node/Python suite (własność parenta). Świeży niezależny review, pełna regresja i decyzja o akceptacji należą do parenta. G1b1b nadal UNACCEPTED; brak rozszerzenia API/zakresu produktu.'
]
(out/'HANDOFF.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
entries=[]
for p in sorted(out.rglob('*')):
 if p.is_file() and p.name!='artifact-manifest.json':entries.append({'root':'scratch','path':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
for name in allowed:entries.append({'root':'repository','path':name,'bytes':(root/name).stat().st_size,'sha256':sha(root/name)})
manifest={'scratch':str(out),'repository':str(root),'head':handoff['head'],'entries':len(entries),'scratch_entries':sum(e['root']=='scratch' for e in entries),'repository_entries':sum(e['root']=='repository' for e in entries),'files':entries}
write(out/'artifact-manifest.json',manifest)
# Verify every declared artifact and the hard entry counts after generation.
assert manifest['entries']==manifest['scratch_entries']+manifest['repository_entries']==len(manifest['files'])
for e in entries:
 p=(out if e['root']=='scratch' else root)/e['path'];assert sha(p)==e['sha256'] and p.stat().st_size==e['bytes']
print(json.dumps({'changed':changed,'protected_unchanged':len(start)-2,'focused':counts,'quality':[q['total'],q['passed'],q['failed']],'native_metrics':n['result']['metrics'],'final_hashes':{p:end[p] for p in allowed},'manifest_entries':manifest['entries'],'scratch_entries':manifest['scratch_entries'],'repository_entries':manifest['repository_entries'],'manifest_sha256':sha(out/'artifact-manifest.json')},indent=2))
