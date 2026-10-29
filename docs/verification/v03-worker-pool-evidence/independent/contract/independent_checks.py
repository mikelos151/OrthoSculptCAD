"""Supplementary contract premises/count checks; never native/production proof."""
import copy
import difflib
import hashlib
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'replay'))
import spec_cases
from spec_model import classify, main_gate, grace_end

checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

def classify_case(name, changes_state, changes_frame, now, expected):
    state, frame = spec_cases.baseline()
    state.update(changes_state)
    frame.update(changes_frame)
    snapshot = copy.deepcopy(state)
    check(name, classify(state, frame, now) == expected and state == snapshot)

class BindingOnly(dict):
    def __getitem__(self, key):
        if key != 'binding':
            raise AssertionError('old-binding frame accessed')
        return super().__getitem__(key)
check('old captured binding short-circuits every frame field', classify({'binding':'h2'}, BindingOnly(binding='h1'), 999999) == 'ignore-old-binding')
classify_case('cleanup foreign nonce is fault despite correct target', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'auth':(0,'foreign',2,1),'signature':('RELEASED',0,())}, 101, 'fault')
classify_case('cleanup malformed schema is fault before cleanup acceptance', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'schema':False,'signature':('RELEASED',0,())}, 101, 'fault')
classify_case('cleanup nonzero transfer is fault', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'signature':('RELEASED',3,())}, 101, 'fault')
classify_case('cleanup unexpected descriptors is fault', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'signature':('RELEASED',0,((1,1,16),))}, 101, 'fault')
classify_case('valid cleanup before busy deadline accepted after revoke', {'revoking':True,'cleanup':(3,3,3),'grace':120100}, {'signature':('RELEASED',0,())}, 120099, 'accept-cleanup-terminal')
classify_case('cleanup at busy deadline terminal', {'revoking':True,'cleanup':(3,3,3),'grace':120100}, {'signature':('RELEASED',0,())}, 120100, 'deadline-terminal')
classify_case('retired plan-valid response remains ignore in REVOKING', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'request':(2,2,2),'signature':spec_cases.sig(n=2)}, 101, 'ignore-last-retired')
classify_case('matching current tuple without expected signature faults', {}, {'signature':('UNKNOWN',3,())}, 101, 'fault')
classify_case('idle last-retired response ignores without active request', {'current':None}, {'request':(2,2,2),'signature':spec_cases.sig('RETURN',2)}, 200001, 'ignore-last-retired')
classify_case('valid planned ERROR is eligible current response', {'expected':{('ERROR',3,((0,1,0),))}}, {'signature':('ERROR',3,((0,1,0),))}, 101, 'accept-current')
check('grace never extends exhausted busy deadline', grace_end(120101,120100) == 120100)
check('main gate expired not extended by long delay', not main_gate(100,999999))

names = [row[0] for row in spec_cases.CASES]
check('36 unique case names', len(names) == len(set(names)) == 36)
loader = unittest.defaultTestLoader
counts = {'classification':loader.loadTestsFromTestCase(spec_cases.Correlation).countTestCases(), 'deadline':loader.loadTestsFromTestCase(spec_cases.Deadline).countTestCases()}
check('actual loader discovers 36 plus 6 tests', counts == {'classification':36,'deadline':6})
log = (ROOT/'spec-cases.log').read_text(encoding='utf-8')
executed = re.findall(r'^test_.*? \.\.\. ok$',log,re.M)
check('raw runner enumerates exactly 42 passing tests', len(executed)==42 and 'Ran 42 tests' in log and '\nOK' in log)
check('all actual exit witnesses zero', all((ROOT/name).read_text().strip()=='0' for name in ['spec-cases.exit','bootstrap.exit','audit-before.exit']))

REPO = pathlib.Path('C:/Users/sandr/OrthoSculptCAD')
FIX = pathlib.Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-contract-fix')
a = (REPO/'docs/verification/v03-native-broker-design-evidence/initial-plan.md').read_text(encoding='utf-8').splitlines(keepends=True)
b = (REPO/'docs/plans/v03-native-broker-g1b-design.md').read_text(encoding='utf-8').splitlines(keepends=True)
patch = ''.join(difflib.unified_diff(a,b,fromfile='a/docs/plans/v03-native-broker-g1b-design.md',tofile='b/docs/plans/v03-native-broker-g1b-design.md'))
check('supplied patch exactly reproduces original to current diff', patch==(FIX/'design.patch').read_text(encoding='utf-8'))
source_hashes = json.loads((ROOT/'before-hashes.json').read_text())['source_hashes']
expected_protected = {'src/compute/resourceLedger.ts':'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109', 'tests/v03-resource-ledger.test.ts':'643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95', 'docs/plans/v03-source-admission-owner-design.md':'800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce'}
protected_sources = {k:source_hashes[k] for k in expected_protected}
check('all three accepted canonical source/design hashes match', protected_sources==expected_protected)
result = {'scope':'SPEC_MODEL_NOT_PRODUCTION', 'checks_passed':len(checks), 'checks':checks, 'actual_case_counts':counts, 'raw_runner_ok_lines':len(executed), 'protected_sources':protected_sources,
 'limits':['schema=True means closed-envelope validation premise, not a wire decoder', 'auth is private binding correlation, not live public dispatch/publication authority', 'classifier has no ledger/rebind, issuance or terminal side effects', 'step-name loop does not exercise real copy/start/send or asynchronous clock propagation', 'supplementary checks are not additional native or production tests']}
(ROOT/'independent-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
