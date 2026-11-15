from pathlib import Path
import json, hashlib, re
R = Path('C:/Users/sandr/OrthoSculptCAD')
S = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def save(name, data):
    p = S / name
    if p.exists(): raise RuntimeError('immutable evidence already exists: ' + str(p))
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
start = load(S / 'integrity-start.json')
end = {p: sha(R / p) if (R / p).is_file() else None for p in start}
changed = [p for p in start if start[p] != end[p]]
assert changed == ['src/compute/resourceLedger.ts'], changed
assert start['src/compute/resourceLedger.ts'] == 'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109'
assert end['src/compute/workerPool.ts'] == 'b5a7457bde19616b61247ca690bf2b1bc5f387cd3067db3ad56cb9c115878e64'
assert end['tests/v03-resource-ledger.test.ts'] == '643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95'
assert end['tests/v03-worker-pool.test.ts'] == '0f977cb7b128492ec33667f805c553de074d1417c60c08bacd6316c0190bc5a7'
assert end['docs/plans/v03-native-broker-g1b-design.md'] == '45cc11a03a92218670bff1fdf77d5fcd1c8f089a318044bdfe9269cecd1285a3'
assert end['docs/plans/v03-source-admission-owner-design.md'] == '800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce'
owned = ['src/compute/resourceLedger.ts', 'src/compute/nativeHandoff.ts', 'src/compute/nativeHandoff.worker.ts', 'tests/v03-native-handoff.test.ts']
hashes = {p: sha(R / p) for p in owned}
for phase in ['delivery-unit', 'delivery-strict128', 'delivery-full-tsc512', 'native-header-bound-green']:
    command = load(S / 'phases' / phase / 'command.json')
    assert command['exit'] == 0, (phase, command)
    for p in owned: assert command['hashes'][p] == hashes[p], (phase, p)
u = load(S / 'phases/delivery-unit/vitest-results.json')
assert u['success'] and u['numTotalTests'] == u['numPassedTests'] == 68
assert u['numFailedTests'] == u['numPendingTests'] == u['numTodoTests'] == 0
unit = {Path(t['name']).name: len(t['assertionResults']) for t in u['testResults']}
assert unit == {'v03-native-handoff.test.ts': 28, 'v03-worker-pool.test.ts': 24, 'v03-resource-ledger.test.ts': 16}, unit
n = load(S / 'phases/native-header-bound-green/native-results.json')
assert n['passed'] and all(n['closed'].values()) and not n['errors'] and not n['external']
assert len(n['result']['checks']) == 71 and all(c['pass'] for c in n['result']['checks'])
assert n['result']['metrics'] == {'constructors': 12, 'terminates': 12, 'peak': 2, 'live': 0}
created = sum(w['type'] == 'created' for w in n['workers'])
closed = sum(w['type'] == 'closed' for w in n['workers'])
assert created == closed == 9
ret = [v for v in n['workerConsole'] if v['type'] == 3 and v['stage'] == 'after-post']
assert len(ret) == 9 and all(all(v['detached']) and all(b == 0 for b in v['lengths']) for v in ret)
assert all(v['headerSame'] and v['descriptorsSame'] for v in n['workerConsole'] if v['stage'] == 'before-post')
for name, h in n['hashes']['source'].items(): assert sha(R / 'src/compute' / name) == h
for name, h in n['hashes']['served'].items():
    file = S / 'phases/native-header-bound-green' / ('fixture.mjs' if name == 'fixture.mjs' else 'served/' + name)
    assert sha(file) == h, name
for v in n['servedVariants']:
    p = S / 'phases/native-header-bound-green/served' / v['name']
    assert sha(p) == v['sha256'], v
    assert p.read_text().endswith((S / 'phases/native-header-bound-green/served/nativeHandoff.worker.js').read_text())
legacy = load(S / 'phases/native-legacy-red/command.json')
assert legacy['exit'] == 1 and legacy['hashes']['src/compute/resourceLedger.ts'] == start['src/compute/resourceLedger.ts']
for name, expected in [('core-prepare-red',1),('core-roundtrip-red',1),('native-composition-red',1),('prepared-private-owner-red',1),('native-reserved-phase-red',1),('native-header-bound-red',1),('final-strict128',134)]:
    assert load(S / 'phases' / name / 'command.json')['exit'] == expected
assert not any(x in (R / 'src/compute/index.ts').read_text() for x in ['nativeHandoff', 'createNativeLedger'])
ledger_added = '\n'.join(x[1:] for x in (S / 'ledger-delivery.diff').read_text().splitlines() if x.startswith('+') and not x.startswith('+++'))
scan_input = ledger_added + '\n' + '\n'.join((R / p).read_text() for p in owned[1:])
patterns = {
    'hardcodedCredentials': r'(?i)(?:api_key|secret|password|passwd|token)\s*=\s*[\'\"][^\'\"]{6,}',
    'dynamicExecution': r'\b(?:eval|exec)\s*\(|new\s+Function\s*\(',
    'networkOrProcess': r'child_process|\bfetch\s*\(|XMLHttpRequest|WebSocket|subprocess|os\.system',
    'debugLoggingInProduction': r'console\.(?:log|info|debug|warn)',
}
# Tests are not production: debug check is separately restricted to the two new production modules.
findings = {k: re.findall(v, scan_input if k != 'debugLoggingInProduction' else '\n'.join((R / p).read_text() for p in owned[1:3])) for k,v in patterns.items()}
assert not any(findings.values()), findings
phases = []
for p in sorted((S / 'phases').glob('*/command.json'), key=lambda p:p.stat().st_mtime_ns):
    d=load(p);phases.append({'phase':p.parent.name,'command':d['command'],'exit':d['exit'],'error':d.get('error'),'signal':d.get('signal'),'stdout':str(p.parent/'stdout.log'),'stderr':str(p.parent/'stderr.log'),'sourceTestHashes':d['hashes']})
summary = {
    'status':'DELIVERED_FOR_PARENT_INDEPENDENT_REVIEW_NOT_ACCEPTANCE',
    'scope':'G1b1b input-only same-core native START/RECEIVED/RETURN',
    'sourceHashes':hashes, 'trackedInputs':len(start), 'permittedTrackedChanges':changed,
    'allOtherTrackedFilesUnchanged':len(start)-len(changed),
    'unit':{'passed':u['numPassedTests'],'failed':u['numFailedTests'],'skipped':u['numPendingTests'],'perFile':unit},
    'native':{'checks':len(n['result']['checks']),'metrics':n['result']['metrics'],'devtoolsCreated':created,'devtoolsClosedBeforeTeardown':closed,'nativeReturnedGroups':len(ret),'browser':n['result'].get('browserVersion'),'closed':n['closed'],'errors':n['errors'],'externalRequests':n['external']},
    'staticScan':findings,
    'note':'12 actual constructors/terminate invocations; 3 workers stopped before DevTools attached (attached DataCloneError, alias, duplicate preflight); 9 observed native endpoint Workers closed. No fabricated native replies.',
    'phaseCount':len(phases),
    'releaseScopeCaveat':'dist and published ZIP are ignored/untracked and not included in start hash map; no build/replacement command was executed. All tracked inputs except explicitly permitted resourceLedger.ts match start.',
    'notClaimed':['G1b1c full lifecycle/cancel/release/error/deadline/SHA holds','worker-clock propagation','App/global cap migration/G1b2','native-output or remote-new grants','source admission/ACTIVE/G2/G3/geometry/UI','whole-project regression (parent-owned)','thread join/GC/RSS bound','independent review/acceptance'],
}
save('integrity-end.json',end)
save('phase-index.json',phases)
save('delivery-verification.json',summary)
print(json.dumps(summary,indent=2))
