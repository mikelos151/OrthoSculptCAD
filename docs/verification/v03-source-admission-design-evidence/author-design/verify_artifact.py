"""Artifact/scope checks only, not implementation acceptance."""
from pathlib import Path
import hashlib, json, re, sys
ROOT=Path('C:/Users/sandr/OrthoSculptCAD')
OUT=Path(__file__).parent
HISTORY=OUT.parent
DOC=ROOT/'docs/plans/v03-source-admission-owner-design.md'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
inv=json.loads((HISTORY/'inventory-and-arithmetic.json').read_text(encoding='utf-8'))
witness=json.loads((OUT/'witness-results.json').read_text(encoding='utf-8'))
for item in inv['files']:
 assert digest(ROOT/item['path'])==item['sha256'],item['path']
for name,expected in witness['historical_sha256'].items():
 assert digest(HISTORY/name)==expected,name
text=DOC.read_text(encoding='utf-8')
assert len(re.findall(r'^## \d+\.',text,re.M))==10
assert len(re.findall(r'^```',text,re.M))%2==0
for token in ['FullSourceTicket','AuditedSource','captureAudit','internalArenaExecution','resourceLedger.ts','workerPool.ts','auditTopologyArena.ts','auditSpatialArena.ts','G1a','G2b','G3b','G4','minimum-thickness','32E+16V+16F','4H+3','LOCAL_ONLY','projectEpoch','sourceDigest','unitsConfirmed','sourceAdmissionState.ts','WinError 5']:
 assert token in text,token
head,status,tracked,staged=sys.argv[1:5]
assert head==inv['head']
assert status.strip()=='?? docs/plans/v03-source-admission-owner-design.md',status
assert not tracked.strip() and not staged.strip()
result={'kind':'design-artifact-scope-verification','path':str(DOC),'sha256':digest(DOC),'bytes':DOC.stat().st_size,'lines':len(text.splitlines()),'sections':10,'head':head,'git_status':status.strip(),'tracked_diff':tracked,'staged_diff':staged,'inventory_source_files_unchanged':len(inv['files']),'historical_files_unchanged':list(witness['historical_sha256']),'witness_results_sha256':digest(OUT/'witness-results.json'),'implementation_admission_pass_claimed':False}
(OUT/'artifact-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
