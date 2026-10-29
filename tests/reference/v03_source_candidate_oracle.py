"""Independent synthetic test oracle; not a proof, import API or admission gate."""
from fractions import Fraction
import hashlib
import struct
import re
import copy
import base64
import zlib
import argparse
import json
from pathlib import Path


# Deliberately small static-fixture materialization bounds, not an import API.
MAX_REFERENCE_VERTICES = 32
MAX_REFERENCE_FACES = 32
MAX_TEXTURE_CHARS = ((16 * 1024 * 1024 + 2) // 3) * 4 + 64


def validate_input(mesh, stamp):
    """Validate literal fixture inputs before packing; never coerce originals."""
    if type(mesh) is not dict or type(stamp) is not dict:
        raise ValueError('mesh and stamp dictionaries required')
    name = mesh.get('name')
    if (type(name) is not str or sum(1 + (ord(c) > 0xffff) for c in name) > 200
            or any(ord(c) <= 31 or 0xd800 <= ord(c) <= 0xdfff
                   or ord(c) in (0xfffe, 0xffff) for c in name)):
        raise ValueError('invalid name')
    if 'source' in mesh and mesh['source'] not in ('synthetic', 'imported'):
        raise ValueError('invalid source')
    positions, indices = mesh.get('positionsBits'), mesh.get('indices')
    if (type(positions) is not list or len(positions) % 3
            or not 9 <= len(positions) <= MAX_REFERENCE_VERTICES * 3):
        raise ValueError('reference position shape limit')
    if (type(indices) is not list or len(indices) % 3
            or not 3 <= len(indices) <= MAX_REFERENCE_FACES * 3):
        raise ValueError('reference index shape limit')
    vertices = len(positions) // 3
    for bits in positions:
        decode_f32(bits)
    if any(type(i) is not int or not 0 <= i < vertices for i in indices):
        raise ValueError('invalid index')
    for field, stride in (('colorsBits', 3), ('uvsBits', 2)):
        if field in mesh:
            values = mesh[field]
            if type(values) is not list or len(values) != vertices * stride:
                raise ValueError('invalid attribute shape')
            for bits in values:
                value = decode_f32(bits)
                if field == 'colorsBits' and not 0 <= value <= 1:
                    raise ValueError('invalid RGB')
    if 'textureUrl' in mesh:
        value = mesh['textureUrl']
        if (type(value) is not str or len(value) > MAX_TEXTURE_CHARS
                or not re.fullmatch(r'data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}', value)
                or 'uvsBits' not in mesh):
            raise ValueError('invalid texture')
    for field in ('projectEpoch', 'revision', 'generation'):
        value = stamp.get(field)
        if type(value) is not int or not 0 <= value <= 2**53 - 1:
            raise ValueError('invalid stamp counter')
    if stamp.get('units') != 'mm' or stamp.get('unitsConfirmed') is not True:
        raise ValueError('confirmed mm required')
    frame = stamp.get('frameId')
    if type(frame) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', frame):
        raise ValueError('invalid frame')
    return vertices, len(indices) // 3


def canonical_bytes(mesh, stamp):
    """Normative whole-source preimage, with no padding or float conversion."""
    vertices, faces = validate_input(mesh, stamp)
    data = bytearray(b'OrthoSculptSourceCandidate\0')
    data.extend(struct.pack('<III', 1, vertices, faces))
    for field in ('positionsBits', 'indices'):
        for value in mesh[field]:
            data.extend(struct.pack('<I', value))
    for field in ('colorsBits', 'uvsBits'):
        data.append(int(field in mesh))
        if field in mesh:
            for value in mesh[field]:
                data.extend(struct.pack('<I', value))
    data.append({None: 0, 'synthetic': 1, 'imported': 2}[mesh.get('source')])
    name = mesh['name'].encode('utf-8')
    data.extend(struct.pack('<I', len(name)))
    data.extend(name)
    data.append(int('textureUrl' in mesh))
    if 'textureUrl' in mesh:
        texture = mesh['textureUrl'].encode('utf-8')
        data.extend(struct.pack('<I', len(texture)))
        data.extend(texture)
    for field in ('units', 'frameId'):
        encoded = stamp[field].encode('utf-8')
        data.extend(struct.pack('<I', len(encoded)))
        data.extend(encoded)
        if field == 'units':
            data.append(1)
    return bytes(data)


def source_digest(mesh, stamp):
    return 'sha256:' + hashlib.sha256(canonical_bytes(mesh, stamp)).hexdigest()


def expected_source(mesh, stamp):
    """Materialize all indexed faces in ordinal and ordered-corner order."""
    vertices, count = validate_input(mesh, stamp)
    faces = []
    for ordinal in range(count):
        ids = mesh['indices'][3 * ordinal:3 * ordinal + 3]
        bits = [mesh['positionsBits'][3 * i:3 * i + 3] for i in ids]
        triangle = []
        for corner in bits:
            point = []
            for raw in corner:
                value = decode_f32(raw)
                point.append({'n': str(value.numerator), 'd': str(value.denominator)})
            triangle.append(point)
        faces.append({'sourceFace': ordinal, 'vertexIDs': ids,
                      'positionBits': bits, 'triangle': triangle})
    return {'sourceDigest': source_digest(mesh, stamp), 'vertexCount': vertices,
            'faceCount': count, 'faces': faces}


def generate_fixture():
    """31 small synthetic TESTDATA cases; imported is a metadata-byte test only."""
    one, half = 0x3f800000, 0x3f000000
    base = {'name': 'TESTDATA tetra', 'source': 'synthetic',
            'positionsBits': [0, 0, 0, one, 0, 0, 0, one, 0, 0, 0, one],
            'indices': [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]}
    stamp = {'projectEpoch': 7, 'revision': 11, 'generation': 13,
             'units': 'mm', 'unitsConfirmed': True, 'frameId': 'TESTDATA_frame-A'}
    cases = []

    def add(label, mesh=None, source_stamp=None):
        case = {'id': 'TESTDATA-' + label,
                'mesh': copy.deepcopy(base if mesh is None else mesh),
                'stamp': copy.deepcopy(stamp if source_stamp is None else source_stamp)}
        cases.append(case)
        return case['mesh']

    def png_uri(pixel):
        def chunk(kind, data):
            return (struct.pack('>I', len(data)) + kind + data
                    + struct.pack('>I', zlib.crc32(kind + data)))
        # An actual 1x1 RGB PNG, not a decoder claim from its data URI prefix.
        png = (b'\x89PNG\r\n\x1a\n'
               + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(b'\0' + bytes(pixel), level=0))
               + chunk(b'IEND', b''))
        return 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')

    add('tetra-base')
    add('distant-position')['positionsBits'][9] = half
    add('distant-index')['indices'][9:12] = [0, 2, 3]
    add('face-order')['indices'][3:9] = base['indices'][6:9] + base['indices'][3:6]
    add('face0-permutation')['indices'][0:3] = [0, 1, 2]
    add('negative-zero')['positionsBits'][0] = 0x80000000
    unreferenced = copy.deepcopy(base)
    unreferenced['positionsBits'] += [0x40000000] * 3
    add('unreferenced-base', unreferenced)
    add('unreferenced-change', unreferenced)['positionsBits'][12] = 0x40400000
    add('subnormal')['positionsBits'][9:12] = [1, 0x807fffff, one]
    add('largest-finite')['positionsBits'][9:12] = [0x7f7fffff, 0xff7fffff, 0x00800000]
    rgb = dict(base, colorsBits=[0, half, one] * 4)
    add('rgb-base', rgb)
    add('rgb-distant', rgb)['colorsBits'][10] = 0x3e800000
    add('rgb-negativezero', rgb)['colorsBits'][0] = 0x80000000
    uv = dict(base, uvsBits=[0, 0, one, 0, 0, one, one, one])
    add('uv-base', uv)
    add('uv-distant', uv)['uvsBits'][6] = 0xbf800000
    textured = dict(uv, textureUrl=png_uri((255, 0, 127)))
    add('texture-png', textured)
    add('texture-png-change', textured)['textureUrl'] = png_uri((0, 255, 127))
    add('empty-name')['name'] = ''
    add('unicode-name')['name'] = 'TESTDATA-\u00e9-\U0001f9b4'
    add('unicode-decomposed')['name'] = 'TESTDATA-e\u0301-\U0001f9b4'
    del add('source-absent')['source']
    add('source-imported-metadata-only')['source'] = 'imported'
    add('frame', source_stamp=dict(stamp, frameId='TESTDATA_frame-B'))
    add('epoch', source_stamp=dict(stamp, projectEpoch=8))
    add('revision', source_stamp=dict(stamp, revision=12))
    add('generation', source_stamp=dict(stamp, generation=14))
    all_attrs = dict(textured, colorsBits=rgb['colorsBits'])
    add('all-attrs', all_attrs)
    add('all-attrs-namechange', all_attrs)['name'] = 'TESTDATA renamed full source'
    add('dyadic')['positionsBits'][9:12] = [0xbeaaaaab, 0x3e800000, 0x3fc00000]
    single = dict(base, positionsBits=base['positionsBits'][:9], indices=[2, 0, 1])
    add('ordered-single-triangle', single)
    add('max-utf16-name')['name'] = '\U0001f9b4' * 100
    for case in cases:
        case['expected'] = expected_source(case['mesh'], case['stamp'])
    return {'format': 'OrthoSculptSourceCandidateOracle', 'version': 1, 'cases': cases}


def decode_f32(bits):
    """Decode finite IEEE-754 binary32 by integer sign/exponent/significand."""
    if type(bits) is not int or not 0 <= bits <= 0xffffffff:
        raise ValueError('uint32 required')
    exponent = (bits >> 23) & 255
    if exponent == 255:
        raise ValueError('finite F32 required')
    significand = bits & 0x7fffff
    power = -149
    if exponent:
        significand += 1 << 23
        power = exponent - 150
    if bits >> 31:
        significand = -significand
    return (Fraction(significand << power) if power >= 0
            else Fraction(significand, 1 << -power))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True,
                        help='write the generated synthetic test fixture (UTF-8/LF)')
    args = parser.parse_args(argv)
    fixture = generate_fixture()
    payload = (json.dumps(fixture, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    args.output.write_bytes(payload)
    print(json.dumps({'caseCount': len(fixture['cases']),
                      'faceCount': sum(c['expected']['faceCount'] for c in fixture['cases']),
                      'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()},
                     sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
