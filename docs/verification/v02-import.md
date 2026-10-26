# v0.2 import appearance and bounded TS contour verification

## Scope

Only `src/io/ply.ts`, `src/io/obj.ts`, `src/geometry/planar.ts` and the two matching test files were changed by this work. No UI, shared types, project format, other geometry module, dependencies or commits were changed.

## Appearance matrix

| Input attribute | Result |
| --- | --- |
| PLY scalar `vertex.red/green/blue` | Preserved as normalized Float32 RGB; original vertex/index layout retained. |
| PLY scalar `face.red/green/blue` | Preserved by splitting each triangle into three independent corners. Adjacent faces can retain different colours at identical source positions. Indices and positions are remapped together. |
| PLY RGB encoding | ASCII, binary little-endian and binary big-endian. `uchar`/`uint8` divided by 255; `ushort`/`uint16` divided by 65535; other scalar channels must already be in 0–1 (integer channels must also be integral). Range checked before Float32 conversion. |
| PLY RGB on both vertices and faces | Explicit actionable rejection: choose one RGB source; no guessed priority. |
| PLY partial/list RGB, RGB on another element, or `alpha` | Explicit rejection before body decoding/output allocation. Alpha is not silently discarded, even if opaque. |
| PLY UV / `TextureFile` | Existing explicit rejection; use OBJ + MTL + supplied local image. |
| OBJ vertex RGB + complete UV, including seams | Preserved together through remapping. Existing material `Kd` is baked multiplicatively into RGB; independent material identities are not project attributes. |
| OBJ some corners/faces with UV, others without | Explicit actionable rejection at the first mixed reference; assign every corner UV or remove all UV references. No dropping the complete UV array or fabricated zero UVs. |
| OBJ all faces without UV | Still supported. Unreferenced `vt` declarations do not imply face UVs. |
| OBJ local MTL + PNG/JPEG | Existing local-only rules retained. Complete UV and an unmixed texture appearance required; actual PNG import/project/reload tested. |
| PLY/OBJ source normals and arbitrary PLY numeric metadata | Existing behavior unchanged: not persisted source appearance channels; normals are derived from geometry. This work does not claim lossless preservation of arbitrary format extensions. |

Supported vertex RGB, face RGB, OBJ RGB/UV seams and embedded PNG are tested through public `importFiles` → `saveProject(mesh, baseline, tapes)` → `loadProject`, without modifying project serialization.

### Allocation and validation boundaries

- Existing 128 MiB file, 1,000,000 source/output vertices and 2,000,000 triangles limits remain.
- Face-RGB corner expansion requires `3 * face.count <= 1_000_000` before any output allocation or body decoding: at most 333,333 fully split triangular faces. Header-only tests distinguish 333,333 from 333,334. No unbounded colour-driven splitting.
- Every source coordinate is checked after `Math.fround` before assignment, including unused vertices that will be omitted by splitting. An unused finite-double/Float32-overflow coordinate cannot bypass validation.

## TS contour budget

`simplePolygon(points)` retains its boolean contract. Optional `maxWork` can only lower the production budget; non-finite, fractional, negative or higher budgets fail closed.

- At most 250,000 segments **per contour**, checked before mapping/sorting. A real regular 250,000-point contour passes; 250,001 rejects before allocation.
- At most 4,000,000 active-set visits per validation, matching Rust `MAX_SIMPLICITY_WORK` accounting. Expired, adjacent and Y-disjoint entries all consume work. Expired entries use swap-remove rather than an unbudgeted `filter` pass.
- NaN and infinite coordinates reject.
- Exhaustion returns `false`: validity is unknown, not proof of intersection and never PASS. The unchanged `SliceIndex` maps it to `valid=false` with its existing ambiguous-contour warning and zero accepted perimeter/area/AP/ML; diagnostic closed loops remain available.
- Rust's 250,000 cap is applied to the section graph upstream; this scoped TS change caps each contour inside planar validation, not total graph construction. It is not a claim of an end-to-end section memory cap or identical numerical tolerances.

Tests reuse Rust's 30/3,000-row simple serpentine contour (many X-overlaps despite Y-disjoint segments), overlap/touch fixtures and concave/near-collinear/translated controls. Positive controls cut at z=0, 50 and 100, preserving planes through shared boundary edges. No convex-hull substitution.

## TDD and execution evidence

Observed RED before production changes:

1. Shared-face PLY RGB imported with `colors=undefined` (expected two distinct retained colours).
2. Unsupported/ambiguous RGB schemas and expanded-count limit returned only a generic truncated-body error rather than pre-body validation.
3. Both mixed-face and mixed-corner OBJ UV inputs were accepted instead of rejecting.
4. Production serpentine validation and its real `SliceIndex` slice returned `true` instead of fail-closed invalid output.
5. Oversized contour reached mapping; NaN/infinite coordinates and a lower work budget were accepted.
6. A discarded PLY vertex containing finite-double/Float32 overflow escaped validation after face splitting.

Final scoped checks:

```text
npx vitest run tests/v02-import-attributes.test.ts tests/v02-planar-budget.test.ts
# 2 files, 31 tests passed.

npx vitest run tests/v02-import-attributes.test.ts tests/v02-planar-budget.test.ts tests/io.test.ts tests/io-obj.test.ts tests/io-project.test.ts tests/io-security.test.ts tests/review-fixes-ply.test.ts tests/geometry-edge.test.ts tests/calibration-residual.test.ts tests/native.test.ts
# 10 files, 78 tests passed.

npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck src/io/ply.ts src/io/obj.ts src/geometry/planar.ts tests/v02-import-attributes.test.ts tests/v02-planar-budget.test.ts
# Exit 0.

C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path crates/ortho-geometry/Cargo.toml
# 20 native tests passed, including pathological work exhaustion and excessive section complexity.

git diff --check -- src/io/ply.ts src/io/obj.ts src/geometry/planar.ts
# Exit 0 (only Git's existing Windows LF/CRLF notices).
```

`npm run native:test` initially could not find Cargo in Windows PATH; the explicit installed Cargo path above executed successfully.

Full-repository checks were attempted while parallel owners were editing their modules, not claimed green. `npm test` encountered unrelated in-progress UI/worker/crypto/orientation failures. A later 14-file regression run passed 104 tests but failed two outside this ownership: `geometry-contract.test.ts` at the new unknown-outward-orientation guard, and the composed wizard case in `manufacturing-shell.test.ts` at the new 3D-offset UNKNOWN audit guard. `npm run build` encountered in-progress App/compute/crypto integration errors. The scoped TypeScript command above passed after correcting this test file's BlobPart typing. These integration failures were not bypassed or repaired by changing unowned modules.
