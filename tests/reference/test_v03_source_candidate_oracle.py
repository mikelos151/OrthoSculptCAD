"""Focused stdlib tests for the independent source-candidate test oracle."""
import unittest
import copy
import hashlib
import base64
import json
import math
import zlib
from pathlib import Path
import subprocess
import sys
from fractions import Fraction
import v03_source_candidate_oracle as oracle


def base_input():
    return ({'name': 'TESTDATA',
             'positionsBits': [0, 0, 0, 0x3f800000, 0, 0, 0, 0x3f800000, 0],
             'indices': [0, 1, 2]},
            {'projectEpoch': 0, 'revision': 0, 'generation': 0,
             'units': 'mm', 'unitsConfirmed': True, 'frameId': 'TESTDATA-frame'})


class OracleTests(unittest.TestCase):
    def test_base_preimage_matches_manual_byte_witness(self):
        self.assertTrue(callable(getattr(oracle, 'canonical_bytes', None)), 'missing canonical serializer')
        mesh, stamp = base_input()
        original = copy.deepcopy((mesh, stamp))
        witness = (b'OrthoSculptSourceCandidate\0' + bytes.fromhex(
            '01000000 03000000 01000000 '
            '00000000 00000000 00000000 0000803f 00000000 00000000 '
            '00000000 0000803f 00000000 00000000 01000000 02000000 '
            '00 00 00 08000000') + b'TESTDATA' + bytes.fromhex('00 02000000')
            + b'mm' + bytes.fromhex('01 0e000000') + b'TESTDATA-frame')
        actual = oracle.canonical_bytes(mesh, stamp)
        self.assertEqual(actual, witness)
        self.assertEqual(oracle.source_digest(mesh, stamp), 'sha256:' + hashlib.sha256(witness).hexdigest())
        self.assertEqual((mesh, stamp), original)

    def test_optional_attributes_and_metadata_match_manual_bytes(self):
        mesh, stamp = base_input()
        mesh.update(name='\u00e9\U0001f9b4', colorsBits=[0x3f800000, 0, 0x3f000000] * 3,
                    uvsBits=[0xbf800000, 0x40000000] * 3,
                    textureUrl='data:image/png;base64,QQ==', source='imported')
        stamp['frameId'] = 'X'
        prefix = (b'OrthoSculptSourceCandidate\0' + bytes.fromhex(
            '01000000 03000000 01000000 '
            '00000000 00000000 00000000 0000803f 00000000 00000000 '
            '00000000 0000803f 00000000 00000000 01000000 02000000'))
        uri = b'data:image/png;base64,QQ=='
        tail = (bytes.fromhex('06000000 c3a9 f09fa6b4 01')
                + len(uri).to_bytes(4, 'little') + uri
                + bytes.fromhex('02000000') + b'mm' + bytes.fromhex('01 01000000') + b'X')
        attrs = (b'\x01' + bytes.fromhex('0000803f 00000000 0000003f') * 3
                 + b'\x01' + bytes.fromhex('000080bf 00000040') * 3)
        original = copy.deepcopy((mesh, stamp))
        self.assertEqual(oracle.canonical_bytes(mesh, stamp), prefix + attrs + b'\x02' + tail)
        self.assertEqual((mesh, stamp), original)
        mesh['source'] = 'synthetic'
        self.assertEqual(oracle.canonical_bytes(mesh, stamp), prefix + attrs + b'\x01' + tail)
        del mesh['source']
        self.assertEqual(oracle.canonical_bytes(mesh, stamp), prefix + attrs + b'\x00' + tail)

    def test_reference_input_validation_without_coercion_or_normalization(self):
        self.assertTrue(callable(getattr(oracle, 'validate_input', None)), 'missing reference input validation')
        mesh, stamp = base_input()
        for name in ['', 'A' * 200, '\U0001f9b4' * 100, '\u007f\u0080\ufdd0\U0001fffe']:
            candidate = dict(mesh, name=name)
            oracle.canonical_bytes(candidate, stamp)
        for name in [None, 3, 'A' * 201, '\U0001f9b4' * 101, '\ud800', '\udfff', 'x\n', '\ufffe', '\uffff']:
            with self.subTest(name=ascii(name)), self.assertRaises(ValueError):
                oracle.canonical_bytes(dict(mesh, name=name), stamp)
        bad_meshes = []
        missing = dict(mesh)
        del missing['name']
        bad_meshes.append(missing)
        for field, values in {
            'positionsBits': [[0] * 8, [0] * 6, [0] * 99, [0, 0, 0, 0x7f800000, 0, 0, 0, 0, 0], [False] * 9, [0.0] * 9],
            'indices': [[0, 1], [0, 1, -1], [0, 1, 1.5], [0, 1, True], [0, 1, 3], [0, 1, 2**32], []],
            'source': [None, 'SYNTHETIC', 1],
            'colorsBits': [[0] * 8, [0x3f800001] * 9, [0xbf800000] * 9, None],
            'uvsBits': [[0] * 5, [0x7fc00000] * 6],
            'textureUrl': [None, 'https://example.invalid/TESTDATA.png', 'data:image/png;base64,', 'data:image/png;base64,QQ===', 'data:image/png;base64,\u00e9'],
        }.items():
            bad_meshes.extend(dict(mesh, **{field: value}) for value in values)
        for invalid in bad_meshes:
            original = copy.deepcopy(invalid)
            with self.subTest(invalid=ascii(invalid)), self.assertRaises(ValueError):
                oracle.canonical_bytes(invalid, stamp)
            self.assertEqual(invalid, original)
        for field, value in [('projectEpoch', True), ('revision', -1), ('generation', 2**53),
                             ('units', 'cm'), ('unitsConfirmed', 1), ('frameId', ''),
                             ('frameId', 'x' * 65), ('frameId', '\u00e9'), ('frameId', 'a b')]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                oracle.canonical_bytes(mesh, dict(stamp, **{field: value}))
        attributes = dict(mesh, uvsBits=[0xbf800000, 0x7f7fffff] * 3,
                          colorsBits=[0x80000000, 0, 0x3f800000] * 3)
        oracle.canonical_bytes(attributes, stamp)
        for mime in ['png', 'jpeg']:
            oracle.canonical_bytes(dict(attributes, textureUrl=f'data:image/{mime};base64,A'), stamp)
        # Combining sequences remain distinct; no Unicode normalization.
        self.assertNotEqual(oracle.source_digest(dict(mesh, name='\u00e9'), stamp),
                            oracle.source_digest(dict(mesh, name='e\u0301'), stamp))

    def test_every_ordered_face_uses_raw_bits_and_exact_rationals(self):
        self.assertTrue(callable(getattr(oracle, 'expected_source', None)), 'missing expected face materializer')
        mesh, stamp = base_input()
        mesh['positionsBits'] += [0x80000000, 1, 0x7f7fffff]
        mesh['indices'] = [2, 0, 1, 3, 1, 0]
        original = copy.deepcopy((mesh, stamp))
        z, one = {'n': '0', 'd': '1'}, {'n': '1', 'd': '1'}
        expected = oracle.expected_source(mesh, stamp)
        self.assertEqual(set(expected), {'sourceDigest', 'vertexCount', 'faceCount', 'faces'})
        self.assertEqual(expected['vertexCount'], 4)
        self.assertEqual(expected['faceCount'], 2)
        self.assertEqual(expected['sourceDigest'], oracle.source_digest(mesh, stamp))
        self.assertEqual(expected['faces'], [
            {'sourceFace': 0, 'vertexIDs': [2, 0, 1],
             'positionBits': [[0, 0x3f800000, 0], [0, 0, 0], [0x3f800000, 0, 0]],
             'triangle': [[z, one, z], [z, z, z], [one, z, z]]},
            {'sourceFace': 1, 'vertexIDs': [3, 1, 0],
             'positionBits': [[0x80000000, 1, 0x7f7fffff], [0x3f800000, 0, 0], [0, 0, 0]],
             'triangle': [[z, {'n': '1', 'd': str(2**149)},
                           {'n': str(16777215 * 2**104), 'd': '1'}], [one, z, z], [z, z, z]]},
        ])
        self.assertEqual((mesh, stamp), original)
        for field in ['projectEpoch', 'revision', 'generation']:
            self.assertEqual(oracle.source_digest(mesh, dict(stamp, **{field: 2**53 - 1})), expected['sourceDigest'])
        positive_zero = copy.deepcopy(mesh)
        positive_zero['positionsBits'][9] = 0
        changed = oracle.expected_source(positive_zero, stamp)
        self.assertNotEqual(changed['sourceDigest'], expected['sourceDigest'])
        self.assertEqual(changed['faces'][1]['triangle'], expected['faces'][1]['triangle'])
        self.assertNotEqual(changed['faces'][1]['positionBits'], expected['faces'][1]['positionBits'])

    def test_generated_matrix_literal_schema_and_whole_source_coverage(self):
        self.assertTrue(callable(getattr(oracle, 'generate_fixture', None)), 'missing bounded fixture generator')
        fixture = oracle.generate_fixture()
        self.assertEqual(set(fixture), {'format', 'version', 'cases'})
        self.assertEqual(fixture['format'], 'OrthoSculptSourceCandidateOracle')
        self.assertEqual(fixture['version'], 1)
        labels = ['tetra-base', 'distant-position', 'distant-index', 'face-order',
                  'face0-permutation', 'negative-zero', 'unreferenced-base', 'unreferenced-change',
                  'subnormal', 'largest-finite', 'rgb-base', 'rgb-distant', 'rgb-negativezero',
                  'uv-base', 'uv-distant', 'texture-png', 'texture-png-change', 'empty-name',
                  'unicode-name', 'unicode-decomposed', 'source-absent', 'source-imported-metadata-only',
                  'frame', 'epoch', 'revision', 'generation', 'all-attrs', 'all-attrs-namechange',
                  'dyadic', 'ordered-single-triangle', 'max-utf16-name']
        self.assertEqual([c['id'] for c in fixture['cases']], ['TESTDATA-' + label for label in labels])
        self.assertLessEqual(len(fixture['cases']), 32)
        self.assertEqual(len({c['id'] for c in fixture['cases']}), len(labels))
        for case in fixture['cases']:
            with self.subTest(case=case['id']):
                self.assertEqual(set(case), {'id', 'mesh', 'stamp', 'expected'})
                mesh, stamp, expected = case['mesh'], case['stamp'], case['expected']
                self.assertEqual(set(mesh) - {'name', 'positionsBits', 'indices', 'source', 'colorsBits', 'uvsBits', 'textureUrl'}, set())
                self.assertTrue({'name', 'positionsBits', 'indices'} <= set(mesh))
                self.assertEqual(set(stamp), {'projectEpoch', 'revision', 'generation', 'units', 'unitsConfirmed', 'frameId'})
                self.assertEqual(expected, oracle.expected_source(mesh, stamp))
                self.assertEqual([face['sourceFace'] for face in expected['faces']], list(range(expected['faceCount'])))
                for face in expected['faces']:
                    self.assertEqual(set(face), {'sourceFace', 'vertexIDs', 'positionBits', 'triangle'})
                    self.assertEqual(face['vertexIDs'], mesh['indices'][face['sourceFace'] * 3:face['sourceFace'] * 3 + 3])
                    for corner in range(3):
                        vertex = face['vertexIDs'][corner]
                        self.assertEqual(face['positionBits'][corner], mesh['positionsBits'][vertex * 3:vertex * 3 + 3])
                        for rat in face['triangle'][corner]:
                            self.assertEqual(set(rat), {'n', 'd'})
                            n, d = int(rat['n']), int(rat['d'])
                            self.assertEqual((str(n), str(d)), (rat['n'], rat['d']))
                            self.assertGreater(d, 0)
                            self.assertEqual(math.gcd(n, d), 1)
                if 'textureUrl' in mesh:
                    png = base64.b64decode(mesh['textureUrl'].split(',')[1], validate=True)
                    self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
                    offset, image = 8, bytearray()
                    while offset < len(png):
                        size = int.from_bytes(png[offset:offset + 4], 'big')
                        kind = png[offset + 4:offset + 8]
                        data = png[offset + 8:offset + 8 + size]
                        crc = int.from_bytes(png[offset + 8 + size:offset + 12 + size], 'big')
                        self.assertEqual(zlib.crc32(kind + data), crc)
                        if kind == b'IDAT':
                            image.extend(data)
                        offset += 12 + size
                    self.assertEqual(offset, len(png))
                    self.assertEqual(len(zlib.decompress(image)), 4)  # filter + RGB pixel
        by_id = {c['id'].removeprefix('TESTDATA-'): c for c in fixture['cases']}
        digest = lambda label: by_id[label]['expected']['sourceDigest']
        for label in ['epoch', 'revision', 'generation']:
            self.assertEqual(digest(label), digest('tetra-base'))
        for label in labels:
            if label not in ['tetra-base', 'epoch', 'revision', 'generation']:
                self.assertNotEqual(digest(label), digest('tetra-base'), label)
        for a, b in [('tetra-base', 'distant-position'), ('tetra-base', 'distant-index'),
                     ('unreferenced-base', 'unreferenced-change'), ('rgb-base', 'rgb-distant'),
                     ('uv-base', 'uv-distant'), ('texture-png', 'texture-png-change'),
                     ('all-attrs', 'all-attrs-namechange')]:
            self.assertEqual(by_id[a]['expected']['faces'][0], by_id[b]['expected']['faces'][0])
            self.assertNotEqual(digest(a), digest(b))
        self.assertEqual(by_id['tetra-base']['expected']['faces'][0]['triangle'],
                         by_id['negative-zero']['expected']['faces'][0]['triangle'])
        self.assertNotEqual(digest('unicode-name'), digest('unicode-decomposed'))
        self.assertNotEqual(digest('rgb-base'), digest('rgb-negativezero'))
        self.assertEqual(json.loads(json.dumps(fixture)), fixture)
        self.assertEqual(oracle.generate_fixture(), fixture)

    def test_cli_exports_executed_deterministic_fixture(self):
        self.assertTrue(callable(getattr(oracle, 'main', None)), 'missing exercised CLI')
        local_cache = Path.home() / ('AppData/Local' if sys.platform == 'win32' else '.cache')
        scratch = local_cache / 'hermes' / 'cache' / 'scratch' / 'v03-source-candidate-py'
        scratch.mkdir(parents=True, exist_ok=True)
        output = scratch / 'cli-fixture.json'
        command = [sys.executable, '-B', str(Path(oracle.__file__)), '--output', str(output)]
        run = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stderr, '')
        payload = output.read_bytes()
        fixture = json.loads(payload)
        self.assertEqual(fixture, oracle.generate_fixture())
        self.assertNotIn(b'\r', payload)
        self.assertTrue(payload.endswith(b'\n'))
        self.assertEqual(json.loads(run.stdout), {
            'caseCount': 31, 'faceCount': 121, 'bytes': len(payload),
            'sha256': hashlib.sha256(payload).hexdigest(),
        })
        frozen = Path(__file__).resolve().parents[1] / 'fixtures' / 'v03-source-candidate-oracle.json'
        # JSON is a test interchange, not a byte-authenticated proof file.
        # Permit Git text-checkout EOL changes without changing any literal data.
        frozen_fixture = json.loads(frozen.read_bytes())
        for case in frozen_fixture['cases']:
            oracle.validate_input(case['mesh'], case['stamp'])
        self.assertEqual(json.dumps(frozen_fixture, ensure_ascii=False, sort_keys=True),
                         json.dumps(fixture, ensure_ascii=False, sort_keys=True))

    def test_f32_integer_decode_known_dyadics_and_extremes(self):
        self.assertTrue(callable(getattr(oracle, 'decode_f32', None)), 'missing integer F32 decoder')
        witnesses = [
            (0x00000000, Fraction(0)), (0x80000000, Fraction(0)),
            (0x3f800000, Fraction(1)), (0xbf800000, Fraction(-1)),
            (0x3eaaaaab, Fraction(11184811, 33554432)),
            (0x00000001, Fraction(1, 2**149)),
            (0x807fffff, Fraction(-8388607, 2**149)),
            (0x00800000, Fraction(1, 2**126)),
            (0x7f7fffff, Fraction(16777215 * 2**104)),
            (0xff7fffff, Fraction(-16777215 * 2**104)),
        ]
        for bits, expected in witnesses:
            with self.subTest(bits=hex(bits)):
                self.assertEqual(oracle.decode_f32(bits), expected)
        for bad in [-1, 2**32, True, 1.0, '0', 0x7f800000, 0xff800000, 0x7fc00001]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                oracle.decode_f32(bad)


if __name__ == '__main__':
    unittest.main()
