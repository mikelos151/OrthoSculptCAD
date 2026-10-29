import unittest
from fractions import Fraction as F
import spike

class BridgeTests(unittest.TestCase):
    def test_straight_reference_through_real_ts_and_public_verifier(self):
        self.assertTrue(callable(getattr(spike, 'run_experiment', None)), 'missing end-to-end bridge')
        result = spike.run_experiment('tdd-straight', curved=False)
        self.assertEqual(result['verdict'], 'VALIDATED_LOCAL')
        self.assertEqual(result['public_verifier']['cases'], 2)
        self.assertTrue(result['public_verifier']['passed'])
        self.assertEqual(result['budget']['delta_plus_tau'], '1/200')
        self.assertTrue(result['seam_exact'])
        self.assertEqual(result['ideal_unfolded_determinant'], ['0', '0'])
        self.assertNotEqual(result['bad_rational_determinant'], ['0', '0'])
        self.assertEqual(result['public_verifier']['leaves'], 2)

    def test_curved_pair_uses_nonzero_sampler_certificates(self):
        try:
            result = spike.run_experiment('tdd-curved', curved=True)
        except spike.Refused as exc:
            self.fail('missing curved bridge behavior: '+str(exc))
        self.assertEqual(result['public_verifier']['cases'], 2)
        self.assertTrue(result['public_verifier']['passed'])
        self.assertTrue(all(n > 1 for n in result['leavesPerSpan']))
        self.assertTrue(all(F(x) > 0 for x in result['samplerMaxUpperSquared']))
        self.assertTrue(all(x != ['0','0'] for x in result['nonstraightDeterminants']))
        self.assertEqual(result['ideal_unfolded_determinant'], ['0','0'])
        self.assertTrue(result['seam_exact'])

    def test_overspent_existing_curve_budget_refuses_before_real_producer(self):
        with self.assertRaisesRegex(spike.Refused, 'delta.*tau.*budget'):
            spike.run_experiment('tdd-overspent', delta=F(1,500))

    def test_independent_bridge_checker_binds_ideal_to_real_rational_proof(self):
        import check_bridge
        self.assertTrue(callable(getattr(check_bridge, 'verify', None)), 'missing independent bridge checker')
        result = spike.run_experiment('tdd-independent', curved=True)
        summary = check_bridge.verify(result['results_path'])
        self.assertTrue(summary['passed'])
        self.assertEqual(summary['controlsChecked'], 8)
        self.assertEqual(summary['idealDerivativeIdentity'], True)
        self.assertEqual(summary['publicVerifier']['leaves'], 8)

    def test_coarse_control_approximation_refuses_with_preserved_evidence(self):
        import json
        from pathlib import Path
        with self.assertRaisesRegex(spike.Refused, 'control error') as failure:
            spike.run_experiment('tdd-coarse', bits=2, curved=True)
        evidence = getattr(failure.exception, 'evidence_path', None)
        self.assertIsNotNone(evidence, 'refusal must preserve its failed experiment')
        record = json.loads(Path(evidence).read_text())
        self.assertEqual(record['status'], 'REFUSED')
        self.assertFalse(record['producerCalled'])

    def test_field_identity_sign_cancellation_and_budget_coverage(self):
        from math import isqrt
        ctx = spike.Field()
        root = ctx.q(0,1)
        self.assertTrue((root*root-2).is_zero())
        self.assertEqual(ctx.sign(root*root-2), 0)
        self.assertEqual(ctx.sign(ctx.q(1,-1)), -1)
        n = isqrt(2 << 256)
        tiny = ctx.q(-F(n,1<<128),1)
        low = spike.Field(sign_bits=8)
        # This NONZERO algebraic value's interval contains zero: must be UNKNOWN.
        with self.assertRaisesRegex(spike.Unknown, 'unresolved'):
            low.sign(low.q(tiny.a,tiny.b))
        exhausted = spike.Field(max_ops=1)
        one = exhausted.q(1)
        with self.assertRaisesRegex(spike.Unknown, 'operation'):
            exhausted.sign(one)
        with self.assertRaisesRegex(spike.Unknown, 'bit'):
            spike.Field(max_bits=8).q(F(1,1<<16))

    def test_real_rational_approximant_does_not_claim_exact_g1(self):
        result = spike.run_experiment('tdd-approx-not-g1', curved=True)
        self.assertIn('actualRationalUnfoldedDeterminant', result)
        self.assertNotEqual(result['actualRationalUnfoldedDeterminant'], ['0','0'])
        self.assertNotEqual(result['actualRationalUnfoldedDeterminantSign'], 0)
        self.assertEqual(result['ideal_unfolded_determinant'], ['0','0'])

    def test_dyadic_request_cap_is_unknown_before_allocation(self):
        with self.assertRaisesRegex(spike.Unknown, 'dyadic.*cap'):
            spike.run_experiment('tdd-grid-cap', bits=257)

    def test_optional_second_local_radical_case_without_mixed_field(self):
        import secondary
        self.assertTrue(callable(getattr(secondary, 'run', None)), 'missing second local radical check')
        result = secondary.run()
        self.assertEqual(result['field'], 'Q(sqrt(3))')
        self.assertEqual(result['controlsChecked'], 4)
        self.assertTrue(result['publicVerifier']['passed'])
        self.assertEqual(result['publicVerifier']['cases'], 1)
        self.assertTrue(result['independentCoefficientErrorCheck'])
        self.assertLessEqual(F(result['maxControlErrorSquaredUpper']), F(1,1000000))

    def test_independent_checker_refuses_false_exact_g1_for_actual_approximation(self):
        import check_bridge
        import json
        from pathlib import Path
        result = spike.run_experiment('tdd-false-g1', curved=True)
        data = json.loads(Path(result['results_path']).read_text())
        data['actualRationalUnfoldedDeterminant'] = ['0','0']
        data['actualRationalUnfoldedDeterminantSign'] = 0
        mutant = Path(result['results_path']).with_name('mutant-false-exact-g1.json')
        spike.store(mutant, data)
        with self.assertRaisesRegex(ValueError, 'actual.*determinant'):
            check_bridge.verify(mutant)

    def test_independent_control_error_mutant_rejected_while_public_proof_passes(self):
        import check_bridge
        import json
        from pathlib import Path
        result = spike.run_experiment('coverage-error-mutant', curved=True)
        data = json.loads(Path(result['results_path']).read_text())
        data['controls'][1][1]['errorSquared'] = ['0','0']
        mutant = Path(result['results_path']).with_name('mutant-error-bound.json')
        spike.store(mutant, data)
        original_proof = json.loads(Path(data['real_proof_path']).read_text())
        self.assertTrue(check_bridge.public.verify_bundle(original_proof)['passed'])
        with self.assertRaisesRegex(ValueError, 'control error identity'):
            check_bridge.verify(mutant)

    def test_single_cli_path_publishes_independent_joint_bridge_check(self):
        result = spike.run_experiment('tdd-complete-cli', curved=True)
        self.assertIn('independent_bridge_verifier', result)
        self.assertTrue(result['independent_bridge_verifier']['passed'])
        self.assertEqual(result['independent_bridge_verifier']['controlsChecked'], 8)

if __name__ == '__main__':
    unittest.main()
