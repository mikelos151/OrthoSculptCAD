import { expect, it } from 'vitest';
import * as geo from '../src/geometry';
import type { MeshData, Vec2 } from '../src/types';
import earcut from 'earcut';
import { buildShell } from '../src/manufacturing/shell';
import { Triangle, Vector3 } from 'three';

function prism(levels = [0, 50, 100], polygon?: Vec2[], closed = true): MeshData {
  const ring: Vec2[] = polygon ?? Array.from({ length: 32 }, (_, i) => [30 * Math.cos(i * Math.PI / 16), 30 * Math.sin(i * Math.PI / 16)]);
  const n = ring.length, p: number[] = [], ix: number[] = [];
  for (const z of levels) for (const [x, y] of ring) p.push(x, y, z);
  for (let l = 0; l < levels.length - 1; l++) for (let i = 0; i < n; i++) {
    const a = l * n + i, b = l * n + (i + 1) % n;
    ix.push(a, b, b + n, a, b + n, a + n);
  }
  const cap = earcut(ring.flat());
  for (let i = 0; i < cap.length; i += 3) {
    ix.push(cap[i], cap[i + 2], cap[i + 1]);
    if (closed) ix.push((levels.length - 1) * n + cap[i], (levels.length - 1) * n + cap[i + 1], (levels.length - 1) * n + cap[i + 2]);
  }
  return { name: 'v02 analytic prism', source: 'synthetic', positions: new Float32Array(p), indices: new Uint32Array(ix) };
}

it('left registration uses patient-right +X without reflection and returns the actual column-major transform', () => {
  const mesh = prism();
  mesh.colors = new Float32Array(mesh.positions.length).fill(0.3);
  mesh.uvs = new Float32Array(mesh.positions.length / 3 * 2).fill(0.2);
  mesh.textureUrl = 'blob:local';
  const picks = { distal: [0, 0, 0] as [number, number, number], anterior: [0, 30, 90] as [number, number, number], lateral: [-30, 0, 90] as [number, number, number] };
  const result = geo.registerLandmarksDetailed(mesh, picks, 7, 'left');
  const m = result.matrix;
  expect(m).toHaveLength(16);
  const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  expect(determinant).toBeCloseTo(1, 10);
  for (let i = 0; i < mesh.positions.length; i += 3) for (let k = 0; k < 3; k++)
    expect(result.mesh.positions[i + k]).toBeCloseTo(m[k] * mesh.positions[i] + m[4 + k] * mesh.positions[i + 1] + m[8 + k] * mesh.positions[i + 2] + m[12 + k], 4);
  expect(geo.registerLandmarks(mesh, picks, 0, 'left').positions).toEqual(mesh.positions);
  expect(() => geo.registerLandmarks(mesh, picks, 0, 'right')).toThrow(/chirality|laterality/i);
  expect(() => geo.registerLandmarks(mesh, picks, 0, 'unspecified' as 'left')).toThrow(/side|laterality/i);
  expect(result.mesh.colors).toEqual(mesh.colors); expect(result.mesh.colors).not.toBe(mesh.colors);
  expect(result.mesh.uvs).toEqual(mesh.uvs); expect(result.mesh.textureUrl).toBe(mesh.textureUrl); expect(result.mesh.source).toBe('synthetic');
});

it('full audit distinguishes actual 3D crossings from edge topology and signed volume', () => {
  const mesh: MeshData = { name: 'crossing triangles', positions: new Float32Array([-2,-2,0, 2,-2,0, 0,2,0, 0,-1,-1, 0,-1,1, 0,1,0]), indices: new Uint32Array([0,1,2,3,4,5]) };
  const result = geo.auditMesh(mesh);
  expect(result.complete).toBe(true);
  expect(result.intersections).toEqual([[0, 1]]);
  expect(result.checks.find(c => c.id === 'self-intersections')?.status).toBe('fail');
  expect(result.orientation).toBe('unknown');
  expect(result.checks.find(c => c.id === 'components')?.status).toBe('fail');
  const valid = geo.auditMesh(prism());
  expect(valid.complete).toBe(true); expect(valid.intersections).toEqual([]);
  expect(valid.orientation).toBe('outward');
  expect(valid.checks.find(c => c.id === 'minimum-thickness')?.status).toBe('unknown');
});

it('repair safely turns a reversed closed cylinder outward before relief, preserving all source attributes', () => {
  const reversed=prism();
  for(let t=0;t<reversed.indices.length;t+=3) [reversed.indices[t+1],reversed.indices[t+2]]=[reversed.indices[t+2],reversed.indices[t+1]];
  reversed.colors=new Float32Array(reversed.positions.length).fill(0.4);
  reversed.uvs=new Float32Array(reversed.positions.length/3*2).fill(0.2);
  reversed.textureUrl='blob:local';
  const before=reversed.indices.slice(), repaired=geo.repairMesh(reversed);
  expect(repaired.report.signedVolume).toBeGreaterThan(0);
  const brushed=geo.applyBrush(repaired.mesh,{center:[30,0,50],radius:5,strength:1,mode:'relief'});
  expect(brushed.positions[32*3]).toBeGreaterThan(30.9);
  expect(reversed.indices).toEqual(before);
  expect(repaired.mesh.colors).toEqual(reversed.colors); expect(repaired.mesh.uvs).toEqual(reversed.uvs); expect(repaired.mesh.textureUrl).toBe(reversed.textureUrl); expect(repaired.mesh.source).toBe(reversed.source);
  expect(geo.orientMesh(reversed).changed).toBe(true);
  expect(geo.orientMesh(repaired.mesh).changed).toBe(false);
});

it('unrepaired inward or nonplanar open meshes cannot silently turn relief into inward motion or heatmap blue', () => {
  const reversed=prism();
  for(let t=0;t<reversed.indices.length;t+=3) [reversed.indices[t+1],reversed.indices[t+2]]=[reversed.indices[t+2],reversed.indices[t+1]];
  expect(()=>geo.applyBrush(reversed,{center:[30,0,50],radius:5,strength:1,mode:'relief'})).toThrow(/outward|orientation|orient/i);
  const moved={...reversed,positions:reversed.positions.slice()}; moved.positions[96]=29;
  expect(()=>geo.deformationColors(moved,reversed.positions)).toThrow(/outward|orientation|orient/i);
  const open=prism([0,50,100],undefined,false);
  expect(geo.auditMesh(open).signedVolume).toBeGreaterThan(0);
  expect(geo.auditMesh(open).orientation).toBe('unknown');
  expect(geo.orientMesh(open).changed).toBe(false);
  expect(()=>geo.applyBrush(open,{center:[30,0,50],radius:5,strength:1,mode:'relief'})).toThrow(/outward|orientation|orient/i);
});

it('shell refuses the actual crossing outer offset of a narrow U-shaped surface', () => {
  const u: Vec2[]=[[-30,-30],[30,-30],[30,30],[2,30],[2,-10],[-2,-10],[-2,30],[-30,30]];
  const input=prism([0,50,100],u,false);
  expect(geo.validateMesh(input).inconsistentEdges).toBe(0);
  expect(()=>buildShell(input,{thickness:3,flareAngle:0,flareRadius:0})).toThrow(/przeci|intersection|audit/i);
});

it('adjacent nearly coplanar noncoplanar triangles share only their indexed edge, without false crossing', () => {
  const mesh: MeshData={name:'demo outer adjacent faces',positions:new Float32Array([21.829456329345703,45.8409309387207,195.9744415283203,18.46421241760254,47.33041000366211,199.95639038085938,21.9089412689209,46.154563903808594,199.9351806640625,18.515071868896484,47.653900146484375,203.91830444335938]),indices:new Uint32Array([0,1,2,2,1,3])};
  const result=geo.auditMesh(mesh);
  expect(result.intersections).toEqual([]); expect(result.complete).toBe(true);
});

it('automatic PCA rejects an isotropic proximal axis instead of publishing an arbitrary frame', () => {
  const cube=prism([0,30,60],[[-30,-30],[30,-30],[30,30],[-30,30]]);
  expect(()=>geo.alignPCA(cube)).toThrow(/ambiguous/i);
});

it('shell refuses UNKNOWN from an exhausted 3D audit rather than relying on positive edge-watertight volume', () => {
  expect(()=>buildShell(prism([0,50,100],undefined,false),{thickness:3,flareAngle:0,flareRadius:0},{maxPairTests:0})).toThrow(/UNKNOWN|audit/i);
});

const pairCases: Array<{name:string; positions:number[]; indices:number[]; status:'pass'|'fail'}>=[
  {name:'coplanar overlap with no shared indices',positions:[0,0,0,2,0,0,0,2,0, .2,.2,0,1,.2,0,.2,1,0],indices:[0,1,2,3,4,5],status:'fail'},
  {name:'coplanar shared-edge overlap beyond the edge',positions:[0,0,0,2,0,0,0,2,0,1,1,0],indices:[0,1,2,1,0,3],status:'fail'},
  {name:'legitimate coplanar shared edge',positions:[0,0,0,2,0,0,0,2,0,1,-1,0],indices:[0,1,2,1,0,3],status:'pass'},
  {name:'shared vertex with overlapping coplanar interiors',positions:[0,0,0,2,0,0,0,2,0,1,0,0,0,1,0],indices:[0,1,2,0,3,4],status:'fail'},
  {name:'shared vertex with transverse crossing beyond it',positions:[0,0,0,2,0,0,0,2,0,1,1,1,1,1,-1],indices:[0,1,2,0,3,4],status:'fail'},
  {name:'legitimate noncoplanar shared vertex',positions:[0,0,0,2,0,0,0,2,0,-1,0,1,0,-1,1],indices:[0,1,2,0,3,4],status:'pass'},
  {name:'duplicate indexed triangle',positions:[0,0,0,2,0,0,0,2,0],indices:[0,1,2,2,1,0],status:'fail'},
  {name:'unwelded geometric vertex contact',positions:[0,0,0,2,0,0,0,2,0,2,0,0,3,0,0,2,-1,0],indices:[0,1,2,3,4,5],status:'fail'},
  {name:'disjoint coplanar triangles with overlapping AABBs',positions:[0,0,0,2,0,0,0,2,0,2,2,0,1.5,2,0,2,1.5,0],indices:[0,1,2,3,4,5],status:'pass'},
];
for(const fixture of pairCases) it(`audit handles ${fixture.name}`,()=>{
  const result=geo.auditMesh({name:fixture.name,positions:new Float32Array(fixture.positions),indices:new Uint32Array(fixture.indices)});
  expect(result.complete).toBe(true);
  expect(result.checks.find(c=>c.id==='self-intersections')?.status).toBe(fixture.status);
});

it('positive signed volume and closed manifold edges do not conceal overlapping closed surfaces',()=>{
  const a=prism(), b=prism();
  for(let i=0;i<b.positions.length;i+=3) b.positions[i]+=15;
  const combined:MeshData={name:'overlapping closed cylinders',positions:new Float32Array([...a.positions,...b.positions]),indices:new Uint32Array([...a.indices,...Array.from(b.indices,i=>i+a.positions.length/3)])};
  expect(geo.validateMesh(combined).watertight).toBe(true); expect(geo.validateMesh(combined).signedVolume).toBeGreaterThan(0);
  const result=geo.auditMesh(combined);
  expect(result.intersections.length).toBeGreaterThan(0); expect(result.checks.find(c=>c.id==='self-intersections')?.status).toBe('fail'); expect(result.orientation).toBe('unknown');
});

it('vertex fans and edge-connected components are checked independently of closed edges',()=>{
  const mesh:MeshData={name:'two tetrahedra pinched at one vertex',positions:new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1,-1,0,0,0,-1,0,0,0,-1]),indices:new Uint32Array([0,2,1,0,1,3,0,3,2,1,2,3,0,4,5,0,6,4,0,5,6,4,6,5])};
  const result=geo.auditMesh(mesh);
  expect(geo.validateMesh(mesh).watertight).toBe(true);
  expect(result.checks.find(c=>c.id==='edge-manifold')?.status).toBe('pass');
  expect(result.checks.find(c=>c.id==='vertex-manifold')?.status).toBe('fail');
  expect(result.checks.find(c=>c.id==='components')?.status).toBe('fail'); expect(result.orientation).toBe('unknown');
});

it('pair budgets and near-coplanar numeric ambiguity are UNKNOWN, never PASS',()=>{
  const budget=geo.auditMesh(prism(),{maxPairTests:0});
  expect(budget.complete).toBe(false); expect(budget.candidateTests).toBe(0);
  expect(budget.checks.find(c=>c.id==='self-intersections')?.status).toBe('unknown'); expect(budget.orientation).toBe('unknown');
  const uncertain=geo.auditMesh({name:'near-coplanar crossing',positions:new Float32Array([0,0,0,2,0,0,0,2,0,.2,.2,1e-11,1,.2,-1e-11,.2,1,1e-11]),indices:new Uint32Array([0,1,2,3,4,5])});
  expect(uncertain.complete).toBe(false); expect(uncertain.checks.find(c=>c.id==='self-intersections')?.status).toBe('unknown');
  expect(()=>geo.auditMesh(prism(),{maxPairTests:Infinity})).toThrow(/budget/i);
  expect(()=>geo.auditMesh(prism(),{maxIntersections:0})).toThrow(/budget/i);
});

it('normal offset labels its unproven minimum thickness rather than claiming a constant 3mm wall',()=>{
  const result=buildShell(prism([0,50,100],[[-30,-30],[30,-30],[30,30],[-30,30]],false),{thickness:3,flareAngle:0,flareRadius:0});
  const mesh=result.mesh, n=mesh.positions.length/6;
  const point=(i:number)=>new Vector3().fromArray(mesh.positions,i*3);
  let witness=Infinity;
  for(let i=0;i<n;i++) for(let t=0;t<mesh.indices.length;t+=3) {
    const ids=Array.from(mesh.indices.slice(t,t+3));
    if(ids.every(id=>id>=n)) witness=Math.min(witness,new Triangle(point(ids[0]),point(ids[1]),point(ids[2])).closestPointToPoint(point(i),new Vector3()).distanceTo(point(i)));
  }
  expect(witness).toBeGreaterThan(0); expect(witness).toBeLessThan(2.9);
  expect(result.warnings.join(' ')).toMatch(/NIE jest gwarantowaną minimalną grubością/i);
  expect(geo.auditMesh(result.mesh).checks.find(c=>c.id==='minimum-thickness')?.status).toBe('unknown');
});

it('tiny valid meshes are audited without normal-normalization exceptions',()=>{
  const mesh=prism(); mesh.positions=mesh.positions.map(x=>x*1e-9);
  const result=geo.auditMesh(mesh);
  expect(result.complete).toBe(true); expect(result.intersections).toEqual([]);
});

it('audit resource cap returns UNKNOWN before allocating large topology maps',()=>{
  const indices=new Uint32Array(200_001*3);
  for(let i=0;i<indices.length;i++) indices[i]=i%3;
  const result=geo.auditMesh({name:'bounded audit resource fixture',positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices});
  expect(result.complete).toBe(false); expect(result.candidateTests).toBe(0);
  expect(result.checks.find(c=>c.id==='edge-manifold')?.status).toBe('unknown');
  expect(result.checks.find(c=>c.id==='self-intersections')?.status).toBe('unknown');
});

it('PCA rejects a candidate that overflows after Float32 storage instead of publishing Infinity',()=>{
  const mesh=prism();
  for(let i=0;i<mesh.positions.length;i+=3) { mesh.positions[i]*=1e36; mesh.positions[i+1]*=1e36; mesh.positions[i+2]=(mesh.positions[i+2]-50)*6e36; }
  expect(()=>geo.alignPCA(mesh)).toThrow(/finite/i);
});

it('shell preserves and remaps source RGB/UV on both surface layers without mutating the source',()=>{
  const mesh=prism(); mesh.colors=Float32Array.from(mesh.positions,(_,i)=>(i%5)/5); mesh.uvs=Float32Array.from({length:mesh.positions.length/3*2},(_,i)=>(i%3)/3); mesh.textureUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
  const result=buildShell(mesh,{thickness:3,flareAngle:0,flareRadius:0}).mesh;
  const n=result.positions.length/6;
  expect(result.source).toBe(mesh.source); expect(result.textureUrl).toBe(mesh.textureUrl);
  expect(result.colors?.length).toBe(n*6); expect(result.uvs?.length).toBe(n*4);
  expect(result.colors?.slice(0,n*3)).toEqual(mesh.colors); expect(result.colors?.slice(n*3)).toEqual(mesh.colors);
  expect(result.uvs?.slice(0,n*2)).toEqual(mesh.uvs); expect(result.uvs?.slice(n*2)).toEqual(mesh.uvs);
  expect(result.colors).not.toBe(mesh.colors); expect(result.uvs).not.toBe(mesh.uvs);
});

it('PCA integrates identical surface moments instead of overweighting densely subdivided distal rings', () => {
  const sparse = prism(), dense = prism([0, ...Array.from({ length: 99 }, (_, i) => (i + 1) / 100), 100]);
  for (const mesh of [sparse, dense]) {
    const result = geo.alignPCA(mesh);
    expect(geo.getBounds(result).size[2]).toBeCloseTo(100, 3);
    expect(geo.getBounds(result).min[2]).toBeCloseTo(0, 6);
    const registered = geo.registerLandmarks(mesh, { distal: [0, 0, 0], anterior: [0, 30, 90], lateral: [30, 0, 90] });
    expect(geo.getBounds(registered).size[2]).toBeCloseTo(100, 3);
  }
});
