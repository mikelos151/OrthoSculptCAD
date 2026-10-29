"""Adversarial review tests: one intentionally RED containment-binding regression."""
from fractions import Fraction as F
from math import isqrt
from pathlib import Path
import copy
import json
import unittest
import check_bridge
import spike

ROOT=Path(__file__).resolve().parent
REPORT=json.loads((ROOT/'review-results.json').read_text())
BASE=Path(REPORT['fresh']['curved']['cli']['results'])

class IndependentAdversarialTests(unittest.TestCase):
    def test_same_face_bridge_must_reject_real_ts_tilted_original_F(self):
        mutant=Path(REPORT['mutant']['bridge'])
        proof=json.loads(Path(REPORT['mutant']['proof']).read_text())
        self.assertTrue(check_bridge.public.verify_bundle(proof)['passed'])
        # REAL TS proof valid for F', exact shared E and all error budgets preserved.
        # Original F is z=0, while the actual curve/PL starts at z=9/131072.
        self.assertGreater(F(REPORT['mutant']['outsideOriginalF']['PLStartZ']),0)
        with self.assertRaises(ValueError, msg='same-face checker accepts real R/PL outside original F'):
            check_bridge.verify(mutant)

    def test_canonical_control_error_corruption_rejected_with_real_proof_unchanged(self):
        data=json.loads(BASE.read_text())
        data['controls'][1][1]['errorSquared']=['0','0']
        path=ROOT/'mutant-canonical-control-error.json'
        with path.open('x',encoding='utf8') as out:
            json.dump(data,out,indent=2)
        proof=json.loads(Path(data['real_proof_path']).read_text())
        self.assertTrue(check_bridge.public.verify_bundle(proof)['passed'])
        with self.assertRaisesRegex(ValueError,'exact control error identity'):
            check_bridge.verify(path)

    def test_canonical_false_actual_G1_rejected(self):
        data=json.loads(BASE.read_text())
        data['actualRationalUnfoldedDeterminant']=['0','0']
        data['actualRationalUnfoldedDeterminantSign']=0
        path=ROOT/'mutant-canonical-false-G1.json'
        with path.open('x',encoding='utf8') as out:
            json.dump(data,out,indent=2)
        with self.assertRaisesRegex(ValueError,'actual rational determinant identity'):
            check_bridge.verify(path)

    def test_nonzero_interval_straddling_zero_is_unknown_not_equality(self):
        n=isqrt(2<<256)
        self.assertLess(n*n,2<<256)
        self.assertLess(2<<256,(n+1)*(n+1))
        ctx=spike.Field(sign_bits=8)
        value=ctx.q(-F(n,1<<128),1)
        self.assertFalse(value.is_zero())
        low,high=ctx.enclosure(value,8)
        self.assertLess(low,0)
        self.assertGreater(high,0)
        with self.assertRaisesRegex(spike.Unknown,'sign cancellation unresolved'):
            ctx.sign(value)

if __name__=='__main__':
    unittest.main()
