# v0.2 geometry/import review fixes

## Scope and corrected contracts

Changed only these repository files for this review:

- `src/geometry/intersections.ts`
- `src/geometry/deformation.ts`
- `src/io/ply.ts`
- `tests/v02-geometry-review-fixes.test.ts` (new)
- `tests/v02-import-attributes.test.ts` (existing contract adjustments)
- this verification note

No UI, other source modules, dependencies, staging or commits were changed by this work. The approved local-only TT scope remains: STL/3MF for external CAM, no adapter/CNC implementation. All fixtures here are synthetic; no clinical scans or clinical validation were supplied.

This note supersedes the old neutral-UNKNOWN heatmap statement in `v02-geometry.md` and the automatic face-colour splitting/corner-limit statements in `v02-import.md`; those historical reports were outside this ownership and were not rewritten.

### 1. Tolerance-hidden coplanar overlap

Exact reproduction: positions `[0,0,0, 2,0,0, 0,2,0, 1,h,0]`, indices `[0,1,2, 1,0,3]`. For `h=1e-9` and `1e-10`, convex clipping found an overlapping area, but every witness lay inside the shared-edge tolerance. The early `witnesses.every(allowed)` return incorrectly declared a complete PASS. The `h=3e-9` control already failed correctly.

The minimal guard retains the existing intersection/clipping algorithm: when all witnesses are tolerance-exempt, a noncollinear clipped witness fan cannot be certified as a shared vertex/edge (both have zero area). It now produces numeric UNKNOWN with `complete:false`, not PASS. Overlaps already outside tolerance still FAIL. This is not a blanket coplanar rejection, and it does not ignore unwelded geometric contacts.

Controls retain legal coplanar shared edges at normal and tiny scale, the existing tiny cylinder, disjoint coplanar triangles with overlapping AABBs, actual shared-edge/shared-vertex overlaps, unwelded contacts, and the exact previously problematic noncoplanar near-parallel adjacent faces. The bounded floating-point audit remains non-certified; UNKNOWN is intentional when an exemption cannot establish clearance.

### 2. UNKNOWN baseline must not look like zero displacement

The open tetrahedron baseline uses positions `[0,0,0, 60,0,0, 0,60,0, 0,0,100]` and indices `[0,2,1, 0,1,3, 0,3,2]`. Its orientation is UNKNOWN. Previously both an unchanged copy and a copy with `positions[0] += 8` returned all neutral green.

`deformationColors` now throws an explicit `Heatmap baseline orientation is unknown` error before allocating colours/normals for an unconfirmed baseline. Green remains the zero signed-displacement colour only for a usable reference. Existing inward/inconsistent rejection and the low-level mathematical oriented-plane convention remain intact: blue +8 mm and red -10 mm. An oriented plane is still not anatomical outward confirmation; UI/Worker outward gates were not changed.

### 3. Face RGB must not silently break PLY topology

The closed four-vertex/four-face tetrahedron with uniform red scalar face RGB previously became twelve independent corners. This destroyed shared-edge topology and caused four components, intersection FAIL at unwelded contacts and UNKNOWN outward orientation.

PLY now retains original positions and indices. Normalized face RGB is accumulated per incident source vertex in a bounded Float64 array, checked for agreement before Float32 output rounding. Agreement preserves geometry and RGB, including through project save/load; the closed tetrahedron remains one closed outward intersection-free surface. Different colours on disjoint source indices remain allowed. Conflicting colours at a shared vertex explicitly reject with instructions to export vertex RGB; there is no averaging, silent RGB loss, splitting or welding. Unreferenced vertices retain their source geometry and receive zero RGB because no incident face supplies a colour.

The existing 128 MiB file, 1,000,000 source vertices and 2,000,000 triangle limits remain. The obsolete 333,333-face expansion cap was removed because there is no corner expansion. Header/body size and original count gates still precede output allocation, and unused Float32-overflow coordinates still reject.

Legitimate updates to `v02-import-attributes.test.ts` replace the old seam-splitting expectation with explicit rejection and replace the expansion-count check with original vertex/triangle cap checks. All 14 tests remain. The ASCII/little-endian/big-endian × uchar/ushort/float matrix now checks both unchanged shared indices for agreeing RGB and actionable rejection for conflicting RGB through public import; project roundtrip assertions remain.

## Observed strict RED → GREEN

Each production fix followed its specific failing regression:

| Slice | Observed RED | GREEN |
|---|---|---|
| Narrow coplanar overlap | 2 failures / 3 passes: heights `1e-9`, `1e-10` returned `pass`, expected `fail` or `unknown` | Same fixtures never PASS; legal-edge controls remain PASS |
| Unknown heatmap baseline | 2 failures / 5 passes: expected throw for displacement 0 and 8, but no error occurred | Both explicitly throw; baseline/current arrays remain unchanged |
| Shared-colour PLY | Source four vertices expanded to twelve; exact original-position assertion failed | Original four positions/indices retained; RGB/project/audit assertions pass |
| Conflicting PLY seam | Expected actionable rejection, but import returned a split mesh | Explicit vertex-RGB export error |

The final new file contains 11 tests, also covering pre-Float32 colour-conflict comparison and distinct colours on disjoint geometry.

## Executed verification

Commands ran from `C:/Users/sandr/OrthoSculptCAD` with the explicit installed executable `C:/Program Files/nodejs/node.exe` (Vitest v4.1.12).

```bash
'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v02-geometry-review-fixes.test.ts
# 1 file, 11 passed, exit 0

'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v02-geometry.test.ts tests/manufacturing-shell.test.ts tests/geometry.test.ts tests/heatmap-spec.test.ts tests/v02-import-attributes.test.ts tests/v02-planar-budget.test.ts
# 6 files, 79 passed, exit 0

'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v02-geometry-review-fixes.test.ts tests/v02-geometry.test.ts tests/manufacturing-shell.test.ts tests/geometry.test.ts tests/heatmap-spec.test.ts tests/v02-import-attributes.test.ts tests/v02-planar-budget.test.ts --reporter=default --reporter=json --outputFile=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v02-geometry-review-focused.json
# 7 files, 90 passed, 0 failed/skipped, exit 0

'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck --noUnusedLocals --noUnusedParameters src/geometry/intersections.ts src/geometry/deformation.ts src/io/ply.ts
# exit 0

'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc -b
# latest run: exit 0

'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run --reporter=default --reporter=json --outputFile=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v02-geometry-review-full-final.json
# latest run: 48 files passed / 1 skipped; 290 passed / 3 skipped / 0 failed (293 total), exit 0

git diff --check -- src/geometry/intersections.ts src/geometry/deformation.ts src/io/ply.ts tests/v02-geometry-review-fixes.test.ts tests/v02-import-attributes.test.ts
# exit 0; existing Windows LF/CRLF notices only
```

Counts were verified programmatically from the focused/full JSON, including exactly 79 assertions in the six existing focused files. Scratch JSON is temporary evidence, not a release artifact. Full-suite totals include concurrently added tests from other owners, not just these eleven regressions. An earlier full run observed three failing in-progress workspace regressions and related TypeScript errors; those disappeared after their owner's edits and the final full rerun/TypeScript check above passed. No unowned fixes were made here.

The three skipped tests are real-Chromium Worker/browser acceptance cases, not geometry tests. No new browser, native executable, clinical, performance/60-FPS, minimum-thickness or manufacturing-suitability claim is made by these checks.
