# OrthoSculpt CAD — approved implementation design

User supplied and approved Tauri 2/Rust + React19/TypeScript/Vite/Tailwind/Three architecture and five-step wizard. User additionally approved Rust/MSVC installation to attempt an executable build. New isolated root C:/Users/sandr/OrthoSculptCAD; do not touch CRM or Ofertownik.

## Surface
Configure/Operate: five steps on left, central large 3D object, contextual inspector at right; muted ink/navy surfaces, restrained mint accent, amber research warning. Polish labels, touch targets >=44px. No fictional patient data, backend measurements, performance badges, or compliance claims.

## Data and privacy
Local files and in-memory state only. No cloud, analytics, external fonts or remote texture requests. Explicit project save/load without automatic patient persistence. Reject missing texture files, network and traversal references. Max import bytes/triangles with meaningful errors. Synthetic demonstrator is visibly labelled.

## Shared contract
src/types.ts is authoritative. Geometry functions are pure and return copied mesh arrays, except reusable SliceIndex cache. X lateral/Y anterior/Z proximal, all units explicitly confirmed in UI; STL/OBJ/PLY units not assumed as clinical truth. Original positions are stored separately, calibration establishes new baseline. Undo restores coordinates. Every mesh change invalidates measurements/native cache. Native binary IPC uses owned copies, NOT true zero-copy.

## Geometry API (src/geometry/index.ts)
getBounds(mesh): Bounds; validateMesh(mesh): TopologyReport; repairMesh(mesh): {mesh,report,warnings}; alignPCA(mesh): MeshData; registerLandmarks(mesh,{anterior,lateral,distal},flexionDegrees=0): MeshData; class SliceIndex(mesh) { slice(z):SliceResult }; measureMesh(mesh, interval):MeasurementRow[]; calibrateMesh(mesh,tapes):MeshData; applyBrush(mesh,options):MeshData; scaleZone(mesh,percent,zMin,zMax):MeshData; deformationColors(mesh,originalPositions):Float32Array; createDemoMesh():MeshData. Additional exports allowed but retain these.

## IO/CAM API
src/io/index.ts: importFiles(files:File[]):Promise<ImportResult>; saveProject(mesh, originalPositions, tapes):Blob; loadProject(text):{mesh,originalPositions,tapes}; downloadBlob(blob,filename):void; exportMeasurements(rows,tapes):Blob.
src/manufacturing/index.ts: buildShell(mesh,options):{mesh:MeshData,warnings:string[]}; exportSTL(mesh):Blob; export3MF(mesh):Blob. Optional CNC only explicit research simulation with machine-independent warnings. Adapter fabrication MUST remain blocked without manufacturer geometry, compatibility, fatigue/strength validation.

## Native API
crates/ortho-geometry contains testable geometry without GUI deps. src-tauri shell receives raw little-endian mesh packet [magic u32=0x4f534344,version u32=1,vertexCount u32,triangleCount u32,Float32 xyz...,Uint32 triangle...], upload_mesh returns summary; slice_mesh(z) returns raw response packet documented by native owner. Parent implements src/native.ts bridge. Rust core owns interval index and adjacency, no claim of Liepa if simplified triangulation used.

## Honest gates
Do not claim production/clinical release, 60FPS, <0.5ms, collision-free thickness, complete repair, strength or MDR/RODO compliance without independent validation. Default flexion 0°, optional 5° labelled an operator-selected engineering preset, not universal clinical recommendation. Normal-offset shell is experimental; reject invalid topology and disclose self-intersection limits. Do not export machine-ready CNC by invention.
