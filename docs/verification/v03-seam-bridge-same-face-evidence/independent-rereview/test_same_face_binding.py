"""Real reviewer regression and additional ordered-face coverage."""
import copy
from fractions import Fraction as F
import json
from pathlib import Path
import unittest
import uuid

import check_bridge

ROOT = Path(__file__).resolve().parent
REPORT = json.loads((ROOT / 'review-results.json').read_text(encoding='utf8'))


class SameFaceBindingTests(unittest.TestCase):
    def test_real_tilted_ts_proof_passes_public_but_bridge_refuses(self):
        proof_path = Path(REPORT['mutant']['proof'])
        bridge_path = Path(REPORT['mutant']['bridge'])
        proof = json.loads(proof_path.read_text(encoding='utf8'))
        bridge = json.loads(bridge_path.read_text(encoding='utf8'))
        self.assertEqual(Path(bridge['real_proof_path']), proof_path)
        self.assertEqual(check_bridge.public.verify_bundle(proof),
                         {'passed': True, 'cases': 2, 'leaves': 8, 'samples': 10})
        self.assertEqual(F(REPORT['mutant']['outsideOriginalF']['PLStartZ']), F(9, 131072))
        with self.assertRaisesRegex(ValueError, 'ordered reference triangle mismatch'):
            check_bridge.verify(bridge_path)

    def test_original_ordered_reference_faces_pass(self):
        path = Path(REPORT['fresh']['curved']['cli']['results'])
        self.assertTrue(check_bridge.verify(path)['passed'])

    def test_coverage_permuted_f_and_wrong_g_are_refused(self):
        # Synthetic proof mutations for checker coverage, not real TS outputs.
        base = json.loads(Path(REPORT['fresh']['curved']['cli']['results']).read_text(encoding='utf8'))
        proof = json.loads(Path(base['real_proof_path']).read_text(encoding='utf8'))
        directory = ROOT / 'runs' / ('coverage-face-binding-' + uuid.uuid4().hex)
        directory.mkdir(parents=True)
        for name in ('permuted-f', 'wrong-g'):
            with self.subTest(mutation=name):
                mutant = copy.deepcopy(proof)
                if name == 'permuted-f':
                    triangle = mutant['cases'][0]['containment']['triangle']
                    triangle[0], triangle[1] = triangle[1], triangle[0]
                else:
                    mutant['cases'][1]['containment']['triangle'][2][2] = {'n': '2', 'd': '1'}
                mutant_proof = directory / (name + '-synthetic-proof.json')
                with mutant_proof.open('x', encoding='utf8') as stream:
                    json.dump(mutant, stream)
                evidence = copy.deepcopy(base)
                evidence['real_proof_path'] = str(mutant_proof)
                evidence_path = directory / (name + '-synthetic-bridge.json')
                with evidence_path.open('x', encoding='utf8') as stream:
                    json.dump(evidence, stream)
                with self.assertRaisesRegex(ValueError, 'ordered reference triangle mismatch'):
                    check_bridge.verify(evidence_path)


if __name__ == '__main__':
    unittest.main()
