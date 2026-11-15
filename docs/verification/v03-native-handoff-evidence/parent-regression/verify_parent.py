from pathlib import Path
import subprocess, os, sys, json, hashlib, re, shutil

REPO = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
(OUT/'tmp').mkdir(exist_ok=True)
paths = [p for base in ['src','tests'] for p in (REPO/base).rglob('*') if p.is_file()]
paths += [REPO/'docs/plans/v03-native-broker-g1b-design.md', REPO/'docs/plans/v03-source-admission-owner-design.md', REPO/'package.json', REPO/'package-lock.json']
def hashes():
    return {p.relative_to(REPO).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
def save(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
before = hashes()
assert before['src/compute/workerPool.ts']=='b5a7457bde19616b61247ca690bf2b1bc5f387cd3067db3ad56cb9c115878e64'
assert before['tests/v03-worker-pool.test.ts']=='0f977cb7b128492ec33667f805c553de074d1417c60c08bacd6316c0190bc5a7'
assert before['src/compute/nativeHandoff.ts']=='2827085fbdba645fe5dc07e804b5132bb016fccebfcb14e4885ffaf00d90bee0'
assert before['src/compute/nativeHandoff.worker.ts']=='792a3636e58318c367615ea01179860959a80d5b11aeb97cd02d5e1e6292f990'
assert before['tests/v03-native-handoff.test.ts']=='3da8372450ab1330388fb9d50960c79d5d009e114c6019ab6c98b74ac18511e6'
save('input-hashes-start.json', before)
assert before['src/compute/resourceLedger.ts'] == '166bc37f421313aeef899cd12c89681d5c4997774ad91187a65dd5a884aecf0b'
assert before['tests/v03-resource-ledger.test.ts'] == '643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95'
patterns = {'suspectedCredential': r'''(?i)(?:api_key|secret|password|passwd)\s*=\s*['\"][^'\"]{6,}['\"]''', 'dynamicExecution': r'\b(?:eval|exec)\s*\(', 'networkOrProcess': r'\b(?:fetch|XMLHttpRequest|WebSocket|child_process)\b'}
scan = {name: [{'file': f, 'line': i, 'text': line[:180]} for f in ['src/compute/resourceLedger.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts'] for i,line in enumerate((REPO/f).read_text().splitlines(),1) if re.search(pattern,line)] for name,pattern in patterns.items()}
save('static-scan.json', scan)
env = dict(os.environ, ORTHO_REAL_WORKER='1', ORTHO_REAL_REPORT_PDF='1', PYTHONDONTWRITEBYTECODE='1', PYTHONPATH=str(REPO/'node_modules/.cache/orthosculpt-report-python'), TEMP=str(OUT/'tmp'), TMP=str(OUT/'tmp'), TMPDIR=str(OUT/'tmp'))
commands = []
def run(label, argv, heap=256, timeout=300):
    local = dict(env, NODE_OPTIONS=f'--max-old-space-size={heap} --max-semi-space-size=8')
    try:
        x = subprocess.run(argv, cwd=REPO, env=local, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        code, stdout, stderr = x.returncode, x.stdout, x.stderr
    except subprocess.TimeoutExpired as e:
        code, stdout, stderr = 124, e.stdout or b'', (e.stderr or b'')+b'\nPARENT TIMEOUT\n'
    (OUT/(label+'.stdout.log')).write_bytes(stdout)
    (OUT/(label+'.stderr.log')).write_bytes(stderr)
    commands.append({'label':label,'argv':list(map(str,argv)),'exit':code,'nodeOptions':local['NODE_OPTIONS'],'timeout':timeout})
    save('commands.json', commands)
    print(f'{label}: exit={code}', flush=True)
    return code
node = shutil.which('node')
assert node
unit_exit = run('full-unit', [node, 'node_modules/vitest/vitest.mjs','run','--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile='+str(OUT/'full-unit.json')], timeout=360)
tsc_exit = run('typecheck', [node,'node_modules/typescript/bin/tsc','--noEmit','--incremental','false'], heap=512)
python_exit = run('python-reference', [sys.executable,'-B','-m','unittest','discover','-s','tests/reference','-p','test_*.py'])
npm = Path(node).parent/'node_modules/npm/bin/npm-cli.js'
assert npm.is_file(), npm
audit_exit = run('npm-audit', [node,str(npm),'audit','--json'], heap=128, timeout=180)
after = hashes()
save('input-hashes-end.json', after)
assert before == after, 'Acceptance inputs changed during execution'
summary = {'unitExit':unit_exit,'typecheckExit':tsc_exit,'pythonExit':python_exit,'npmAuditExit':audit_exit,'inputHashesUnchanged':True,'staticScan':scan,'scope':'G1b1b input-only native handoff regression; no full lifecycle/App/admission'}
if (OUT/'full-unit.json').is_file():
    u = json.loads((OUT/'full-unit.json').read_text())
    summary['unit'] = {k:u.get(k) for k in ['success','numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests']}
    ledger = [t for t in u.get('testResults',[]) if t.get('name','').replace('\\','/').endswith('/tests/v03-native-handoff.test.ts')]
    summary['nativeHandoff'] = [{'status':t.get('status'),'assertions':len(t.get('assertionResults',[])),'failed':[a.get('fullName') for a in t.get('assertionResults',[]) if a.get('status')!='passed']} for t in ledger]
    summary['unitExpectedTotal'] = 1248+28
ptext = (OUT/'python-reference.stderr.log').read_text(encoding='utf-8', errors='replace')
summary['pythonTests'] = int(m.group(1)) if (m:=re.search(r'Ran (\d+) tests?', ptext)) else None
try:
    audit = json.loads((OUT/'npm-audit.stdout.log').read_text())
    summary['auditVulnerabilities'] = audit.get('metadata',{}).get('vulnerabilities')
except (ValueError,TypeError):
    summary['auditVulnerabilities'] = None
summary['status'] = 'REGRESSION_PASS_REVIEWS_PENDING' if all(v==0 for v in [unit_exit,tsc_exit,python_exit,audit_exit]) else 'HOLD'
save('parent-results.json', summary)
print(json.dumps(summary, ensure_ascii=False), flush=True)
sys.exit(0 if summary['status']=='REGRESSION_PASS_REVIEWS_PENDING' else 1)
