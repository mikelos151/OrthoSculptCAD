"""Read-only source inventory and design arithmetic; NOT implementation tests/RSS."""
from pathlib import Path
import hashlib, json, sys
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path(__file__).parent
FILES = [
 'docs/plans/trimline-v03-integrated-design.md',
 'docs/plans/trimline-v03-m0-implementation-plan.md',
 'docs/plans/v03-source-bound-spans-design.md',
 'src/trimline/source-candidate.ts', 'src/geometry/audit.ts',
 'src/geometry/auditTypes.ts', 'src/geometry/intersections.ts',
 'src/geometry/core.ts', 'src/hooks/runDisplayTask.ts',
 'src/hooks/workbenchState.ts', 'src/App.tsx',
] + [f'src/compute/{s}.ts' for s in ['client','copy','execute','index','measureAt','protocol','service','sliceEngine','types','worker']]
def align8(n): return (n + 7) // 8 * 8
def layouts(v, f, rgb=False, uv=False, name='S', frame='frame-1', texture=None):
    s = 12*v + 12*f + (12*v if rgb else 0) + (8*v if uv else 0)
    # Exact current source-candidate preimageSize(), valid UTF-8 scalars.
    p = len('OrthoSculptSourceCandidate\0') + 4 + 8 + s + 2 + 1 + 4 + len(name.encode()) + 1 + (0 if texture is None else 4+len(texture.encode())) + 4 + 2 + 1 + 4 + len(frame.encode())
    e, n, h = 3*f, 2*f-1, (f-1).bit_length()
    top_arrays = [4*3*e,4*f,f,4*e,e,4*v,4*v,v]
    spatial_arrays = [8*3*f,8*6*f,4*f,8*6*n,4*n,4*n,4*n,4*n,4*(h+2),4*2*(4*h+3),8*256,4*32,4*2*100]
    top, spatial = sum(map(align8,top_arrays)), sum(map(align8,spatial_arrays))
    return dict(V=v,F=f,S_buffer_bytes=s,current_preimage_bytes=p,current_capture_buffer_peak=s+p,proposed_topology_arena_bytes=top,proposed_spatial_arena_bytes=spatial,proposed_audit_arena_peak=max(top,spatial),proposed_S_plus_audit_arena=s+max(top,spatial),tree_nodes_upper=n,tree_height_upper=h,disclaimer='Arithmetic for PROPOSED future layouts, not current audit memory, implemented bound, RSS or benchmark.')
facts = {'head': sys.argv[1], 'branch': sys.argv[2]}
def git(*args): return facts['head' if args[0] == 'rev-parse' else 'branch']
result = {'kind':'read-only-design-inventory-v1','head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'files':[dict(path=s,bytes=len((ROOT/s).read_bytes()),lines=len((ROOT/s).read_text(encoding='utf-8').splitlines()),sha256=hashlib.sha256((ROOT/s).read_bytes()).hexdigest()) for s in FILES], 'current_domain_bytes':len('OrthoSculptSourceCandidate\0'), 'design_examples':[layouts(4,4), layouts(200000,200000),layouts(200000,200000,True,True)],'caps_proposed_only':{'jobs':128*1024**2,'history':128*1024**2,'managed':384*1024**2}, 'executed_geometry_tests':False,'memory_measured':False}
p = OUT/'inventory-and-arithmetic.json'
p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ['head','branch','current_domain_bytes','design_examples','caps_proposed_only','executed_geometry_tests','memory_measured']},indent=2))
print('Inventory written:',p)
