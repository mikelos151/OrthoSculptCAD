"""SPEC assertions only; not production API tests or native GREEN."""
import unittest
from spec_model import main_gate, classify
class Deadline(unittest.TestCase):
    def test_original_budget_before_boundary(self):
        self.assertTrue(main_gate(100, 120099))
class Correlation(unittest.TestCase):
    def test_old_binding_is_ignored_before_frame_access(self):
        self.assertEqual(classify({'binding': 'h2'}, {'binding': 'h1'}, 0), 'ignore-old-binding')
    def test_current_valid_ack_is_accepted(self):
        state = {'binding': 'h2', 'auth': (0,'nonce',2,1), 'current': (3,3,3), 'retired': (2,2,2), 'expected': {('RECEIVED',3,((1,1,16),)), ('RETURN',3,((1,1,16),))}, 'retired_expected': {('RECEIVED',2,((1,1,16),)), ('RETURN',2,((1,1,16),))}, 'seen': set(), 'revoking': False, 't0': 100, 'cleanup': None, 'grace': None}
        frame = {'binding': 'h2', 'schema': True, 'auth': state['auth'], 'request': (3,3,3), 'signature': ('RECEIVED',3,((1,1,16),))}
        self.assertEqual(classify(state, frame, 101), 'accept-current')
if __name__ == '__main__':
    unittest.main(verbosity=2)
