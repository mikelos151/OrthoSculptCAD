# Geometry verification — TypeScript browser engine

## Scope and outcome

Owned implementation: `src/geometry/**`, `tests/geometry*.test.ts`, this file. No changes to package.json, shared types, UI, IO/CAM or Rust; no staging/commits. The approved implementation plan is actually `docs/plans/2026-10-21-orthosculpt-plan.md` (root `plan.md` does not exist).

All design exports are implemented in `src/geometry/index.ts`:
`getBounds`, `validateMesh`, `repairMesh`, `alignPCA`, `registerLandmarks`, `SliceIndex`, `measureMesh`, `calibrateMesh`, `applyBrush`, `scaleZone`, `deformationColors`, `createDemoMesh`.

## Executed evidence

Commands ran from `C:/Users/sandr/OrthoSculptCAD`, with the installed Vitest reporting **v4.1.12**. Times below are the actual local runner's displayed start times, not elapsed-time performance claims.

Final focused run after formatting:

```text
npx --yes --package=prettier@3.6.2 prettier --write 'src/geometry/**/*.ts' 'tests/geometry*.test.ts'
npx vitest run tests/geometry*.test.ts
npx tsc -b --pretty false

RUN v4.1.12 C:/Users/sandr/OrthoSculptCAD
Test Files 3 passed (3)
Tests      28 passed (28)
Start at   22:21:40
Duration   385ms
exit_code: 0
```

The combined shell command completed with exit 0; TypeScript emitted no diagnostics. A final verbose rerun at **22:23:27** (`npx vitest run tests/geometry*.test.ts --reporter=verbose && npx tsc -b --pretty false`) again returned **3 files / 28 tests passed**, duration 332 ms, exit 0, with every test name printed and no TypeScript diagnostics. Search of `src/geometry` found no `TODO`, `not implemented`, `mock` or `stub` placeholders. Prettier was invoked as a one-off cache tool, without adding a project dependency. Focused files: `geometry.test.ts` (15 tests), `geometry-edge.test.ts` (10), `geometry-contract.test.ts` (3).

### Vertical RED → GREEN evidence

These were successive focused Vitest runs, not an all-tests-first implementation. Until edge tests were added the command was `npx vitest run tests/geometry.test.ts`; afterwards explicit geometry test paths or `tests/geometry*.test.ts` were used.

| Slice | Observed RED | Observed GREEN |
| --- | --- | --- |
| Real ordered cylinder intersection | 22:04:55 missing module; scaffolding then 22:05:05 `SliceIndex is not implemented` | 22:06:43: 1 passed |
| Bounds/topology/volume/boundary loops | 22:06:58 `validateMesh is not a function` | 22:07:33: 2 passed |
| Reject malformed data before interval tree construction | 22:07:47 expected constructor to throw, but it accepted invalid input | 22:08:12: 3 passed |
| Earcut planar cap + copied RGB/UV | 22:08:33 `repairMesh is not a function` | 22:09:06: 4 passed |
| Covariance/eigen PCA alignment | 22:09:24 `alignPCA is not a function` | 22:09:49: 5 passed |
| Orthonormal landmarks / explicit 5° / collinearity | 22:10:07 missing `registerLandmarks` | 22:10:27: 6 passed |
| Measurement rows and segment-volume estimate | 22:10:44 missing `measureMesh` | 22:11:02: 7 passed |
| Piecewise-Z radial tape factors | 22:11:38 missing `calibrateMesh` | 22:12:10: 8 passed |
| Hermite relief/compression normals | 22:12:32 missing `applyBrush` | 22:12:54: 9 passed |
| Actual neighbour smoothing | 22:13:14 `Smooth brush is not implemented` | 22:13:36: 10 passed |
| Circumference-percent zone | 22:13:53 missing `scaleZone` | 22:14:14: 11 passed |
| Signed baseline-normal heatmap | 22:14:33 missing `deformationColors` | 22:15:00: 12 passed |
| Synthetic open-proximal, closed-distal RGB stump | 22:15:24 missing `createDemoMesh` | 22:16:12: 13 passed |
| High landmarks must not rotate axial height sideways | 22:16:27 expected 240 mm axial height; old solver produced 17.35443687438965 | 22:17:08: 14 passed; TypeScript exit 0 |
| Self-intersecting contour must be invalid | 22:17:58 expected false, got true; 22 other tests passed | 22:18:40: 23 passed; TypeScript exit 0 |
| Duplicate crossing faces must not be silently collapsed | 22:19:10 expected false, got true | 22:19:35: 24 passed; TypeScript exit 0 |
| Ambiguous principal proximal axis | 22:21:03 wrong chirality error instead of explicit principal-axis ambiguity | 22:21:16: 28 passed; TypeScript exit 0 |

Additional existing-behaviour regression coverage was added between these tracer bullets: contour branches/open chains, concavity, plane-through-ring and cap edges, disconnected loops, translated/oblique analytical cylinders, index snapshots, winding/degeneracy/non-manifold counts, safe concave/non-planar caps, every transform's ownership/provenance/RGB/UV preservation, resource limits and rotated non-radial brush normals.

Honest intermediate corrections:
- The first analytical area assertion failed at 22:06:31: a regular 128-gon has area 1256.1324427151048 mm², while the ideal circle has 1256.6370614359173 mm². The original absolute 0.5 mm² assertion was slightly tighter than the polygon's known discretisation error (0.5046187208124593). The corrected test asserts <0.1% ideal-circle error **and** independently checks the exact regular-polygon formula to 3 decimals. No hull or analytical value is substituted into production slicing.
- Demo implementation initially produced two exponentiation-precedence parse errors at 22:15:55. Parenthesised the Gaussian exponents; the next run passed. This was an implementation syntax error, not counted as a behavioural RED gate.

### Broader integration observation (not a geometry pass claim)

`npm test` at 22:20:35 exited 1: **16 test files passed, 2 failed; 74 tests passed, 1 failed (75 collected)**. Failures were outside this ownership:
1. Vitest collected Playwright's `e2e/workflow.spec.ts`, causing `Playwright Test did not expect test() to be called here`.
2. `tests/manufacturing-shell.test.ts:40` circular flare expectation: received 5.459552764892578 vs expected 0.9046106882113736.

Those files were not edited here. They may be changing concurrently; the statement above is a timestamped observation, not an assertion about their later state.

## Tested numerical and API semantics

- Coordinates/lengths are mm, section areas mm², segment-volume estimates mm³. AP is Y extent, ML is X extent.
- `SliceIndex` owns position/index snapshots and a centered triangle-Z interval tree. Intersections are joined by **mesh vertex/edge identity**, not convex hull or approximate spatial bridging. Returned 2D points are ordered, closing edge implicit (`closed=true`), with no repeated first point. Exactly one closed, simple, nonbranched, nonduplicated, positive-area contour is required for `valid=true`. Invalid aggregate metrics are zero, with `valid=false`, diagnostic loops/warnings retained. Fully coplanar triangle interiors are ignored; incident noncoplanar sides supply cap outlines. Purely coplanar surfaces are not a measurable section.
- Raw mesh validation rejects missing xyz/triangle triples, empty surfaces, nonfinite coordinates/channels, channel-length mismatch, out-of-range indices and limits above 2,000,000 vertices / 4,000,000 triangles. Adjacency reports boundary loops, edge multiplicity, inconsistent edge directions, degeneracy and signed tetrahedral volume. Signed volume on an open surface is not enclosed volume.
- Repair only removes zero-area/repeated-index triangles and caps isolated, simple planar boundary polygons using **earcut**, existing vertices and reversed boundary orientation. It refuses inconsistent/non-manifold inputs for capping, nonplanar or self-intersecting boundaries, incomplete triangulation and multiple coplanar boundaries (possible nested holes). No Liepa, Delaunay, general hole-healing, auto-welding or 3D intersection-removal claim.
- PCA uses actual vertex covariance and a Jacobi symmetric eigensolver; it is sampling-density-dependent and is not anatomical inference. Largest eigenvector becomes proximal Z, with deterministic sign for raw PCA. Landmark registration signs that principal axis toward centroid-minus-distal, projects anterior/lateral directions into its transverse plane, then Gram–Schmidt orthonormalises. It rejects transverse collinearity, unresolved distal direction and principal eigenvalue separation <=5%. This threshold is an engineering ambiguity guard, not a clinical standard.
- Registration preserves right-handed orientation. Incompatible landmark chirality/laterality **throws**, never silently mirrors. X lateral/Y anterior/Z proximal cannot encode both limb lateralities by an automatic reflection; correct landmark convention/operator laterality handling remains necessary. Default flexion is **0°**. Explicit **5°** is supported, but is only an operator-selected engineering preset; finite input is limited to ±30°.
- Calibration factors are target circumference / actual contour perimeter, with centroid-based transverse radial scaling, piecewise-linear interpolation by Z and endpoint clamping outside tape range. Z is unchanged; allowed factors 0.5–2; duplicate levels, invalid contours and nonpositive/nonfinite values throw. Empty tapes return an owned copy. A circumference cannot independently establish AP and ML. A concave mesh section and a taut physical tape need not agree. No isotropic XYZ calibration or volume-percent conversion is used.
- Brushes use area-weighted triangle normals, compact cubic Hermite falloff `1−3t²+2t³`, and relief/compression sign. Smooth reads the original one-ring neighbours and writes simultaneously (no array-neighbour shortcut). Relief/compression strength is mm; smooth uses `min(1,strength)` as dimensionless interpolation amount. Radius (0,1000] mm, strength [0,50]. No topology/collision-preservation guarantee.
- `scaleZone` uses `1+percent/100` radial XY scaling about bounds XY center at vertices within inclusive Z limits; ±50% allowed. This changes circumference, not volume percentage. Z is unchanged. Hard zone boundaries have no hidden feathering.
- Heatmap projects displacement onto **reference**, not deformed or origin-radial, normals. Blue outward relief (+8 mm saturation), red inward compression (−10 mm saturation), green tangential/zero; these are display limits only. Parent corrected the original inverted colour mapping against a new failing brief-conformance test. Matching original vertex order/topology is required; this is not stress, pressure, distance-to-surface or clinical tolerance.
- Demo is deterministic educational geometry, visibly named synthetic and `source:'synthetic'`, with vertex RGB blue/purple/red marker-like patterns, closed rounded distal tip and a single open proximal rim. It contains no patient data or remote assets. Every transform owns returned arrays and preserves name/source/RGB/UV/texture URL unchanged.

## Remaining limitations

- Indexed connectivity is authoritative. Unwelded triangle soup or duplicated OBJ seam vertices can yield open contours/boundaries. The engine deliberately does not join almost-touching or disconnected points behind the operator's back. Safe seam-aware welding/remeshing needs a separate contract preserving attribute splits.
- `watertight` is an **edge-topology** result, not a proof against geometric self-intersection, pinched vertices, disconnected nested shells, adequate wall thickness or manufacturability. Planar caps can still intersect other 3D surface regions; no global triangle-triangle intersection test is provided.
- Piecewise calibration/zone functions act on existing vertices. On coarse triangles crossing tape breakpoints/zone limits, the resulting section may not exactly match the desired interpolation. Remeasure afterwards; no adaptive remeshing or exact tape-fitting claim.
- Segment volume is a trapezoidal slice estimate (midpoint validity checked), not exact integration; short gaps/features between samples can be missed.
- Float32 precision, near-tangent/coplanar degeneracies, highly bent/nonelongated limbs and sampling-biased PCA need operator inspection. No validated anatomical frame or clinical registration accuracy is claimed.
- Browser interval-tree and contour processing are real, but no guaranteed latency, 60 FPS or large-mesh memory benchmark was measured. Rust/native execution, browser interaction and end-to-end clinical/manufacturing validation are outside this module's verification.
