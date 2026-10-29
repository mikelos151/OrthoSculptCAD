"""Close the read-only audit and emit machine-readable Polish verdict."""
from pathlib import Path
import json
import re
import subprocess
from prepare import ROOT, FIXED, COPY_NAMES, snapshot, save, sha

if __name__=='__main__':
    before=json.loads((ROOT/'inputs-start.json').read_text(encoding='utf8'))
    after=snapshot()
    save(ROOT/'inputs-end.json',after)
    differences=[p for p in sorted(set(before)|set(after)) if before.get(p)!=after.get(p)]
    assert not differences, differences
    for name in COPY_NAMES:
        assert (ROOT/name).read_bytes()==(FIXED/name).read_bytes(),name
    commands=[json.loads(p.read_text(encoding='utf8')) for p in sorted(ROOT.glob('*.command.json'))]
    assert len(commands)==12,len(commands)
    tests=[]
    suites={}
    for c in commands:
        if '-m' in c['argv'] and 'unittest' in c['argv']:
            m=re.search(r'Ran (\d+) tests? in',c['stderr'])
            assert m and c['exit']==0 and c['stderr'].rstrip().endswith('OK')
            count=int(m.group(1))
            names=re.findall(r'^(test_.*) \.\.\. ok$',c['stderr'],re.M)
            assert len(names)==count
            tests.extend(names)
            suites[c['name']]={'tests':count,'exit':c['exit'],'log':c['name']+'.log'}
    assert len(tests)==20 and len(set(tests))==19
    witness=json.loads((ROOT/'witness-results.json').read_text(encoding='utf8'))
    node=subprocess.run(['node','--version'],capture_output=True,text=True,check=True).stdout.strip()
    assert node.startswith('v24.')
    review={
      'issue':'BRIDGE-SAMEFACE-1',
      'verdict':'CLOSED_LOCAL_ONLY',
      'passed':True,
      'language':'pl',
      'summary':'BRIDGE-SAMEFACE-1 zamknięty dla zamrożonego eksperymentu dwóch lokalnych spanów. Minimalne dokładne związanie obu uporządkowanych trójkątów usuwa potwierdzoną lukę. Bez zatwierdzenia produkcyjnego ani gwarancji pełnego buildera.',
      'security_concerns':[],
      'logic_errors':[],
      'scope':'Wyłącznie scratchowy mostek algebraicznego wzorca Q(sqrt(2)) do racjonalnych krzywych i PL na dwóch przypisanych literalnych F/G.',
      'independence':{
        'fixerHandoffUsedAsProof':False,
        'reviewedChecker':'check_bridge.py:73-82',
        'copiedInputsByteIdentical':len(COPY_NAMES),
        'originalReviewerTestByteIdentical':True,
        'changedSixHarnessFilesVsOriginal':['README.md','check_bridge.py'],
        'testFilesEditedToPass':False,
        'sourceCandidateWorkInspected':False,
        'checkerSha256':sha(ROOT/'check_bridge.py')},
      'mathematical_reasoning':[
        {'location':'check_bridge.py:72-82','claim':'Wymagane są dokładnie dwa przypadki. containment.triangle przypadku 0 równa się dokładnie uporządkowanemu F=((0,0,0),(1,0,0),(0,1,0)); przypadku 1 – G=((1,0,0),(0,0,0),(0,-1,1)). Oczekiwane dane są literalne, niezależne od dowodu i self-reported hashy. Porównanie Fraction(n,d), bez epsilonu.'},
        {'location':'check_bridge.py:93-129; v03_face_cubic_verify.py:188-239','claim':'Niezmienione idealWorld i idealBarycentric są sprawdzane względem literalnych wzorów i pełnej otoczki kontrolnej. Nowy witness dodatkowo odtwarza idealne i racjonalne world controls z tych samych uporządkowanych trójkątów. Racjonalne wagi i world controls są związane z tym samym rzeczywistym dowodem; publiczny inverse-chart verifier wymaga dokładnych wag, płaszczyzny oraz simplex. Zatem idealna i racjonalna krzywa leżą w tej samej przypisanej domkniętej ścianie. Całe odcinki PL także, przez sprawdzone końce próbek i wypukłość trójkąta.'},
        {'location':'check_bridge.py:119-126,170-172; v03_bezier_verify.py:221-274','claim':'Niezmienione współczynnikowe rozwinięcie kwadratu błędu i outward enclosure daje błąd kontroli ≤delta. Nieujemne Bernstein weights o sumie 1 rozciągają go na wszystkie t. Publiczny verifier sprawdza pełne pokrycie parametru i ciągły błąd względem chordów ≤tau. Stąd ideal–PL ≤delta+tau=1/200. Nie dodano składnika budżetu ani tolerancji na opuszczanie ściany.'},
        {'location':'check_bridge.py:133-158','claim':'Wzorzec zachowuje dokładną unfolded C1, a więc G1, przy E: po rozłożeniu obie pochodne=(1/4,-1/4,0), dodatni iloczyn skalarny/norma²=1/8. Racjonalna krzywa i PL pozostają przybliżeniami, NIE dokładnie intrinsic G1. Nierozstrzygnięty znak pozostaje UNKNOWN.'},
        {'location':'check_bridge.py:172; witness.py:traced_verify','claim':'Warunek dokładnie tych samych uporządkowanych ścian wraz z niezmienionymi bindingami i pełnym publicznym sprawdzeniem zamyka brakującą implikację, zamiast ukrywać ją jako hipotezę. Na obu historycznych i obu świeżych poprawnych dowodach zaobserwowano dokładnie jedno wywołanie public.verify_bundle na kompletnych dwóch przypadkach.'}
      ],
      'decisive_counterexample':witness['freshRealTiltedProof'],
      'historicalOriginals':witness['historicalOriginals'],
      'freshPositive':witness['freshPositive'],
      'tests':{'suites':suites,'executions':len(tests),'distinctTests':len(set(tests)),
               'note':'19 różnych testów: oryginalne 12 + poprawkowe 3 + recenzenckie 4; skupiony test tilted-F uruchomiony dodatkowo osobno, stąd 20 wykonań. Bez zmiany asercji.'},
      'negative':witness['negative'],
      'additionalFaceCoverage':{'permutedF':'synthetic checker coverage; REFUSED',
                                'wrongG':'synthetic checker coverage; REFUSED',
                                'claimedAsActualTS':False},
      'budget':{'delta':'1/1000','tau':'1/250','sum':'1/200',
                'hitUnchanged':'1/200','fullCQuantizationUnchanged':'1/100',
                'extraBudgetOrEpsilon':False},
      'limitations':[
        'Tylko wspólny punkt szwu E jest zachowany dokładnie; daleki koniec zakrzywionego G ma z=1/32+sqrt(2)/8. Nie twierdzimy dokładności wszystkich końców spanów.',
        'Oddzielne Q(sqrt(3)) to tylko jeden lokalny span; nie jest dowodem wieloszwowego łańcucha ani ograniczenia wzrostu stopnia pól.',
        'Hashy używamy do odtwarzalności i niezmienności lokalnych bajtów, nie jako zewnętrznego uwierzytelnienia tożsamości źródła.',
        'Stały lokalny checker nie jest utwardzonym parserem dowodów z niezaufanych plików; nie zatwierdzono źródłowej/full-S admission, globalnej regularności, prostoty, izotopii, Float32 C, cut/shell, Worker/App ani pełnego buildera.',
        'Nie oceniano pracy równoległych kandydatów źródłowych ani rzeczywistego wire-effort modelu.'
      ],
      'integrity':{'inputsStart':'inputs-start.json','inputsEnd':'inputs-end.json',
                   'filesHashedBeforeAndAfter':len(before),'differentFiles':differences,
                   'originalAndPriorAndFixedTreesImmutable':True,
                   'fiveAcceptedSourceVerifierModulesAndExistingCompilerUnchanged':True,
                   'allCopiedInputsStillByteIdentical':True,
                   'compiledJSAgainstPrior':witness['compiledAgainstPrior'],
                   'writesOutsideOwnedEvidenceRoot':False,
                   'repositoryGitWritesOrInstallsOrConfigOrSkillWrites':False},
      'execution':{'node':node,'pythonFlags':'-B / PYTHONDONTWRITEBYTECODE=1',
                   'commands':commands,'witness':'witness.py','witnessResults':'witness-results.json',
                   'replayNote':'run_tests.py i witness.py używają exclusive creation. Aby powtórzyć wszystkie statyczne testy, skopiuj zachowane niezmienione pliki wejściowe do NOWEGO katalogu scratch; nie uruchamiaj ponownie w katalogu z istniejącymi mutantami.'},
      'issuesEncountered':[{'severity':'nonblocking','description':'Opcjonalny odczyt Git HEAD przez subprocess zwrócił WinError 5. Nie oparto werdyktu na nowo odczytanym HEAD/statusie. Stan pięciu rzeczywiście użytych modułów i kompilatora potwierdzają hashe start/end oraz zgodność skompilowanych JS z pierwotnym review.'}],
      'artifacts':['review.json','witness.py','witness-results.json','prepare.py','run_tests.py',
                   'commands-and-results.json','copy-and-change-comparison.json','inputs-start.json','inputs-end.json',
                   'check_bridge.py.diff','README.md.diff','*.command.json','*.log','fresh-tilted-witness/','runs/','compiled/']
    }
    save(ROOT/'review.json',review)
    manifest={str(p.relative_to(ROOT)):{'sha256':sha(p),'bytes':p.stat().st_size}
              for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='artifact-hashes.json'}
    save(ROOT/'artifact-hashes.json',manifest)
    print(json.dumps({'verdict':review['verdict'],'inputsUnchanged':len(before),
                      'distinctTests':len(set(tests)),'testExecutions':len(tests),
                      'commands':len(commands),'artifactFilesHashed':len(manifest),
                      'review':str(ROOT/'review.json'),'checkerSha256':review['independence']['checkerSha256']}))
