"""Read-only design witnesses; no production backend, admission or RSS claim.
Only output writes: this script's own scratch directory. Python stdlib only.
"""
from pathlib import Path
from fractions import Fraction
from collections import defaultdict
import hashlib
import json
import struct

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).resolve().parent
EXPECTED = '1504d3ae9596fe6456b648972e7388a8d28c26dced926cf66be6e7c1088c23ea'
DESIGN = ROOT / 'docs/plans/v03-source-admission-owner-design.md'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert sha(DESIGN) == EXPECTED

def align(x):
    return ((x + 7) // 8) * 8

def layout(v, f, attrs=False):
    e, n, h = 3*f, 2*f-1, (f-1).bit_length()
    t = [12*e, 4*f, f, 4*e, e, 4*v, 4*v, v]
    p = [24*f, 48*f, 4*f, 48*n, 4*n, 4*n, 4*n, 4*n,
         4*(h+2), 8*(4*h+3), 2048, 128, 800]
    def segments(sizes):
        at, parts = 0, []
        for size in sizes:
            parts.append({'offset': at, 'raw_bytes': size, 'aligned_bytes': align(size)})
            at += align(size)
        return at, parts
    tb, ts = segments(t)
    pb, ps = segments(p)
    d = 12*v + 12*f + (20*v if attrs else 0)
    # Reconstruct actual canonical M0c3a tetra preimage separately below.
    return {'V': v, 'F': f, 'attrs': attrs, 'E': e, 'N': n, 'H': h,
            'D': d, 'J': d+66, 'capture': 2*d+66,
            'T': tb, 'P': pb, 'arena': max(tb, pb), 'D_plus_arena': d+max(tb,pb),
            'T_segments': ts, 'P_segments': ps}

layouts = [layout(4,4), layout(200000,200000), layout(200000,200000,True)]
assert [(x['D'],x['J'],x['capture'],x['T'],x['P'],x['D_plus_arena']) for x in layouts] == [
    (96,162,258,272,3848,3944),
    (4800000,4800066,9600066,13000000,40803608,45603608),
    (8800000,8800066,17600066,13000000,40803608,49603608)]
for v in [3,4,5,31,200000]:
    for f in [1,2,3,4,5,15,16,17,199999,200000]:
        x = layout(v,f)
        for phase in ['T','P']:
            assert all(s['offset'] % 8 == 0 for s in x[phase+'_segments'])
            assert all(s['offset']+s['raw_bytes'] <= x[phase] for s in x[phase+'_segments'])

# One feasible *capacity* witness, NOT a verified predicate port or precision proof.
scratch_fields = [('triangles_xyz',18),('normals',6),('plane_distances',6),
                  ('shared_indexed_vertices_xyz',9),('two_sections_six_xyz_each',36),
                  ('two_clipping_polygons_16_xyz_each',96),('vector_temporaries',48),
                  ('intervals_and_projection',12),('scalar_temporaries',25)]
scratch, at = [], 0
for name, count in scratch_fields:
    scratch.append({'field':name,'offset_doubles':at,'count_doubles':count})
    at += count
assert at <= 256

points = [(0,0,0),(1,0,0),(0,1,0),(0,0,1)]
faces = [(0,2,1),(0,1,3),(0,3,2),(1,2,3)]

def det(a,b,c):
    return (a[0]*(b[1]*c[2]-b[2]*c[1])
            - a[1]*(b[0]*c[2]-b[2]*c[0])
            + a[2]*(b[0]*c[1]-b[1]*c[0]))

def oracle(p, fs):
    edges, links = defaultdict(list), defaultdict(lambda:defaultdict(list))
    adj = [set() for _ in fs]
    for f, tri in enumerate(fs):
        for k in range(3):
            v,a,b = tri[k],tri[(k+1)%3],tri[(k+2)%3]
            edges[tuple(sorted((v,a)))].append((f,v,a))
            links[v][a].append(b)
            links[v][b].append(a)
    for uses in edges.values():
        for f,_,_ in uses:
            adj[f].update(q for q,_,_ in uses if q != f)
    seen, components = set(), 0
    for seed in range(len(fs)):
        if seed in seen: continue
        components += 1
        pending = [seed]
        while pending:
            u = pending.pop()
            if u in seen: continue
            seen.add(u)
            pending.extend(adj[u]-seen)
    bad_links = []
    for v in range(len(p)):
        link = links[v]
        if not link:
            bad_links.append(v); continue
        seen, pending = set(), [next(iter(link))]
        while pending:
            u = pending.pop()
            if u in seen: continue
            seen.add(u); pending.extend(link[u])
        if len(seen) != len(link) or any(len(ns) != 2 for ns in link.values()):
            bad_links.append(v)
    return {'boundary':sum(len(us)==1 for us in edges.values()),
            'nonmanifold':sum(len(us)>2 for us in edges.values()),
            'components':components,'bad_closed_vertex_links':bad_links,
            'volume':str(sum((Fraction(det(p[a],p[b],p[c]),6) for a,b,c in fs),Fraction()))}

# Test T's available data: packed u32 triplets, heap sort, indexed twin, head,
# incidence counts and corner flags. Not a numerical audit or production code.
def arena_topology_witness(p, fs):
    v,f,e = len(p),len(fs),3*len(fs)
    spec = layout(v,f)
    arena = bytearray(spec['T'])
    seg = spec['T_segments']
    triplets = memoryview(arena)[seg[0]['offset']:seg[0]['offset']+12*e].cast('I')
    parent = memoryview(arena)[seg[1]['offset']:seg[1]['offset']+4*f].cast('I')
    twin = memoryview(arena)[seg[3]['offset']:seg[3]['offset']+4*e].cast('I')
    flags = memoryview(arena)[seg[4]['offset']:seg[4]['offset']+e]
    head = memoryview(arena)[seg[5]['offset']:seg[5]['offset']+4*v].cast('I')
    count = memoryview(arena)[seg[6]['offset']:seg[6]['offset']+4*v].cast('I')
    state = memoryview(arena)[seg[7]['offset']:seg[7]['offset']+v]
    nil = 0xffffffff
    for c in range(e): twin[c] = nil
    for i in range(v): head[i] = nil
    for i in range(f): parent[i] = i
    steps = comparisons = 0
    flat = tuple(c for face in fs for c in face)
    def nxt(c): return 3*(c//3)+(c+1)%3
    def prev(c): return 3*(c//3)+(c+2)%3
    for c in range(e):
        a,b = flat[c],flat[nxt(c)]
        triplets[3*c:3*c+3] = memoryview(struct.pack('III',min(a,b),max(a,b),c)).cast('I')
        head[a] = c; count[a] += 1; steps += 1
    def greater(i,j):
        nonlocal comparisons
        comparisons += 1
        for k in range(3):
            a,b = triplets[3*i+k],triplets[3*j+k]
            if a != b: return a>b
        return False
    def swap(i,j):
        for k in range(3):
            a = triplets[3*i+k]; triplets[3*i+k] = triplets[3*j+k]; triplets[3*j+k] = a
    def sift(i,end):
        while 2*i+1 < end:
            child = 2*i+1
            if child+1 < end and greater(child+1,child): child += 1
            if not greater(child,i): break
            swap(child,i); i = child
    for i in range(e//2-1,-1,-1): sift(i,e)
    for end in range(e-1,0,-1): swap(0,end); sift(0,end)
    def root(i):
        nonlocal steps
        hops = 0
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
            hops += 1; steps += 1
            assert hops <= f
        return i
    boundary = nonmanifold = winding = 0
    at = 0
    while at < e:
        end = at+1
        while end < e and triplets[3*end] == triplets[3*at] and triplets[3*end+1] == triplets[3*at+1]:
            end += 1; steps += 1
        first = triplets[3*at+2]
        for k in range(at+1,end):
            c = triplets[3*k+2]
            parent[root(c//3)] = root(first//3); steps += 1
        if end-at == 1: boundary += 1
        elif end-at > 2: nonmanifold += 1
        else:
            second = triplets[3*(at+1)+2]
            if flat[first] == flat[second]: winding += 1
            else: twin[first],twin[second] = second,first
        at = end
    components = sum(root(i)==i for i in range(f))
    # On valid closed winding-consistent edge topology, rotation enumerates all
    # corners around v. Compare cycle length with full incidence count.
    bad = []
    if not (boundary or nonmanifold or winding):
        for i in range(v):
            start,c,n = head[i],head[i],0
            if c == nil: bad.append(i); continue
            while not flags[c]:
                assert flat[c] == i
                flags[c] = 1; n += 1; steps += 1
                assert n <= e
                c = twin[prev(c)]
                assert c != nil
            state[i] = 1
            if c != start or n != count[i]: bad.append(i)
    step_cap = 32*e+16*v+16*f
    comparison_cap = 8*e*((max(2,e)-1).bit_length()+1)
    assert steps <= step_cap and comparisons <= comparison_cap
    return {'boundary':boundary,'nonmanifold':nonmanifold,'winding':winding,
            'components':components,'bad_closed_vertex_links':bad,
            'topology_steps_in_small_witness':steps,'step_cap':step_cap,
            'heapsort_comparisons':comparisons,'comparison_cap':comparison_cap,
            'arena_bytes':len(arena)}

# Dyadic midpoint subdivision preserves exact arithmetic, including volume.
p2 = [tuple(Fraction(x) for x in p) for p in points]
mids, f2 = {}, []
def midpoint(a,b):
    key = tuple(sorted((a,b)))
    if key not in mids:
        mids[key] = len(p2)
        p2.append(tuple((p2[a][k]+p2[b][k])/2 for k in range(3)))
    return mids[key]
for a,b,c in faces:
    ab,bc,ca = midpoint(a,b),midpoint(b,c),midpoint(c,a)
    f2.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
# Two closed tetrahedra sharing only V=0: all edges have two uses, bad fan.
pinch_points = points + [(2,0,0),(0,2,0),(0,0,-2)]
translate = {0:0,1:4,2:5,3:6}
pinch_faces = faces + [tuple(translate[c] for c in face) for face in faces]
# Subdivide again, then identify distant old vertices with disjoint stars.
# The remaining surface stays edge-connected; its identified vertex has two fans.
p3, f3, mids3 = list(p2), [], {}
def midpoint3(a,b):
    key = tuple(sorted((a,b)))
    if key not in mids3:
        mids3[key] = len(p3)
        p3.append(tuple((p3[a][k]+p3[b][k])/2 for k in range(3)))
    return mids3[key]
for a,b,c in f2:
    ab,bc,ca = midpoint3(a,b),midpoint3(b,c),midpoint3(c,a)
    f3.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
remap = {i:(0 if i==1 else i-1 if i>1 else 0) for i in range(len(p3))}
connected_pinch_points = [p for i,p in enumerate(p3) if i != 1]
connected_pinch_faces = [tuple(remap[c] for c in f) for f in f3]
fixtures = {}
for name,p,fs in [('tetra',points,faces),('subdivided_tetra',p2,f2),
                   ('hole',points,faces[:-1]),('duplicate',points,faces+[faces[-1]]),
                   ('pinched_vertex',pinch_points,pinch_faces),
                   ('connected_pinched_vertex',connected_pinch_points,connected_pinch_faces)]:

    independent, packed = oracle(p,fs), arena_topology_witness(p,fs)
    for field in ['boundary','nonmanifold','components']:
        assert independent[field] == packed[field]
    if not (packed['boundary'] or packed['nonmanifold'] or packed['winding']):
        assert independent['bad_closed_vertex_links'] == packed['bad_closed_vertex_links']
    fixtures[name] = {'independent_oracle':independent,'packed_T_witness':packed}
assert fixtures['tetra']['independent_oracle']['volume'] == '1/6'
assert fixtures['subdivided_tetra']['independent_oracle']['volume'] == '1/6'
assert fixtures['pinched_vertex']['packed_T_witness']['bad_closed_vertex_links'] == [0]
assert fixtures['connected_pinched_vertex']['packed_T_witness']['bad_closed_vertex_links'] == [0]
assert fixtures['connected_pinched_vertex']['packed_T_witness']['components'] == 1
assert fixtures['connected_pinched_vertex']['packed_T_witness']['boundary'] == 0
assert fixtures['connected_pinched_vertex']['packed_T_witness']['nonmanifold'] == 0

# Canonical no-attribute tetra byte count: compare to actual source formula.
def text(t):
    b = t.encode('utf-8'); return struct.pack('<I',len(b))+b
preimage = (b'OrthoSculptSourceCandidate\0' + struct.pack('<III',1,4,4)
    + b''.join(struct.pack('<f',n) for p in points for n in p)
    + b''.join(struct.pack('<I',n) for f in faces for n in f)
    + b'\0\0\0' + text('S') + b'\0' + text('mm') + b'\1' + text('frame-1'))
assert len(preimage) == 162

# Abstract balanced median DFS, actual leaf <=4. The original split choice is
# only one of the deterministic choices tried. No spatial predicate involved.
next_node = 0
def tree(f,depth=0):
    global next_node
    next_node += 1
    if f<=4: return (next_node,depth,None,None)
    a,b = tree(f//2,depth+1),tree(f-f//2,depth+1)
    return (next_node,depth,a,b)

def traversal(a,b,h,strategy):
    stack,peak,visits = [(a,b)],1,0
    while stack:
        a,b = stack.pop(); visits += 1
        assert a[1]+b[1] <= 2*h
        if a[2] is None and b[2] is None: continue
        if a is b:
            stack.extend([(a[2],a[2]),(a[2],a[3]),(a[3],a[3])])
        else:
            left = a[2] is not None and (b[2] is None or
                (strategy==0) or (strategy==2 and (visits%2==0)) or
                (strategy==3 and a[1]<=b[1]))
            if left: stack.extend([(a[2],b),(a[3],b)])
            else: stack.extend([(a,b[2]),(a,b[3])])
        peak = max(peak,len(stack))
        assert peak <= 4*h+3
    return peak,visits

stack_results = []
for f in [1,2,3,4,5,7,8,9,15,16,17,31,32,33,63,64,65,127,128,129]:
    root = tree(f); h = (f-1).bit_length()
    observed = [traversal(root,root,h,s) for s in range(4)]
    stack_results.append({'F':f,'H':h,'cap':4*h+3,'peak':max(p for p,v in observed),
                          'max_abstract_visits':max(v for p,v in observed)})

# This is an ambiguity witness, not an execution of a nonexistent ledger.
# Same backing lives in resident source AND an independent history reference.
category_counterexample = {'limits':{'managed':1024,'job':768,'history':512},
    'allocation_bytes':768,'references':['resident-source','history-undo'],
    'interpretation_allocation_category_unchanged':{'managed':768,'history':0,'retain':'accept'},
    'interpretation_history_membership_counts_backing':{'managed':768,'history':768,'retain':'refuse'},
    'why_material':'No extra data allocation occurs, but opposite history-cap outcomes; retain and category interaction not specified.'}

sources = ['docs/plans/v03-source-admission-owner-design.md',
           'docs/plans/v03-source-bound-spans-design.md',
           'docs/plans/trimline-v03-integrated-design.md',
           'src/geometry/audit.ts','src/geometry/core.ts','src/geometry/intersections.ts',
           'src/geometry/auditTypes.ts','src/trimline/source-candidate.ts',
           'src/compute/client.ts','src/compute/copy.ts','src/compute/index.ts',
           'src/compute/service.ts','src/compute/execute.ts','src/hooks/workbenchState.ts']
assert sha(DESIGN) == EXPECTED
result = {'kind':'independent-design-only-budget-witness', 'design_sha256':EXPECTED,
          'source_hashes':{p:sha(ROOT/p) for p in sources},
          'layouts':layouts,'canonical_tetra_preimage_bytes':len(preimage),
          'scratch_capacity_witness':{'doubles_used':at,'doubles_cap':256,'fields':scratch,
              'note':'Feasible capacity only; production offsets/lifetimes and conservative port remain G2 obligations.'},
          'topology_fixtures':fixtures,'abstract_stack_traversals':stack_results,
          'stack_reasoning':'Pair rank depth(a)+depth(b)<=2H; self expands by 3 with rank +2, cross by 2 with rank +1. Conservative DFS pending bound 1+2*(2H)<=4H+3.',
          'ledger_spec_counterexample':category_counterexample,
          'production_tests_run':False,'rss_measured':False}
(OUT/'witness-results.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'ok':True,'table_rows_verified':len(layouts),
                  'topology_fixture_count':len(fixtures),'stack_fixture_count':len(stack_results),
                  'scratch_doubles':at,'output':str(OUT/'witness-results.json')},ensure_ascii=False))
