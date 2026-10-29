"""Symbolic SPEC, not a wire decoder/production API/native GREEN.
Schema is a prevalidated-envelope premise. No Workers or replies are simulated.
"""
import copy
import json
import pathlib
import unittest
from spec_model import main_gate, classify, grace_end

def sig(kind='RECEIVED', n=3):
    return kind,n,((1,1,16),)
def baseline():
    state = dict(binding='h2',auth=(0,'nonce',2,1),current=(3,3,3),retired=(2,2,2),
                 expected={sig(),sig('RETURN'),sig('MATERIALIZED')},
                 retired_expected={sig(n=2),sig('RETURN',2)},seen=set(),
                 revoking=False,t0=100,cleanup=None,grace=None)
    return state,dict(binding='h2',schema=True,auth=state['auth'],request=(3,3,3),signature=sig())
CASES = [
 ('old_binding_before_frame_access', {}, {'binding':'h1'}, 101, 'ignore-old-binding'),
 ('current_valid_ack', {}, {}, 101, 'accept-current'),
 ('current_valid_return', {}, {'signature':sig('RETURN')}, 101, 'accept-current'),
 ('current_malformed', {}, {'schema':False}, 101, 'fault'),
 ('retired_malformed', {}, {'schema':False,'request':(2,2,2),'signature':sig(n=2)}, 101, 'fault'),
 ('wrong_nonce', {}, {'auth':(0,'wrong',2,1)}, 101, 'fault'),
 ('old_incarnation_current_channel', {}, {'auth':(0,'nonce',1,1)}, 101, 'fault'),
 ('future_generation', {}, {'auth':(0,'nonce',2,2)}, 101, 'fault'),
 ('wrong_slot', {}, {'auth':(1,'nonce',2,1)}, 101, 'fault'),
 ('future_request', {}, {'request':(4,4,4)}, 101, 'fault'),
 ('lower_unissued', {}, {'request':(1,1,1)}, 101, 'fault'),
 ('mixed_job', {}, {'request':(2,3,3)}, 101, 'fault'),
 ('mixed_window', {}, {'request':(3,3,2)}, 101, 'fault'),
 ('wrong_transfer', {}, {'signature':sig(n=4)}, 101, 'fault'),
 ('wrong_descriptor', {}, {'signature':('RECEIVED',3,((1,1,15),))}, 101, 'fault'),
 ('duplicate_active_received', {'seen':{'RECEIVED'}}, {}, 101, 'fault'),
 ('duplicate_active_return', {'seen':{'RETURN'}}, {'signature':sig('RETURN')}, 101, 'fault'),
 ('duplicate_active_materialized', {'seen':{'MATERIALIZED'}}, {'signature':sig('MATERIALIZED')}, 101, 'fault'),
 ('last_retired_ack', {}, {'request':(2,2,2),'signature':sig(n=2)}, 101, 'ignore-last-retired'),
 ('last_retired_return', {}, {'request':(2,2,2),'signature':sig('RETURN',2)}, 101, 'ignore-last-retired'),
 ('retired_unplanned', {}, {'request':(2,2,2),'signature':sig('MATERIALIZED',2)}, 101, 'fault'),
 ('retired_wrong_transfer', {}, {'request':(2,2,2)}, 101, 'fault'),
 ('retired_wrong_nonce', {}, {'request':(2,2,2),'signature':sig(n=2),'auth':(0,'wrong',2,1)}, 101, 'fault'),
 ('retired_after_deadline', {}, {'request':(2,2,2),'signature':sig(n=2)}, 120100, 'ignore-last-retired'),
 ('ack_at_deadline', {}, {}, 120100, 'deadline-terminal'),
 ('return_after_deadline', {}, {'signature':sig('RETURN')}, 120101, 'deadline-terminal'),
 ('released_without_revoke', {}, {'signature':('RELEASED',0,())}, 101, 'fault'),
 ('released_after_revoke', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'signature':('RELEASED',0,())}, 101, 'accept-cleanup-terminal'),
 ('released_at_grace', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'signature':('RELEASED',0,())}, 1100, 'deadline-terminal'),
 ('revoked_active_ack', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {}, 101, 'fault'),
 ('released_wrong_target', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'request':(1,1,1),'signature':('RELEASED',0,())}, 101, 'fault'),
 ('idle_cleanup_not_old_deadline', {'current':None,'revoking':True,'cleanup':(2,2,2),'grace':201000}, {'request':(2,2,2),'signature':('RELEASED',0,())}, 200001, 'accept-cleanup-terminal'),
 ('idle_before_first_start', {'current':None,'retired':None,'revoking':True,'cleanup':(0,0,0),'grace':1100}, {'request':(0,0,0),'signature':('RELEASED',0,())}, 101, 'accept-cleanup-terminal'),
 ('duplicate_released_terminal', {'binding':None}, {'signature':('RELEASED',0,())}, 101, 'ignore-old-binding'),
 ('old_h1_released_h2_reuse', {}, {'binding':'h1','signature':('RELEASED',0,())}, 101, 'ignore-old-binding'),
 ('older_untracked_cleanup', {'revoking':True,'cleanup':(3,3,3),'grace':1100}, {'request':(1,1,1),'signature':('RELEASED',0,())}, 101, 'fault'),
]
class Correlation(unittest.TestCase):
    pass
def make_case(sd,fd,now,expected):
    def test(self):
        state,frame=baseline(); state.update(sd); frame.update(fd)
        before=copy.deepcopy(state)
        self.assertEqual(classify(state,frame,now),expected)
        self.assertEqual(state,before)
    return test
for name,sd,fd,now,expected in CASES:
    setattr(Correlation,'test_'+name,make_case(sd,fd,now,expected))
class Deadline(unittest.TestCase):
    def test_before_boundary(self): self.assertTrue(main_gate(100,120099))
    def test_boundary_expired(self): self.assertFalse(main_gate(100,120100))
    def test_delayed_steps_never_reset(self):
        for step in ('copy','startup','send','RECEIVED','RETURN','publication'):
            with self.subTest(step=step): self.assertFalse(main_gate(100,120101))
    def test_busy_capped(self): self.assertEqual(grace_end(119900,120100),120100)
    def test_busy_one_second(self): self.assertEqual(grace_end(100,120100),1100)
    def test_idle_fresh_cleanup(self): self.assertEqual(grace_end(200000),201000)
if __name__ == '__main__':
    suite=unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    summary=dict(scope='symbolic SPEC only; not production/native GREEN',tests_run=result.testsRun,
                 classification_cases=len(CASES),deadline_tests=unittest.defaultTestLoader.loadTestsFromTestCase(Deadline).countTestCases(),
                 failures=len(result.failures),errors=len(result.errors),successful=result.wasSuccessful())
    pathlib.Path(__file__).with_name('spec-results.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    raise SystemExit(not result.wasSuccessful())
