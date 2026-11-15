from pathlib import Path
import hashlib, json
S = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core')
R = Path('C:/Users/sandr/OrthoSculptCAD')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def emit(p, data):
    if p.exists(): raise RuntimeError('Refuse overwrite of immutable artifact: ' + str(p))
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
v = json.loads((S / 'delivery-verification.json').read_text(encoding='utf-8'))
for p,h in v['sourceHashes'].items(): assert sha(R / p) == h
phases = json.loads((S / 'phase-index.json').read_text(encoding='utf-8'))
h = dict(v)
h.update({
    'repository':str(R), 'head':'25980b612ced5dc79ce966208cb7ce4edbb1546b',
    'modified':['src/compute/resourceLedger.ts'],
    'created':['src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts'],
    'HANDOFF':str(S/'HANDOFF.md'), 'artifactManifest':str(S/'artifact-manifest.json'),
    'phaseIndex':str(S/'phase-index.json'),
    'finalPhases':{'unit':'delivery-unit','strict128':'delivery-strict128','fullTsc512':'delivery-full-tsc512','native':'native-header-bound-green'},
    'commandsAndExits':[{'phase':p['phase'],'command':p['command'],'exit':p['exit'],'stdout':p['stdout'],'stderr':p['stderr']} for p in phases],
    'behavioralCycles':[
        {'red':'native-legacy-red','green':'native-composition-green','kind':'native legacy gap to real input transport'},
        {'red':'core-prepare-red','green':'core-prepare-green','kind':'UNIT legal private prepare'},
        {'red':'core-roundtrip-red','green':'core-roundtrip-green','kind':'UNIT actual structuredClone transfer, not Worker'},
        {'red':'native-composition-red','green':'native-composition-green','kind':'native legal START from nonfunctional scaffold'},
        {'red':'prepared-private-owner-red','green':'prepared-private-owner-green','kind':'UNIT private PREPARED ownership/key suspension; native replay separate'},
        {'red':'native-reserved-phase-red','green':'final-unit','kind':'UNIT native RESERVED versus MAIN'},
        {'red':'native-header-bound-red','green':'native-header-bound-green','kind':'native received control identity reuse, four-header logical bound'},
    ],
    'coverageCaveat':'Immediate GREEN negative/codec cases are coverage, not behavioral RED. Native malformed-return fixtures mutate control metadata around genuine native postMessage, never fabricate ACK/payload replies.',
    'operationalFailuresPreserved':[
        {'phase':'composition-types','exit':2,'resolution':'TS narrowing fixed, then strict/full typecheck PASS'},
        {'phase':'expanded-types','exit':2,'resolution':'RAB fixture uses Reflect.construct under ES2022; runtime assertion unchanged'},
        {'phase':'final-strict128','exit':134,'resolution':'Scratch-only types:[] removes irrelevant ambient discovery from small browser compile; strict128 AND original full project tsc512 both PASS'},
    ],
    'review':'Author checks only. Parent independent code/spec review and final full regression/commit required.',
})
emit(S/'handoff.json',h)
excluded={'artifact-manifest.json','artifact-manifest.sha256'}
entries=[]
for p in sorted(S.rglob('*')):
    if p.is_file() and p.relative_to(S).as_posix() not in excluded:
        entries.append({'root':'scratch','path':p.relative_to(S).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
for p,hh in v['sourceHashes'].items(): entries.append({'root':'repository','path':p,'bytes':(R/p).stat().st_size,'sha256':hh})
manifest={'algorithm':'SHA-256','roots':{'scratch':str(S),'repository':str(R)},'excluded':sorted(excluded),'files':entries}
emit(S/'artifact-manifest.json',manifest)
manifestHash=sha(S/'artifact-manifest.json')
p=S/'artifact-manifest.sha256'
if p.exists(): raise RuntimeError('Refuse overwrite: '+str(p))
p.write_text(manifestHash+'  artifact-manifest.json\n',encoding='ascii')
for x in entries:
    root=S if x['root']=='scratch' else R
    p=root/x['path'];assert p.stat().st_size==x['bytes'] and sha(p)==x['sha256'],str(p)
assert sha(S/'artifact-manifest.json')==manifestHash
print(json.dumps({'status':'MANIFEST_VERIFIED','manifestFiles':len(entries),'manifestSHA256':manifestHash,'handoff':str(S/'HANDOFF.md'),'handoffJSON':str(S/'handoff.json'),'manifest':str(S/'artifact-manifest.json'),'sourceHashes':v['sourceHashes']},indent=2))
