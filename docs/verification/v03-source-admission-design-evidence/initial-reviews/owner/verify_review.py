"""Read-only design arithmetic/input witness; NOT an admission/runtime test."""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OWN = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-admission-owner-review')
EXPECTED = {
    'docs/plans/v03-source-admission-owner-design.md': '1504d3ae9596fe6456b648972e7388a8d28c26dced926cf66be6e7c1088c23ea',
    'docs/plans/v03-source-bound-spans-design.md': 'c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf',
}
start = json.loads((OWN / 'input-hashes-start.json').read_text(encoding='utf-8'))
end = {}
for name, previous in start.items():
    data = (ROOT / name).read_bytes()
    end[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    assert end[name] == previous, name
for name, digest in EXPECTED.items():
    assert end[name]['sha256'] == digest, name
assert len((ROOT / 'docs/plans/v03-source-admission-owner-design.md').read_bytes().splitlines()) == 248

# Verify only the PROPOSED byte-layout ranges. No audit reply is fabricated.
fields = [('magic', 0, 4), ('version', 4, 4), ('statuses', 8, 9),
          ('triangleCount', 20, 4), ('candidateTests', 24, 4),
          ('intersectionCount', 28, 4), ('signedVolume', 32, 8),
          ('elapsedMs', 40, 8), ('orientation', 48, 1), ('complete', 49, 1)]
used = set()
for name, offset, size in fields:
    span = set(range(offset, offset + size))
    assert not used.intersection(span), name
    assert offset >= 0 and offset + size <= 256
    used.update(span)
assert struct.calcsize('<I') == 4 and struct.calcsize('<d') == 8
padding = sorted(set(range(256)) - used)
assert padding == list(range(17, 20)) + list(range(50, 256))

# Reproduce sums of proposed segments, not measured audit/RSS bounds.
def aligned(n):
    return ((n + 7) // 8) * 8

def layout(vertices, faces, attrs):
    edges, nodes, height = 3 * faces, 2 * faces - 1, (faces - 1).bit_length()
    top = sum(map(aligned, [12 * edges, 4 * faces, faces, 4 * edges, edges,
                            4 * vertices, 4 * vertices, vertices]))
    spatial = sum(map(aligned, [24 * faces, 48 * faces, 4 * faces, 48 * nodes,
                               4 * nodes, 4 * nodes, 4 * nodes, 4 * nodes,
                               4 * (height + 2), 8 * (4 * height + 3),
                               2048, 128, 800]))
    data = 12 * vertices + 12 * faces + (20 * vertices if attrs else 0)
    return {'V': vertices, 'F': faces, 'RGB_UV': attrs, 'D': data, 'J': data + 66,
            'T': top, 'P': spatial, 'D_plus_arena': data + max(top, spatial)}

rows = [layout(4, 4, False), layout(200000, 200000, False), layout(200000, 200000, True)]
assert [(r['D'], r['J'], r['T'], r['P'], r['D_plus_arena']) for r in rows] == [
    (96, 162, 272, 3848, 3944),
    (4800000, 4800066, 13000000, 40803608, 45603608),
    (8800000, 8800066, 13000000, 40803608, 49603608),
]
# First G1a fixture is consistent but still requires real allocator tests later.
assert 768 + 257 > 1024 and 768 + 256 == 1024
assert 768 > 512  # job-to-history reclassification must refuse atomically.
result = {
    'kind': 'independent-design-witness-only',
    'input_files_unchanged': len(end),
    'plan_lines': 248,
    'wire': {'bytes': 256, 'nonoverlapping': True, 'specified_bytes': len(used),
             'zero_padding_bytes': len(padding), 'padding_ranges': [[17, 19], [50, 255]]},
    'proposed_arena_rows': rows,
    'G1a_fixture_arithmetic_consistent': True,
    'runtime_tests_executed': False,
    'native_worker_or_GC_or_RSS_proof': False,
}
(OWN / 'input-hashes-end.json').write_text(json.dumps(end, indent=2), encoding='utf-8')
(OWN / 'witness-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
