# v0.2 geometry verification

## Implemented contracts

- `auditMesh(mesh, AuditOptions?) -> MeshAudit` follows the frozen `auditTypes.ts` contract. Stable check IDs: `edge-manifold`, `watertight`, `vertex-manifold`, `components`, `degenerate-triangles`, `winding`, `self-intersections`, `outward`, `minimum-thickness`.
- `orientMesh(mesh) -> {mesh, changed, warnings}` reverses global winding **only** for one closed, consistent, vertex-manifold, intersection-free component with resolved negative volume. Open geometry is not called outward based on its open signed volume. Unknown/unsafe inputs remain unchanged with an explicit warning. Every returned mutable mesh array is owned by the result.
- `registerLandmarksDetailed(mesh, points, flexionDegrees=0, side='right') -> {mesh, matrix:number[]}`. The 16-entry column-major proper rigid transform maps input coordinates into registered coordinates, including distal translation and flexion. `registerLandmarks` preserves its old mesh-only return and adds optional fourth `side`. X is patient RIGHT, Y anterior, Z proximal; a left lateral pick maps toward −X. Wrong/unspecified side and incompatible chirality are rejected; no reflection.
- PCA uses exact surface-area-integrated triangle first and second moments, not uniform vertex sampling. The unresolved largest eigenaxis is rejected at a 1.05 eigenvalue ratio. PCA alone is geometric alignment, not anatomical confirmation; a circular transverse section has no uniquely inferred anatomical rotation. Candidates are validated after Float32 storage.
- Signed brush rejects inward/inconsistent or unresolved nonplanar geometry. The low-level mathematical oriented-plane API remains available for the existing analytic plane tests; **the UI must still require an outward audit**. Known inward/inconsistent heatmap references throw, while unknown nonplanar references return neutral colours rather than claiming blue relief/red compression. Baseline-normal blue +8 mm / red −10 mm convention is retained on resolved geometry.
- Repair still performs conservative planar earcut caps, then safely attempts global outward orientation. RGB/UV/texture/source survive copying, registration, repair, orientation and brush. Shell duplicates/remaps source RGB/UV onto both layers, retains texture/source, and warns that geometry-only export does not guarantee attributes reach CAM.
- `buildShell(input, options, auditOptions?)` additionally rejects both actual input/output intersections and incomplete spatial audits. The optional third argument can lower bounded audit budgets (also used by the UNKNOWN regression). Raw surface export remains separate and was not changed.

## Root causes and observed RED → GREEN

Each production change followed its failing test, run with Vitest, before implementation.

| Slice | Actual RED observation | GREEN evidence |
|---|---|---|
| Retrangulation-invariant PCA | Identical R30/H100 cylinder with distal rings 0, .01… .99, 100 produced Z height **60**, expected 100 | Sparse/dense surface PCA and registration both retain height 100 within 0.001 mm |
| Explicit left frame / transform | `registerLandmarksDetailed is not a function` | Left/right chirality, determinant +1, all transformed vertices and source attributes checked |
| Actual 3D audit | `auditMesh is not a function` for transverse crossing faces | Actual witness pair `[0,1]`; closed valid cylinder control is intersection-free/outward |
| Inverted cylinder repair | Signed volume **−280930.068649457**, expected positive | Reversed R30/H100/32-segment cylinder repaired outward; relief at (30,0,50), radius5/strength1 increases X above 30.9, not to 29 |
| Unknown/inward brush | Expected throw but function returned an inward displacement | Unrepaired reversed cylinder and open nonplanar cylinder are rejected; positive open volume does not prove outward |
| Narrow U shell | Expected throw but crossing outer shell was returned | U cross-section [−30,−30],[30,−30],[30,30],[2,30],[2,−10],[−2,−10],[−2,30],[−30,30], Z0/50/100, 3mm/zero-flare is refused |
| Near-parallel shared-edge false positive | Exact pair of adjacent demo outer faces incorrectly returned witness `[0,1]` | Distinct noncoplanar planes share only their indexed edge; exact regression is clear, composed demo pipeline remains valid |
| Ambiguous PCA | Isotropic cube returned an arbitrary frame | Automatic PCA rejects ambiguous proximal axis |
| Shell UNKNOWN gate | Zero pair budget still returned a shell | `maxPairTests:0` refuses the shell with explicit UNKNOWN/audit error |
| Tiny valid geometry | `Degenerate direction` during normalization | Valid sub-micrometre analytical fixture audits without exception |
| Resource bound | 200001 faces produced topology FAIL after allocating maps | Above 200000 triangles or vertices: early UNKNOWN before large topology allocation |
| Float32 PCA overflow | Finite input published overflowing output instead of throwing | Post-storage validation rejects the candidate |
| Shell attributes | Valid embedded texture was dropped (`undefined`) | Both remapped layers preserve independently allocated RGB/UV and texture/source |

Additional adversarial controls cover coplanar overlaps, overlap beyond a shared edge or vertex, legitimate coplanar/noncoplanar shared simplices, duplicate triangles, unindexed geometric contacts, disjoint triangles with overlapping AABBs, overlapping positive-volume closed cylinders, pinched closed tetrahedra, budget exhaustion and near-coplanar numerical ambiguity. A square-cylinder witness uses Three.js closest-point-on-triangle distances and proves an outer/inner distance below 2.9 mm with a nominal 3 mm vertex offset; **no constant-thickness guarantee is made**.

## Algorithm scope / bounded work

Median-split triangle AABB BVH; only overlapping node/triangle candidates reach the narrow phase. Coplanar triangles use convex clipping, noncoplanar triangles use plane sections and interval overlap. Shared indices exempt only their geometric simplex, never entire neighbouring triangles. Geometrically coincident but unwelded contacts count as intersections; no silent welding.

Default pair budget: 2000000; maximum configurable 10000000. Default intersection-witness cap:100, configurable1…10000. Candidate pairs are processed without allocating a quadratic pair list. Broad-phase node visits have a separate bound of `8*maxPairTests + 4*triangleCount`. Reaching either work/witness bound sets `complete:false`; found witnesses still make the self-intersection check FAIL, never UNKNOWN/PASS. A full audit above 200000 triangles or vertices is UNKNOWN before topology/BVH allocation; `signedVolume:0` is explicitly labelled uncomputed in that result, not a measured zero-volume claim.

Numerical tolerances are local-scale relative. Near-plane uncertain contacts return UNKNOWN rather than PASS. This floating-point implementation is not an exact-predicate computational-geometry certification. `complete` describes the bounded spatial scan, not clinical suitability and not minimum thickness. Thickness remains UNKNOWN even after a clean scan. Open, disconnected, self-intersecting, pinched or otherwise unresolved geometry cannot receive outward confirmation. No clinical clearance, strength/fatigue testing, adapter/CNC/G-code or new dependency is included.

## Execution and integration status

Focused command:

`npx vitest run tests/v02-geometry.test.ts tests/manufacturing-shell.test.ts tests/geometry.test.ts tests/heatmap-spec.test.ts`

Latest focused run: **4 files, 48 tests passed**, including all26 new v0.2 geometry regressions and the unchanged demo → repair → PCA → calibration → shell integration.

Owned code plus tests pass independent strict TypeScript checking with project-equivalent target/module/strict/noUnused options. The latest whole-project `npx tsc -b` also **passes** (exit0); earlier concurrent UI integration errors were resolved by their owner.

Full-suite JSON is retained at `v02-geometry-full-tests.json`; focused JSON at `v02-geometry-focused-tests.json`. Latest full run: **241 total, 238 passed, 1 failed, 2 skipped**. The full run is **not claimed green**: legacy `tests/geometry-contract.test.ts` directly applies signed relief to an unconfirmed open square tube, contrary to the newly required fail-closed contract. Parent must update that test's brush fixture to a repaired/outward mesh while retaining every attribute/immutability assertion; do not remove the test or weaken the new direction guard. Two other tests are explicitly skipped by their owners; exact current totals are in the JSON. No existing test was edited or discarded by this geometry change.

`MeshHistory` was not present under that name in the repository; no unowned history implementation was changed. Bounded undo-history memory and journal archival are separate parent/UI responsibilities; this work does not claim a full snapshot archive.
