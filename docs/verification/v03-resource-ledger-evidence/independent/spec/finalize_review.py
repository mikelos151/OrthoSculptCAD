from pathlib import Path
import hashlib, json, re, difflib
S=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-spec-review')
A=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts')
R=Path('C:/Users/sandr/OrthoSculptCAD')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,d): (S/n).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def load(p): return json.loads(p.read_text(encoding='utf-8'))
expected={'src/compute/resourceLedger.ts':'075773df84d918336203a90079562c8eab141798c763e2b2b3a6571ce2e90254','tests/v03-resource-ledger.test.ts':'643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95','docs/plans/v03-source-admission-owner-design.md':'800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce'}
assert load(S/'hashes-before.json')==expected
actual={p:sha(R/p) for p in expected}
assert actual==expected
save('hashes-after.json',actual)
source_candidate='src/trimline/source-candidate.ts'
assert sha(R/source_candidate)=='983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b'
assert (S/'git-head-end.txt').read_text().strip()=='f288ffccb0d1eb2f2f901d9a03e1daa408b289db'
w=load(S/'witness-results.json')
assert w['passed'] and w['scope']=='G1aPrimitiveOnly'
assert len(w['cases'])==w['caseCount']==22 and all(x['passed'] for x in w['cases'])
assert w['projectionGraphs']==729
assert w['graphAssertions']==sum(x['checks'] for x in w['cases'])+729*14==10517
assert int((S/'witness.exit.txt').read_text())==int((S/'compile.exit.txt').read_text())==0
assert len(load(S/'witness-traces.json'))==sum(x['checks'] for x in w['cases'])-1
transpiled=load(S/'historical-transpile-manifest.json')
assert len(transpiled)==28
ansi=re.compile(r'\x1b\[[0-9;]*m')
tdd=[]; diffs=[]; provenance=[]
for i in range(1,15):
    red='12b-RED' if i==12 else f'{i:02d}-RED'; green=f'{i:02d}-GREEN'
    phase_items=[]
    for label,expected_exit in [(red,1),(green,0)]:
        raw=ansi.sub('',(A/(label+'.log')).read_text(encoding='utf-8'))
        assert int((A/(label+'.exit.txt')).read_text())==expected_exit
        assert (A/(label+'.command.txt')).read_text().strip()
        assert f'Tests  {i} passed ({i})' in raw if expected_exit==0 else re.search(r'Tests\s+1 failed',raw)
        historical=(S/'historical'/(label+'.log')).read_text(encoding='utf-8')
        assert int((S/'historical'/(label+'.exit.txt')).read_text())==expected_exit
        assert json.dumps({'phase':label,'passed':not bool(expected_exit),'kind':'UNCHANGED_HISTORICAL_PRODUCTION_BEHAVIOR'},separators=(',',':')) in historical
        assert 'ERR_MODULE_NOT_FOUND' not in historical and 'SyntaxError' not in historical
        src=A/'phases'/label/'resourceLedger.ts'
        compiled=next(x for x in transpiled if x['phase']==label)
        assert sha(src)==compiled['sourceSha256']
        assert sha(S/'historical'/(label+'.mjs'))==compiled['emittedSha256']
        phase_items.append({'phase':label,'archivedExit':expected_exit,'independentReplayExit':expected_exit,'command':(S/'historical'/(label+'.command.txt')).read_text().strip(),'sourceSha256':sha(src),'rawFailureOrPassSummary':[x for x in raw.splitlines() if re.search(r'FAIL  |AssertionError:|TypeError:|Tests\s+\d',x)]})
        for p in [src,A/'phases'/label/'v03-resource-ledger.test.ts',A/(label+'.log'),A/(label+'.exit.txt'),A/(label+'.command.txt')]: provenance.append({'path':str(p),'sha256':sha(p)})
    rt=(A/'phases'/red/'v03-resource-ledger.test.ts').read_bytes(); gt=(A/'phases'/green/'v03-resource-ledger.test.ts').read_bytes()
    assert rt==gt
    rs=(A/'phases'/red/'resourceLedger.ts').read_text(encoding='utf-8');gs=(A/'phases'/green/'resourceLedger.ts').read_text(encoding='utf-8')
    assert rs!=gs
    diffs.extend(difflib.unified_diff(rs.splitlines(True),gs.splitlines(True),fromfile=red,tofile=green))
    tdd.append({'cycle':i,'testUnchangedRedToGreen':True,'productionChangeRedToGreen':True,'phases':phase_items})
assert int((A/'12-RED.exit.txt').read_text())==0
assert (A/'phases/12-RED/resourceLedger.ts').read_bytes()==(A/'phases/12b-RED/resourceLedger.ts').read_bytes()
assert (A/'phases/12-RED/v03-resource-ledger.test.ts').read_bytes()!=(A/'phases/12b-RED/v03-resource-ledger.test.ts').read_bytes()
assert (A/'phases/17-final/resourceLedger.ts').read_bytes()==(R/'src/compute/resourceLedger.ts').read_bytes()
assert (A/'phases/17-final/v03-resource-ledger.test.ts').read_bytes()==(R/'tests/v03-resource-ledger.test.ts').read_bytes()
for p in [A/'12-RED.log',A/'12b-RED.log',A/'handoff.json',A/'HANDOFF.md']: provenance.append({'path':str(p),'sha256':sha(p)})
(S/'tdd-production-diffs.txt').write_text(''.join(diffs),encoding='utf-8')
save('tdd-independent-audit.json',{'passed':True,'cycles':tdd,'functionalRedGreenCycles':14,'historicalRuntimeProcesses':28,'unexpectedGreenExcluded':'12-RED','correctedRed':'12b-RED','lateConformanceTestsCountedAsTDD':False,'redGreenTestsByteIdentical':True,'chronologyEvidence':'Zachowane komendy/logi/exits i snapshoty faz; ponownie wykonano ich niezmienione zachowanie. Nie deklarujemy podpisanej/niezależnie utrwalonej historii czasu.','scaffoldBeforeFirstRed':'Prawidłowe reserve odrzucone przez niefunkcjonalny scaffold; nie import failure i nie celowe dodanie błędu over-cap.','betweenCycleSourceChanges':'03-RED i 07-RED dodają odmowne scaffolds; 14-RED zawiera naprawę kompilacji typed PlanEntry/snapshot pól po tsc-01.','rawArchiveInputs':provenance})
review={
 'passed':True,
 'security_concerns':[],
 'logic_errors':[],
 'suggestions':[],
 'summary':'PASS wyłącznie G1aPrimitiveOnly: rzeczywiste API spełnia zamrożony kontrakt §5.1.1; 22 niezależne przypadki, 729 grafów runtime oraz 14 pionów RED/GREEN odtworzono bez zmian produkcji.',
 'scope':{
   'kind':'G1aPrimitiveOnly','language':'pl','repository':str(R),'HEAD':'f288ffccb0d1eb2f2f901d9a03e1daa408b289db','writesOnly':str(S),
   'reviewed':['src/compute/resourceLedger.ts','tests/v03-resource-ledger.test.ts','docs/plans/v03-source-admission-owner-design.md:144-191','archiwalne metadane/logi/snapshoty 14 pionów implementera'],
   'repositoryWrites':False,'skillsDepsConfigProfilesModified':False,'gitStageCommitResetStash':False,'otherReviewerArtifactsRead':False,
   'execution':'Natywne Node/V8 ArrayBuffer; procesowe NODE_OPTIONS --max-old-space-size=128 --max-semi-space-size=8. Emitted JS tylko własny scratch; kompilacja aktualnego niezmienionego TS przez istniejący TypeScript.',
   'notVerified':['Pełne testy Node/Python/TS/audit rodzica','G1b native postMessage/detach/ACK/terminate/broker','G2 areny i bounded auditor','G3 prywatne audited S/source admission','G4 App registry/mode/mutation/publication/consumer fences','two-worker fences','heap/RSS bound','pełny CAD/clinical/native EXE'],
   'transfer':'Wyłącznie checked logical handoff; celowy zewnętrzny detach w negatywnym teście nie jest native transport acceptance.',
   'controlLimits':{'maxActiveLeases':1024,'maxActiveRefs':8192,'maxLifetimeRealms':32,'maxPlanEntries':1024,'maxKeyUTF16Units':128,'claim':'Skończone control records; nie bound RSS ani gwarancja nieskończonej pracy.'}
 },
 'evidence':{
   'frozenInputsBeforeAfter':actual,'sourceCandidateMatchesAcceptedBaseline':sha(R/source_candidate),'compiledProductionJS':{'path':'compiled/resourceLedger.js','sha256':sha(S/'compiled/resourceLedger.js')},
   'runtime':w,
   'independentOracle':'Jawna relacja ref→allocation/category/lease oraz osobne ważone zbiory allocation IDs dla managed/job/history; oczekiwany cały graf tworzy wejściowy ślad, nie snapshot ani counts produkcji. 729 rzeczywistych śladów z 2 native backing i 3 leases, 6 kategoriami, reclassify i close edges.',
   'matrixRows':{'1':['01','02'],'2':['03'],'3':['04'],'4':['05'],'5':['06'],'6':['07'],'7':['08'],'8':['09'],'9':['10']},
   'rollbackAndAuthentication':'Sprawdzono cały graf po refusals/errors, reserved vs live vs retired, CLOSED/INVALID_INPUT priority, obcy lease/ledger/realm, clone/JSON/forged ref, allocator fault i duplicate backing; kontrolowany hold to prawdziwy ref drugiego lease.',
   'nativeIdentity':'Prawdziwe widoki przekazują .buffer; ponowna rejestracja tego samego backing zachowuje ID; nieśledzony ingress i jego kopia mają odrębne ID. Osobny zarządzany copy ma reserve przed native .set. Intrinsic byteLength, cross-context AB, SAB/RAB/wrapper/view/detached refusal sprawdzone.',
   'TDD':{'artifact':'tdd-independent-audit.json','functionalCycles':14,'independentHistoricalRuns':28,'expectedREDExits':14,'expectedGREENExits':14,'unexpected12REDExcluded':True,'corrected12bREDFails':True,'lateConformanceOnly':2},
   'authorClaimsNotSubstitutedForExecution':'16 focused / 890 selected / project tsc / native smoke implementera odczytano jako dane. Ich serial replay i pełne 1208 Node / 71 Py / TS / audit pozostają rodzicowi; verdict nie opiera się na handoff.passed.',
   'artifacts':['witness.mjs','witness-results.json','witness-traces.json','witness.log','witness.exit.txt','compile.command.txt','compile.log','compile.exit.txt','tsconfig.json','compiled/resourceLedger.js','historical-replay.mjs','historical-transpile-manifest.json','historical/','tdd-metadata.json','tdd-independent-audit.json','tdd-production-diffs.txt','hashes-before.json','hashes-after.json','artifact-manifest.json'],
   'issuesEncountered':[
     'Własny witness attempt1: clone Lease z metodami zgłosił DataCloneError; poprawiono harness na asercję tego błędu oraz JSON forged lease. Zachowano skrypt/log/exit/wyniki attempt1; brak zmiany produkcji.',
     'Własny witness attempt2: oczekiwana lista nazw pól nie była posortowana jak actual; poprawiono wyłącznie kolejność expected. Zachowano attempt2; brak zmiany produkcji.',
     'Historyczny transpile attempt1: Node Windows ESM odrzucił import C:/; użyto file:///C:/ bez zmiany wejść. Zachowano błąd i skrypt. Po poprawce kompilacja i 28 replayów zgodne z oczekiwaniami.'
   ]
 }
}
assert review['passed'] and not review['security_concerns'] and not review['logic_errors']
save('review.json',review)
excluded={'artifact-manifest.json','finalize.log','finalize.exit.txt'}
manifest={str(p.relative_to(S)).replace('\\','/'):sha(p) for p in sorted(S.rglob('*')) if p.is_file() and p.name not in excluded}
save('artifact-manifest.json',manifest)
assert all(sha(S/p)==digest for p,digest in manifest.items())
print(json.dumps({'passed':True,'caseCount':w['caseCount'],'projectionGraphs':w['projectionGraphs'],'graphAssertions':w['graphAssertions'],'functionalTDDCycles':len(tdd),'historicalActualRuns':len(transpiled),'artifactFilesHashed':len(manifest),'frozenInputsUnchanged':True,'blockingListsEmpty':True},ensure_ascii=False))
