"""Small exact DESIGN witnesses; not tests of a TS implementation."""
from fractions import Fraction as F
from pathlib import Path
import json
import re

lines = []
def record(label, value):
    lines.append(f"{label}: {value}")

A, B, C = (F(1), F(2), F(3)), (F(4), F(4), F(4)), (F(2), F(6), F(5))
E = tuple(b-a for a, b in zip(A, B))
G = tuple(c-a for a, c in zip(A, C))
minors = [E[r]*G[s]-E[s]*G[r] for r, s in [(0, 1), (0, 2), (1, 2)]]
W = [(F(1), F(0), F(0)), (F(1, 2), F(1, 3), F(1, 6)),
     (F(1, 6), F(1, 3), F(1, 2)), (F(0), F(0), F(1))]
P = [tuple(sum(w*v[k] for w, v in zip(weights, [A, B, C])) for k in range(3)) for weights in W]
recovered = []
for p in P:
    h = tuple(p[k]-A[k] for k in range(3))
    b = (h[0]*G[1]-h[1]*G[0])/minors[0]
    c = (E[0]*h[1]-E[1]*h[0])/minors[0]
    assert h[2] == b*E[2]+c*G[2]
    recovered.append((1-b-c, b, c))
assert recovered == W
record('SCOPE', 'DESIGN arithmetic only; no TS/Python implementation acceptance')
record('triangle', (A, B, C))
record('minors XY XZ YZ', minors)
record('mapped controls', P)
record('inverse recovered weights', recovered)
eps = F(1, 2**1100)
record('tinynegative exact sum', sum((-eps, 1+eps, F(0))))
record('tinynegative strictly negative', -eps < 0)
record('near-degenerate XY minor equals 2^-600', F(1, 2**600) != 0)
record('tolerance squared', F(1, 200)**2)
# Slightly bent chart controls: both inner D vectors = (-h, 0, h).
h = F(1, 1000)
chart_U = 2*h*h
world_U = sum((h*g)**2 for g in G)
scaled_world_U = world_U * 1000**2
assert chart_U <= F(1, 40000)
assert world_U <= F(1, 40000)
assert scaled_world_U > F(1, 40000)
record('world-metric witness weights', [(F(1), F(0), F(0)),
    (F(2, 3)-h, F(1, 3), h), (F(1, 3)-h, F(2, 3), h), (F(0), F(1), F(0))])
record('world-metric chart U', chart_U)
record('world-metric unscaled U', world_U)
record('world-metric scaled x1000 U', scaled_world_U)

plan = Path('C:/Users/sandr/OrthoSculptCAD/docs/plans/v03-face-cubic-containment.md')
blocks = re.findall(r'```json\n(.*?)\n```', plan.read_text(encoding='utf-8'), re.S)
assert len(blocks) == 1
schema = json.loads(blocks[0])
refs = []
def inspect(node):
    if isinstance(node, dict):
        if '$ref' in node:
            ref = node['$ref']
            assert ref.startswith('#/$defs/')
            assert ref[len('#/$defs/'):] in schema['$defs']
            refs.append(ref)
        if node.get('type') == 'object':
            assert node.get('additionalProperties') is False
            assert set(node['required']) == set(node['properties'])
        if node.get('type') == 'array':
            assert 0 < node['minItems'] <= node['maxItems']
        for child in node.values():
            inspect(child)
    elif isinstance(node, list):
        for child in node:
            inspect(child)
inspect(schema)
assert schema['properties']['format']['const'] == 'OrthoSculptFaceCubicProof'
assert set(schema['$defs']['Case']['properties']) == {'id', 'tolerance', 'containment', 'approximation'}
assert set(schema['$defs']['Containment']['properties']) == {'kind', 'triangle', 'barycentricControls', 'controls'}
assert set(schema['$defs']['Leaf']['properties']) == {'t0', 't1', 'controls', 'upperSquared'}
record('schema syntax', 'valid JSON; required/property equality and local references resolved')
record('schema definitions', len(schema['$defs']))
record('schema reference occurrences', len(refs))
record('schema limitation', 'stdlib structural check, not a general JSON Schema validator or implementation test')
text = '\n'.join(lines) + '\n'
print(text, end='')
Path(__file__).with_suffix('.log').write_text(text, encoding='utf-8')
