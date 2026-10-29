"""Behavior coverage of existing APIs + exact fixture proofs; NOT new admission/TDD RED."""
import copy
import json
from fractions import Fraction as F
import unittest
from exact_fixtures import ROOT, exact_model, exact_witness, expected_source
from v03_face_cubic_verify import verify_bundle


def load(name):
    return json.loads((ROOT/name).read_text(encoding='utf-8'))


class FixtureRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=load('catalog.json')
        cls.cases={c['id']:c for c in cls.catalog['cases']}
        cls.actual=load('actual-results.json')
        cls.rows={r['id']:r for r in cls.actual['rows']}
        cls.reports=load('actual-audit-reports.json')
        cls.base=cls.cases['TESTDATA-positive-S']

    def test_fixed_metadata_local_order_bits_and_attributes_across_all_cases(self):
        self.assertEqual(len(self.cases),5)
        self.assertEqual(set(self.cases),set(self.rows))
        base=self.base['mesh']
        for case in self.cases.values():
            self.assertEqual(case['stamp'],self.base['stamp'])
            for field in ['name','source','colorsBits','uvsBits']:
                self.assertEqual(case['mesh'][field],base[field])
            self.assertEqual(case['mesh']['indices'][:3],[0,2,1])
            for v in [0,2,1]:
                self.assertEqual(case['mesh']['positionsBits'][3*v:3*v+3],base['positionsBits'][3*v:3*v+3])

    def test_mutations_are_exactly_distant_and_do_not_rename_any_mesh(self):
        base=self.base['mesh']
        remove=copy.deepcopy(base)
        self.assertTrue(set(remove['indices'][6:9]).isdisjoint([0,2,1]))
        del remove['indices'][6:9]
        self.assertEqual(remove,self.cases['TESTDATA-remove-distant-face2']['mesh'])
        duplicate=copy.deepcopy(base)
        duplicate['indices']+=base['indices'][6:9]
        self.assertEqual(duplicate,self.cases['TESTDATA-duplicate-distant-face2']['mesh'])
        crossed=copy.deepcopy(base)
        crossed['positionsBits'][20]=0xbe800000
        self.assertEqual(crossed,self.cases['TESTDATA-selfcross-remote-v6']['mesh'])
        ordered=copy.deepcopy(base)
        ordered['indices'][6:12]=base['indices'][9:12]+base['indices'][6:9]
        self.assertEqual(ordered,self.cases['TESTDATA-valid-distant-face-order']['mesh'])

    def test_all_whole_source_native_digests_match_independent_hashlib(self):
        digests=set()
        for case in self.cases.values():
            computed=expected_source(case['mesh'],case['stamp'])
            self.assertEqual(computed,case['expected'])
            self.assertEqual(self.rows[case['id']]['sourceDigest'],computed['sourceDigest'])
            digests.add(computed['sourceDigest'])
        self.assertEqual(len(digests),5)
        self.assertFalse(self.actual['nativeCrypto']['monkeyPatched'])

    def test_independent_exact_closed_cube_topology_and_signed_volume(self):
        report=exact_model(self.base['mesh'])
        self.assertEqual((report['vertexCount'],report['faceCount'],report['edgeCount']),(8,12,18))
        self.assertEqual(report['edgeIncidenceHistogram'],{2:18})
        self.assertEqual(report['boundaryEdges'],[])
        self.assertEqual(report['nonManifoldEdges'],[])
        self.assertEqual(report['inconsistentTwoUseEdges'],[])
        self.assertEqual(len(report['faceComponents']),1)
        self.assertTrue(all(v['isSingleCycle'] for v in report['vertexLinks']))
        self.assertTrue(report['allNondegenerate'])
        self.assertEqual(report['exactSignedVolume'],'1')

    def test_selfcross_keeps_whole_topology_and_has_positive_exact_volume(self):
        positive=exact_model(self.base['mesh'])
        mesh=self.cases['TESTDATA-selfcross-remote-v6']['mesh']
        crossed=exact_model(mesh)
        for field in ['edgeIncidence','vertexLinks','faceComponents']:
            self.assertEqual(crossed[field],positive[field])
        self.assertTrue(crossed['allNondegenerate'])
        self.assertEqual(F(crossed['exactSignedVolume']),F(7,12))
        witness=exact_witness(mesh)  # Symbolic coefficient identities + endpoint positivity theorem.
        self.assertTrue(witness['exactPolynomialIdentityChecked'])
        self.assertTrue(witness['indexedDisjoint'])
        self.assertEqual(witness['positiveLengthSquared'],'1/25')
        self.assertEqual(witness,load('exact-intersection-witness.json'))
        self.assertIn([0,2],self.reports['TESTDATA-selfcross-remote-v6']['intersections'])

    def test_unchanged_complete_public_local_proof_verifies_all_cases(self):
        proof=load('actual-local-face-proof.json')
        summary=verify_bundle(proof)  # Existing inverse + unchanged complete bezier verifier ONCE for bundle.
        self.assertEqual(summary,dict(passed=True,cases=5,leaves=60,samples=65))
        first=copy.deepcopy(proof['cases'][0]); first.pop('id')
        for case in proof['cases']:
            local=copy.deepcopy(case); local.pop('id')
            self.assertEqual(local,first)
        self.assertTrue(all('PASS (binding' in r['localCandidate'] for r in self.rows.values()))

    def test_public_verifier_rejects_corrupted_control_not_blind_pass(self):
        proof=load('actual-local-face-proof.json')
        proof['cases'][0]['containment']['controls'][0][2]={'n':'1','d':'1'}
        with self.assertRaisesRegex(ValueError,'off-plane control'):
            verify_bundle(proof)

    def test_positive_required_checks_complete_and_minimum_thickness_unknown(self):
        for identity in ['TESTDATA-positive-S','TESTDATA-valid-distant-face-order']:
            row=self.rows[identity]
            self.assertTrue(row['observedRequiredAuditPass'])
            self.assertTrue(row['complete'])
            self.assertEqual(row['orientation'],'outward')
            self.assertEqual(row['signedVolume'],1)
            self.assertEqual(row['intersectionPairs'],[])
            self.assertEqual([s for k,s in row['checkStatuses'].items() if k!='minimum-thickness'],['pass']*8)
            self.assertEqual(row['checkStatuses']['minimum-thickness'],'unknown')

    def test_three_recomputed_digest_saved_old_pass_associations_are_untrusted(self):
        saved=load('actual-positive-audit.json')
        claims=load('synthetic-untrusted-saved-PASS-claims.json')['claims']
        self.assertEqual(len(claims),3)
        for claim in claims:
            identity=claim['caseId']; row=self.rows[identity]
            self.assertEqual(claim['unchangedSavedAudit'],saved)
            self.assertEqual(claim['recomputedSourceDigest'],row['sourceDigest'])
            self.assertNotEqual(claim['savedAuditOriginDigest'],row['sourceDigest'])
            self.assertFalse(row['observedRequiredAuditPass'])
            self.assertIn('fail',row['checkStatuses'].values())
            self.assertIn('UNTRUSTED',claim['label'])
        # The remote-v6 case keeps V/F counts AND all local fields; a report
        # shape/count check would not catch attaching the old PASS to it.
        x=self.rows['TESTDATA-selfcross-remote-v6']
        self.assertEqual(x['faceCount'],saved['triangleCount'])
        self.assertEqual(x['checkStatuses']['self-intersections'],'fail')
        self.assertEqual(x['orientation'],'unknown')
        self.assertFalse(x['complete'])  # Actual numeric ambiguity retained, not promoted to complete.

    def test_zero_pair_budget_is_unknown_not_auto_pass(self):
        r=self.actual['budgetZero']
        self.assertFalse(r['complete'])
        self.assertEqual(r['candidateTests'],0)
        self.assertEqual(r['selfIntersections'],'unknown')
        self.assertEqual(r['outward'],'unknown')
        self.assertFalse(r['observedRequiredAuditPass'])

    def test_independent_removed_duplicated_face_topology(self):
        removed=exact_model(self.cases['TESTDATA-remove-distant-face2']['mesh'])
        duplicate=exact_model(self.cases['TESTDATA-duplicate-distant-face2']['mesh'])
        self.assertEqual(len(removed['boundaryEdges']),3)
        self.assertEqual(removed['nonManifoldEdges'],[])
        self.assertEqual(sum(v['isSinglePath'] for v in removed['vertexLinks']),3)
        self.assertEqual(len(duplicate['nonManifoldEdges']),3)
        self.assertEqual(duplicate['boundaryEdges'],[])
        self.assertEqual(sum(not(v['isSinglePath'] or v['isSingleCycle']) for v in duplicate['vertexLinks']),3)


if __name__=='__main__':
    unittest.main(verbosity=2)
