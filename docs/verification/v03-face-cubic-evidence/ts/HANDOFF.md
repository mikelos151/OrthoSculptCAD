# M0c2 implementer A — TS handoff

## Outcome and scope
- Created only `C:/Users/sandr/OrthoSculptCAD/src/trimline/face-cubic.ts` and `C:/Users/sandr/OrthoSculptCAD/tests/v03-face-cubic.test.ts` in the repository.
- Frozen API: `certifyFaceCubic`, `FaceCubicError`, `ExactTriangle3`, `ExactBarycentric3`, `CubicBarycentricControls`, `FaceCubicContainment`. No public sampler wrapper or application integration.
- Exact noncollinearity/simplex/map; descriptor-only bounded 7-tuples/21-scalars snapshot; all scalar authentication before geometry; literal error ownership/order; deep owned immutability; one passed arithmetic context. Old numerics and sampler unchanged.
- Read the full reviewed plan and shared schema before implementation. Did not read the new Python verifier or its tests; the concurrently created Python paths seen in Git status belong to implementer B.
- No stage/commit/reset/stash, config, profile/skill, shared-schema/plan, old-test, app, or frozen-module edits. No full Vitest/browser/benchmark run.

## Verified execution
All evidence below is under:
`C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-ts-agent/`

- `final-default-focused.log`: **19/19 focused tests PASS**, one worker, env unset. Snapshot of own scratch files/hashes and repository root entries was unchanged except the explicitly captured runner log; original proof hash remained unchanged. The producer writes nothing by default.
- `tsc-final.log`: `node node_modules/typescript/bin/tsc --noEmit`, exit 0. Earlier `tsc-01.log` also exit 0.
- `final-export.log`: real export test PASS (1 passed, 18 skipped); output produced by real `certifyFaceCubic` then existing `sampleCubic(containment.controls, tolerance, limits, ctx)`, sharing the context throughout the whole producer. Only bigint-to-canonical-string serialization.
- `verify_delivery.py` validated the original real export with the shared Draft 2020-12 schema and counted its actual contents; **schema shape validity is NOT independent mathematical verification**.
- `export-exclusive-refusal.log`: expected exit 1 / EEXIST; original bytes/hash preserved.
- `export-relative-refusal.log`: expected exit 1; no output created.
- `export-outside-refusal.log`: expected exit 1; no output created outside scratch.
- `frozen-module-diff.log`: empty diff, exit 0, for numerics, bezier, reviewed plan, shared schema and old sampler test.
- `scope-final.log`: only two owned TS files and B's two new Python files untracked.

## Original producer evidence — hand to parent unchanged
Path:
`C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-ts-agent/finalproof-delivery.json`

SHA-256:
`5166cdf3504d2bbecb0ff0fb6ea67fa9561988a4f31fbf133009e3db09f5c393`

Size: 63817 bytes. Programmatically counted: **6 cases, 21 leaves, 27 samples**.
- `nonaxis-curved`: 16 leaves / 17 samples.
- `edge-linear`, `vertex-constant`, `xz-chart`, `yz-chart`, `thin-constant`: each 1 leaf / 2 samples.

Machine-readable counts/hash: `delivery-summary.json`.
Earlier independently preserved real export from the export TDD cycle: `export-cycle.json`.

## Vertical TDD evidence (original logs preserved)
All names below are files in the absolute evidence directory above.

| Behavior | Observed RED | GREEN / coverage |
|---|---|---|
| A1 callable API plus exact non-axis map | `A1-RED.log`: undefined-vs-function assertion, not missing-module | `A1-GREEN.log` (1 test) |
| A2 closed edge and constant vertex | Existing forward-map coverage, not claimed RED | Included in `A3-degenerate-RED.log` (2 passed) and later greens |
| A3 exact degeneracy | `A3-degenerate-RED.log` | `A3-degenerate-GREEN.log` (3 tests) |
| A3 thin 2^-600, XZ/YZ, negative determinant B/C+weights swap | Existing determinant/map coverage | Included in `A4-negative-RED.log` (6 passed) and later greens |
| A4 tiny negative 2^-1100 in every control/axis | `A4-negative-RED.log` | `A4-negative-GREEN.log` (7 tests) |
| A4 exact nonunit sum above/below 1 | `A4-sum-RED.log` | `A4-sum-GREEN.log` (8 tests) |
| A4 forged scalars/getters/coercion hooks in all 21 positions | Existing numeric-operation coverage | `A4-forgery-COVERAGE.log` (9 tests) |
| A5 all fixed required shape indices, accessors, sparse/inherited, typed arrays, custom methods | `A5-shape-RED.log`: expected FaceCubicError vs TypeError assertion | `A5-shape-GREEN.log` (10 tests) |
| A5 deep frozen owned snapshots, unchanged mutable caller | `A5-immutable-RED.log` | `A5-immutable-GREEN.log` (11 tests) |
| A5 shape/authentication/geometry phase ownership | `A5-phase-RED.log` | `A5-phase-GREEN.log` (12 tests) |
| A5 bounded-search minimal budget, one-short UNKNOWN, no partial output, wide scalar | Existing shared-operation coverage | `A5-budget-COVERAGE.log` (13 tests) |
| A6 real world-controls composition; exact Bernstein polynomial checks, full leaf coverage and bounds | Existing sampler + map integration coverage | `A6-compose-COVERAGE.log` (14 tests) |
| A6 discriminating chart U=1/500000 vs world U=21/1000000 and x1000 refusal | Existing world-metric integration coverage | `A6-worldmetric-COVERAGE.log` (15 tests) |
| A6 bounded-search cumulative containment+sampler budget and separate-component success | Existing cumulative-operation integration coverage | `A6-cumulative-COVERAGE.log` (16 tests) |
| A6 original BezierError depth/tolerance refusal, no partial publication | Existing sampler-error integration coverage | `A6-refusal-COVERAGE.log` (17 tests) |
| A7 real six-case producer | `A7-producer-RED.log` preserved initial unwrapped not-implemented error; then `A7-producer-assertion-RED.log` explicit assertion RED before implementation | `A7-producer-GREEN.log` (18 tests) |
| A7 explicit requested file export | `A7-export-RED.log`: missing output false-vs-true assertion | `A7-export-GREEN.log` (1 passed / 17 skipped) |
| Frozen runtime exports/literal error diagnostics | Additional coverage | `final-default-focused.log` (19 tests) |

## Reproduction commands
Run from `C:/Users/sandr/OrthoSculptCAD`:

```bash
node node_modules/vitest/vitest.mjs run tests/v03-face-cubic.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

A fresh export (use a new name; exclusive creation deliberately refuses existing files):
```bash
ORTHO_FACE_CUBIC_EVIDENCE_OUT='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-ts-agent/another-fresh-proof.json' node node_modules/vitest/vitest.mjs run tests/v03-face-cubic.test.ts --maxWorkers=1 -t 'exports untouched real face cubic proofs'
```

Actual final export used the same command with `finalproof-delivery.json`.
`run.py <unique-log-label> [Vitest args]` preserves each original focused run using exclusive log creation.
`verify_delivery.py` produced final export/refusal/default evidence; it is intentionally one-shot because it refuses overwriting evidence.

## Issues / remaining parent acceptance
- A Python `subprocess.run(['git', ...])` attempt failed with Windows PermissionError/WinError 5 after tsc had already passed. Used shell Git for read-only scope/diff instead; no config workaround. This did not affect tests, export or TypeScript checks.
- Initial `write_file` overwrite of the scaffold was refused by tool stale-write guard; used a targeted patch. No file change occurred in that failed tool attempt.
- Initial producer RED was an unwrapped explicit not-implemented error. Preserved it and reran an explicit not-toThrow assertion RED before implementing producer; both original logs retained.
- No clinical/production/full-feature/executable-release PASS is claimed.
- Parent still owns original-file independent Python CLI verification, canonical barycentric mismatch and off-plane mutants / old-verifier controls, independent spec/math + quality/security review, and serialized regression acceptance. This TS handoff does not certify source provenance, seams, full curve validity, simplicity, shell or collar.
