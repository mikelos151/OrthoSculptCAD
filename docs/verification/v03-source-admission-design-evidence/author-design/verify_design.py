"""Bounded DESIGN witnesses only; no admission implementation test or RSS claim."""
from pathlib import Path
from fractions import Fraction as Q
from collections import defaultdict
import hashlib, json, sys

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).parent
HISTORY = OUT.parent
BASELINE = {
 'docs/plans/v03-source-bound-spans-design.md':'c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf',
 'src/trimline/source-candidate.ts':'983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b',
}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def align(n): return (n+7)//8*8

def layout(v,f,rgb=False,uv=False):
 e,n,h=3*f,2*f-1,(f-1).bit_length()
 d=12*v+12*f+(12*v if rgb else 0)+(8*v if uv else 0)
 t=sum(align(x) for x in [12*e,4*f,f,4*e,e,4*v,4*v,v])
 p=sum(align(x) for x in [24*f,48*f,4*f,48*n,4*n,4*n,4*n,4*n,4*(h+2),8*(4*h+3),2048,128,800])
 return dict(D=d,J=d+66,T=t,P=p,D_plus_arena=d+max(t,p),worker_payload_initial=d+(d+66)+max(t,p)+32+256)

def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def components(graph):
 unseen=set(graph); count=0
 while unseen:
  count+=1; stack=[unseen.pop()]
  while stack:
   for b in graph[stack.pop()]:
    if b in unseen: unseen.remove(b); stack.append(b)
 return count

def topology(points,faces):
 edges=defaultdict(list); links=[defaultdict(list) for _ in points]; facegraph={i:set() for i in range(len(faces))}
 volume=Q(0)
 for i,ids in enumerate(faces):
  a,b,c=(points[k] for k in ids); volume+=Q(dot(a,cross(b,c)),6)
  for k,u in enumerate(ids):
   v,w=ids[(k+1)%3],ids[(k+2)%3]
   edges[tuple(sorted((u,v)))].append((u,v,i)); links[u][v].append(w); links[u][w].append(v)
 for uses in edges.values():
  for a in uses:
   for b in uses:
    if a[2]!=b[2]: facegraph[a[2]].add(b[2])
 badlinks=sum(not link or components(link)!=1 or any(len(adj)!=2 for adj in link.values()) for link in links)
 boundary=sum(len(uses)==1 for uses in edges.values())
 nonmanifold=sum(len(uses)>2 for uses in edges.values())
 winding=sum(len(uses)==2 and uses[0][:2]==uses[1][:2] for uses in edges.values())
 return dict(V=len(points),F=len(faces),edges=len(edges),boundary=boundary,nonmanifold=nonmanifold,bad_closed_links=badlinks,winding=winding,components=components(facegraph),signed_volume=str(volume))

points=[tuple(map(Q,p)) for p in [(0,0,0),(1,0,0),(0,1,0),(0,0,1)]]
faces=[(0,2,1),(0,1,3),(0,3,2),(1,2,3)]
base=topology(points,faces)
assert base==dict(V=4,F=4,edges=6,boundary=0,nonmanifold=0,bad_closed_links=0,winding=0,components=1,signed_volume='1/6')
# One indexed midpoint per unoriented edge; all values dyadic and exactly F32.
p2=list(points); midpoint={}
def mid(a,b):
 key=tuple(sorted((a,b)))
 if key not in midpoint:
  midpoint[key]=len(p2); p2.append(tuple((x+y)/2 for x,y in zip(points[a],points[b])))
 return midpoint[key]
f2=[]
for a,b,c in faces:
 ab,bc,ca=mid(a,b),mid(b,c),mid(c,a)
 f2.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
positive=topology(p2,f2)
assert positive['signed_volume']=='1/6' and positive['boundary']==positive['bad_closed_links']==positive['nonmanifold']==positive['winding']==0 and positive['components']==1
# Mutate only distant face, keeping local face 0 and all its coordinates bit-identical.
hole=topology(p2,f2[:-1]); duplicate=topology(p2,f2+[f2[-1]])
assert hole['boundary']==3 and duplicate['nonmanifold']==3
assert f2[0] not in [f2[-1]] and not set(f2[0]) & set(f2[-1])
# Exact intersection witness: B edge from (0,-1,-1) to (0,-1,1)
# reaches (0,-1,0) at t=1/2; barycentrics (3/8,3/8,1/4) in A.
A=[tuple(map(Q,p)) for p in [(-2,-2,0),(2,-2,0),(0,2,0)]]
B=[tuple(map(Q,p)) for p in [(0,-1,-1),(0,-1,1),(0,1,0)]]
w=tuple((x+y)/2 for x,y in zip(B[0],B[1]))
weights=[Q(3,8),Q(3,8),Q(1,4)]
assert tuple(sum(weights[i]*A[i][k] for i in range(3)) for k in range(3))==w==(Q(0),Q(-1),Q(0))
# Nonzero segment witness from above point to B[2], with both inside A.
assert tuple(sum([Q(1,8),Q(1,8),Q(3,4)][i]*A[i][k] for i in range(3)) for k in range(3))==B[2]
# distinct raw, corrected S, and baseline B; outward volumes remain separate.
scaled={}
for name,scale in [('raw',1),('S',2),('B',3)]:
 scaled[name]=topology([tuple(scale*x for x in p) for p in points],faces)['signed_volume']
assert scaled=={'raw':'1/6','S':'4/3','B':'9/2'}

inventory=json.loads((HISTORY/'inventory-and-arithmetic.json').read_text(encoding='utf-8'))
layouts=[layout(4,4),layout(200000,200000),layout(200000,200000,True,True)]
for new,old in zip(layouts,inventory['design_examples']):
 for a,b in [('D','S_buffer_bytes'),('J','current_preimage_bytes'),('T','proposed_topology_arena_bytes'),('P','proposed_spatial_arena_bytes'),('D_plus_arena','proposed_S_plus_audit_arena')]:
  assert new[a]==old[b],(a,new,old)
# Conservative balanced median height and DFS-pair stack count over finite abstract trees.
# This checks one explicit traversal schedule, not a proof of a future implementation.
def tree(n):
 if n<=4: return n
 return (tree(n//2),tree(n-n//2))
def maxstack(n):
 root=tree(n); stack=[(root,root)]; peak=1
 while stack:
  a,b=stack.pop(); la=isinstance(a,int); lb=isinstance(b,int)
  if la and lb: continue
  if a is b: stack.extend([(a[0],a[0]),(a[0],a[1]),(a[1],a[1])])
  elif not la: stack.extend([(a[0],b),(a[1],b)])
  else: stack.extend([(a,b[0]),(a,b[1])])
  peak=max(peak,len(stack))
 return peak
stackcases=[]
for n in [1,4,5,8,16,31,64,127,256]:
 peak=maxstack(n); bound=4*(n-1).bit_length()+3
 assert peak<=bound
 stackcases.append(dict(F=n,peak=peak,bound=bound))
for p,expected in BASELINE.items(): assert sha(ROOT/p)==expected,(p,'changed')
assert Q(1,200)+Q(1,200)+Q(1,100)==Q(1,50)
# Git subprocess is blocked in the Python sandbox; actual shell results passed literally.
head=sys.argv[1]
status=sys.argv[2]
assert head==inventory['head']
assert status.strip()=='?? docs/plans/v03-source-admission-owner-design.md',status
result={
 'kind':'design-witness-not-implementation-test', 'head':head,
 'source_hashes_verified':BASELINE,'historical_sha256':{p:sha(HISTORY/p) for p in ['design_inventory.py','inventory-and-arithmetic.json','design-inventory.log']},
 'layouts':layouts,'tetra':base,'subdivided_tetra':positive,'hole_mutant':hole,'duplicate_mutant':duplicate,
 'local_face_unchanged_and_disjoint_from_mutated_face':True,
 'analytic_intersection':{'segment':[['0','-1','0'],['0','1','0']],'A_bary_at_start':['3/8','3/8','1/4'],'A_bary_at_end':['1/8','1/8','3/4']},
 'raw_S_B_volumes':scaled,'finite_abstract_stack_cases':stackcases,
 'error_budget_sum_mm':'1/50','git_status':status.strip(),
 'implementation_tests_executed':False,'native_workers_executed':False,'rss_measured':False,
}
(OUT/'witness-results.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
