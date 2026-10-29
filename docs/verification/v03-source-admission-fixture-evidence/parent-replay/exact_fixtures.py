"""Scratch-only TESTDATA catalog + independent Fraction topology/witness.
No production audit clone; indexed incidence/link graphs + determinant sum only.
"""
from fractions import Fraction as F
from collections import defaultdict, Counter
from pathlib import Path
import copy
import json
import sys

ROOT = Path(__file__).resolve().parent
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
sys.dont_write_bytecode = True
sys.path.insert(0, str(REPO / 'tests/reference'))
from v03_source_candidate_oracle import decode_f32, expected_source

# Exact binary32 literals, no Float64->F32 or Fraction->float bridge.
B = {0: 0, 1: 0x3f800000, 2: 0x40000000, F(-1, 4): 0xbe800000}
CORNERS = [(0,0,0), (1,0,0), (1,1,0), (0,1,0),
           (0,0,1), (1,0,1), (1,1,1), (0,1,1)]
FACES = [(0,2,1), (0,3,2), (4,5,6), (4,6,7), (0,1,5), (0,5,4),
         (1,2,6), (1,6,5), (2,3,7), (2,7,6), (3,0,4), (3,4,7)]
STAMP = dict(projectEpoch=7, revision=11, generation=13,
             units='mm', unitsConfirmed=True, frameId='TESTDATA_fixed_frame')
WEIGHTS = [['1/2', '1/4', '1/4'], ['1/4', '1/2', '1/4'],
           ['1/4', '1/4', '1/2'], ['1/8', '1/2', '3/8']]

def dump(name, data):
    (ROOT / name).write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')

def vecsub(a, b):
    return tuple(x-y for x,y in zip(a,b))

def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def dot(a,b):
    return sum(x*y for x,y in zip(a,b))

def components(nodes, graph):
    pending = set(nodes)
    result = []
    while pending:
        seen = {min(pending)}
        todo = list(seen)
        while todo:
            for adjacent in graph[todo.pop()]:
                if adjacent not in seen:
                    seen.add(adjacent)
                    todo.append(adjacent)
        pending -= seen
        result.append(sorted(seen))
    return result

def exact_model(mesh):
    words = mesh['positionsBits']
    vertices = [tuple(decode_f32(b) for b in words[i:i+3]) for i in range(0,len(words),3)]
    faces = [tuple(mesh['indices'][i:i+3]) for i in range(0,len(mesh['indices']),3)]
    uses = defaultdict(list)
    face_graph = defaultdict(set)
    link_graphs = [defaultdict(list) for _ in vertices]
    for f, ids in enumerate(faces):
        for a,b in zip(ids,ids[1:]+ids[:1]):
            uses[tuple(sorted((a,b)))].append((f,a,b))
        for k,v in enumerate(ids):
            a,b = ids[(k+1)%3], ids[(k+2)%3]
            link_graphs[v][a].append(b)
            link_graphs[v][b].append(a)
    for incident in uses.values():
        for f,_,_ in incident:
            face_graph[f].update(g for g,_,_ in incident if g!=f)
    links = []
    for v, graph in enumerate(link_graphs):
        cc = components(graph, graph)
        degrees = {str(k): len(vs) for k,vs in sorted(graph.items())}
        degree_list = list(degrees.values())
        connected = len(cc)==1
        cycle = connected and all(d==2 for d in degree_list)
        path = connected and degree_list.count(1)==2 and all(d in (1,2) for d in degree_list)
        links.append(dict(vertex=v, degrees=degrees, components=cc,
                          isSingleCycle=cycle, isSinglePath=path))
    volume = sum(dot(vertices[a], cross(vertices[b],vertices[c])) for a,b,c in faces)/6
    nondeg = all(cross(vecsub(vertices[b],vertices[a]),vecsub(vertices[c],vertices[a])) != (0,0,0)
                 for a,b,c in faces)
    return dict(vertexCount=len(vertices), faceCount=len(faces), edgeCount=len(uses),
                edgeIncidence=[dict(edge=list(edge), uses=[list(x) for x in entries])
                               for edge,entries in sorted(uses.items())],
                edgeIncidenceHistogram=dict(sorted(Counter(len(v) for v in uses.values()).items())),
                boundaryEdges=[list(k) for k,v in sorted(uses.items()) if len(v)==1],
                nonManifoldEdges=[list(k) for k,v in sorted(uses.items()) if len(v)>2],
                inconsistentTwoUseEdges=[list(k) for k,v in sorted(uses.items())
                                        if len(v)==2 and v[0][1:]==v[1][1:]],
                faceComponents=components(range(len(faces)),face_graph), vertexLinks=links,
                allNondegenerate=nondeg, exactSignedVolume=str(volume))

def affine(vertices, weights):
    return tuple(sum(w*p[k] for w,p in zip(weights,vertices)) for k in range(3))

def exact_witness(mesh):
    # Derive from stored F32, not from a printed floating witness.
    decoded = [decode_f32(b) for b in mesh['positionsBits']]
    vertices = [tuple(decoded[i:i+3]) for i in range(0,len(decoded),3)]
    ids0,ids2 = mesh['indices'][:3],mesh['indices'][6:9]
    assert ids0==[0,2,1] and ids2==[4,5,6] and set(ids0).isdisjoint(ids2)
    a,b,c = [vertices[i] for i in ids2]
    # z(a)=z(b)=1, z(c)=-1/4 => exact c-weight 4/5; remaining weights sum 1/5.
    assert a[2]==b[2]==1 and c[2]==F(-1,4)
    wc = a[2]/(a[2]-c[2])
    assert wc==F(4,5)
    left = affine((a,b,c), (1-wc,F(0),wc))
    right = affine((a,b,c), (F(0),1-wc,wc))
    assert left==(F(4,5),F(4,5),F(0))
    assert right==(F(1),F(4,5),F(0)) and left!=right
    # Linear polynomials represented as (constant, coefficient of s). Verify
    # identity coefficient-by-coefficient, not by finitely sampling parameters.
    poly0=((F(1,5),F(-1,5)),(F(4,5),F(0)),(F(0),F(1,5)))
    poly2=((F(1,5),F(-1,5)),(F(0),F(1,5)),(F(4,5),F(0)))
    def affine_poly(ids, polynomials):
        return tuple(tuple(sum(w[j]*vertices[i][axis] for i,w in zip(ids,polynomials))
                           for j in range(2)) for axis in range(3))
    expected_poly=((F(4,5),F(1,5)),(F(4,5),F(0)),(F(0),F(0)))
    assert affine_poly(ids0,poly0)==affine_poly(ids2,poly2)==expected_poly
    for triple in (poly0,poly2):
        assert tuple(sum(w[j] for w in triple) for j in range(2))==(1,0)
        # w(s)=(1-s)*w(0)+s*w(1); nonnegative endpoints not both zero
        # imply strict positivity for EVERY real 0<s<1.
        assert all(a>=0 and a+b>=0 and max(a,a+b)>0 for a,b in triple)
    assert sum((x-y)**2 for x,y in zip(right,left))==F(1,25)
    witnesses=[]
    for s in [F(0),F(1,2),F(1)]:
        wb0=((1-s)/5,F(4,5),s/5)
        wb2=((1-s)/5,s/5,F(4,5))
        p=affine([vertices[i] for i in ids0],wb0)
        q=affine([vertices[i] for i in ids2],wb2)
        assert p==q and p==((4+s)/5,F(4,5),F(0))
        assert sum(wb0)==sum(wb2)==1 and min(*wb0,*wb2)>=0
        if 0<s<1:
            assert min(*wb0,*wb2)>0
        witnesses.append(dict(s=str(s),point=list(map(str,p)),
                              face0Barycentrics=list(map(str,wb0)),face2Barycentrics=list(map(str,wb2))))
    return dict(label='EXACT ANALYTICAL WITNESS; not a numerical audit output',
                indexedFaces=[ids0,ids2], indexedDisjoint=True,
                derivation='z=1-(5/4)*w6=0 forces w6=4/5; w4+w5=1/5. '
                           'Thus intersection with z=0 is the entire segment x in [4/5,1], y=4/5. '
                           'For every real s in (0,1), p(s)=((4+s)/5,4/5,0); '
                           'face0 weights=((1-s)/5,4/5,s/5), face2 weights=((1-s)/5,s/5,4/5). '
                           'All six weights strictly positive, each triple sums to 1. '
                           'Both parameterizations equal p(s) identically by distributivity; '
                           'therefore a continuum of relative-interior intersections, not legal shared incidence. '
                           'Endpoints below checked by Fraction; midpoint is only a check, not the continuum proof.',
                exactPolynomialIdentityChecked=True,
                worldAffinePolynomialCoefficients=[[str(a),str(b)] for a,b in expected_poly],
                face0WeightPolynomialCoefficients=[[str(a),str(b)] for a,b in poly0],
                face2WeightPolynomialCoefficients=[[str(a),str(b)] for a,b in poly2],
                continuumInteriorProof='Every weight is affine with nonnegative endpoint values, not both zero; '
                                       'strict convex interpolation makes all weights positive for every real 0<s<1.',
                positiveLengthSquared='1/25', witnesses=witnesses)

def generate():
    base=dict(name='TESTDATA corrected full S',source='synthetic',
              positionsBits=[B[x] for p in CORNERS for x in p],
              indices=[v for face in FACES for v in face],
              colorsBits=[0x3f000000]*24,uvsBits=[0]*16)
    cases=[]
    def add(case_id, mesh):
        expected=expected_source(mesh,STAMP)
        cases.append(dict(id=case_id,mesh=mesh,stamp=copy.deepcopy(STAMP),expected=expected))
    add('TESTDATA-positive-S',copy.deepcopy(base))
    removed=copy.deepcopy(base); del removed['indices'][6:9]
    add('TESTDATA-remove-distant-face2',removed)
    duplicate=copy.deepcopy(base); duplicate['indices']+=base['indices'][6:9]
    add('TESTDATA-duplicate-distant-face2',duplicate)
    crossed=copy.deepcopy(base); crossed['positionsBits'][20]=B[F(-1,4)]
    add('TESTDATA-selfcross-remote-v6',crossed)
    ordered=copy.deepcopy(base)
    ordered['indices'][6:12]=base['indices'][9:12]+base['indices'][6:9]
    add('TESTDATA-valid-distant-face-order',ordered)
    local_ids=base['indices'][:3]
    assert local_ids==[0,2,1] and set(FACES[2]).isdisjoint(local_ids)
    for case in cases:
        mesh=case['mesh']
        assert mesh['indices'][:3]==local_ids
        for field in ['name','source','colorsBits','uvsBits']:
            assert mesh[field]==base[field]
        for v in local_ids:
            assert mesh['positionsBits'][3*v:3*v+3]==base['positionsBits'][3*v:3*v+3]
        assert case['stamp']==STAMP
    assert len({c['expected']['sourceDigest'] for c in cases})==len(cases)
    raw=copy.deepcopy(base)
    for v in range(4,8): raw['positionsBits'][3*v+2]=B[2]
    baseline=copy.deepcopy(base)
    baseline['positionsBits']=[B[x+1] if k==0 else B[x] for p in CORNERS for k,x in enumerate(p)]
    assert raw['positionsBits']!=base['positionsBits']!=baseline['positionsBits']
    catalog=dict(label='SYNTHETIC TESTDATA / SCRATCH PROPOSAL CATALOG; NOT production reload protocol',
                 sourceOracleInputContract='literal current positionsBits/indices/name/source/colorsBits/uvsBits + stamp',
                 localFace=0,barycentricControls=WEIGHTS,cases=cases,
                 hypotheticalPreparation=dict(raw=raw,baselineB=baseline,
                     correctedSCase='TESTDATA-positive-S',
                     note='Explicit tiny synthetic geometry: corrected S height 1, raw height 2, separate B translated +1 X. '
                          'Not a repair/orient execution, anatomical/clinical data or production preparation claim.'))
    exact={c['id']:exact_model(c['mesh']) for c in cases}
    p=exact[cases[0]['id']]
    assert p['edgeIncidenceHistogram']=={2:18}
    assert p['exactSignedVolume']=='1' and len(p['faceComponents'])==1
    assert all(v['isSingleCycle'] for v in p['vertexLinks'])
    x=exact['TESTDATA-selfcross-remote-v6']
    assert x['edgeIncidence']==p['edgeIncidence'] and x['vertexLinks']==p['vertexLinks']
    assert F(x['exactSignedVolume'])>0 and x['allNondegenerate']
    assert len(exact['TESTDATA-remove-distant-face2']['boundaryEdges'])==3
    assert len(exact['TESTDATA-duplicate-distant-face2']['nonManifoldEdges'])==3
    dump('catalog.json',catalog)
    dump('exact-topology.json',exact)
    dump('exact-intersection-witness.json',exact_witness(crossed))
    print(json.dumps(dict(cases=len(cases),exactVolumes={k:v['exactSignedVolume'] for k,v in exact.items()},
                         baseClosedConnectedVertexCycles=True,selfcrossWitness='exact derived segment'),sort_keys=True))

if __name__=='__main__':
    generate()
