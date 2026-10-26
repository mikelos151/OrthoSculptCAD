# v0.2 transport/workspace review fixes — verification

## Scope

Local research/educational CAD workflow; synthetic fixtures only. No patient data, real credentials, UI changes, export-format changes, native Rust source changes, staging or commits in this task. These are input/transport integrity fixes, not a clinical validation or a comprehensive security audit. Existing STL/3MF and local TT workflow scope is unchanged.

Files changed by this task:

- `src/compute/copy.ts`
- `src/compute/client.ts`
- `src/workspace/index.ts`
- `tests/v02-compute-review-fixes.test.ts` (new)
- `tests/v02-workspace-review-fixes.test.ts` (new)
- this verification document (new)

`src/compute/protocol.ts` remains unchanged: its recursive collector is still used only on the Worker's explicitly `structuredClone`-owned response. The client no longer uses it on requests.

## Root causes and fixes

### Caller-buffer detachment through scalar parameters

The former parameter copier allowlisted keys but retained unvalidated values in scalar slots. The client's recursive transfer collector then found caller-owned arrays inside those values. A later Worker rejection could not undo the transfer/detachment.

The pre-copy boundary now validates and snapshots scalar types, finite values, static ranges, bounded integral audit budgets, side/flexion, tape uniqueness/positive circumference and ordered zone heights. Optional audit options accept omission, not null/type confusion. Array parameters require every own index and are copied into plain arrays without invoking caller-supplied `map` methods. The bounded array length is captured before reading elements, so an element getter cannot extend the copy beyond the validated length. Bounds-dependent mesh checks (e.g. shell thickness/radius relative to model dimensions) remain in the Worker, with the existing numeric mesh validation.

Defense in depth: `copyMeshForWorker` records only its own freshly allocated position/index/RGB/UV buffers in a private WeakMap. Client transfer lists come exclusively from that ownership record, never from recursive traversal of parameters. A directly supplied non-owned mesh is rejected at the transport boundary. Cached slicing, two-Worker pool, timeout, cancellation, generation/request IDs and latest-pending-read semantics are retained.

### Sparse workspace journal accepted before serialization

`Array.map` and `every` skip empty slots; they can also consume inherited array indices. The original length-3 journal with own keys `0,2` and revision `2` passed validation, then JSON serialization inserted `null` and produced an unloadable project.

Validation now requires every own array index before mapping the journal. The same rule applies to registration landmark slots, landmark coordinates and registration matrix entries. `saveProject` already invokes this public validator before constructing its output Blob, so no project/crypto code changes were necessary. No entries are silently filled or discarded.

## Strict TDD evidence (actual command output)

All commands ran in `C:/Users/sandr/OrthoSculptCAD`.

| RED command (before the corresponding implementation) | Observed failure |
| --- | --- |
| `ORTHO_REAL_WORKER=1 npx vitest run tests/v02-compute-review-fixes.test.ts` | Initial six tests failed: five transport-double cases and actual Chromium acceptance. Each original injection detached the source positions from 36 bytes to 0. Actual Chromium created five Workers; every operation rejected but `attached` and `unchanged` were false. |
| `npx vitest run tests/v02-compute-review-fixes.test.ts -t 'every scalar'` | Missing pre-copy range validation: `interval: 0` did not throw. |
| `npx vitest run tests/v02-compute-review-fixes.test.ts -t 'explicit owned\|non-owned'` | Two failures: recursive transfer detached the caller's buffer both through an injected parameter and through a directly supplied non-owned mesh. |
| `npx vitest run tests/v02-workspace-review-fixes.test.ts` | Initial sparse-journal regression failed because `validateWorkspace` did not throw; dense save/load control passed. |
| `npx vitest run tests/v02-workspace-review-fixes.test.ts` | After the journal fix, three new registration regressions failed: absent landmark slot, absent coordinate, inherited coordinate. |
| `npx vitest run tests/v02-workspace-review-fixes.test.ts -t 'matrix slots'` | An inherited registration matrix slot was accepted. |
| `npx vitest run tests/v02-compute-review-fixes.test.ts -t 'map methods'` | Caller-supplied array `map` returned an injected buffer instead of sanitized numeric heights. |
| `npx vitest run tests/v02-compute-review-fixes.test.ts -t 'bounded array length'` | An element getter grew the array during copying; output exceeded the validated original length. |

Each slice was changed only after its RED run and followed by a passing targeted run. The extra workspace Chromium test is acceptance coverage of the same public-function bug already reproduced RED in Node, not a claim of a second pre-fix browser run.

An intermediate TypeScript check caught two test-only `delete` operations on required tuple slots (`TS2790`); the malicious fixtures now use `Reflect.deleteProperty`. The final type check is clean.

## Actual Chromium acceptance (not the transport double)

Vite serves the real source modules; Playwright launches installed headless Chromium. The original five public `runGeometryTask` attacks are executed in the browser. `window.Worker` is subclassed solely to count construction and delegates to the real Worker implementation; no fake computation or response is supplied.

Observed Chromium user agent: `HeadlessChrome/156.0.8078.4` on Windows.

Final actual browser output:

```json
{"created":0,"results":[{"op":"measure","rejected":true,"attached":true,"unchanged":true},{"op":"zone","rejected":true,"attached":true,"unchanged":true},{"op":"calibrate","rejected":true,"attached":true,"unchanged":true},{"op":"analyze","rejected":true,"attached":true,"unchanged":true},{"op":"shell","rejected":true,"attached":true,"unchanged":true}]}
```

The corresponding fields are `measure.interval`, `zone.percent`, `calibrate.tapes[0].circumference`, `analyze.options.maxPairTests` and `shell.options.thickness`. Every fixture has independent source arrays and exact original-byte/index checks. Transport-double tests additionally spy on mesh copy writes and assert zero Worker constructions/copy writes for these malformed requests.

Workspace's public functions were also exercised in real Chromium. The dense control saved/reloaded exactly. The sparse repro was rejected by validation, append and save-before-protection. A counting native Blob subclass and delegating WebCrypto method wrapper observed no output Blob or KDF call:

```json
{"denseRoundtrip":true,"validateRejected":true,"appendRejected":true,"saveRejected":true,"blobs":0,"kdfs":0,"length":3,"keys":["0","2"],"revision":2}
```

Both new browser tests assert no `pageerror`. Synthetic test-only passphrase text is used only in the rejected save-before-protect pipeline; it is not a real credential.

## Final verification

Focused browser + transport + dispatcher run:

```sh
ORTHO_REAL_WORKER=1 npx vitest run tests/v02-compute-review-fixes.test.ts tests/v02-workspace-review-fixes.test.ts tests/v02-compute-transport.test.ts tests/v02-compute-dispatch.test.ts tests/v02-compute-browser.test.ts
npx tsc --noEmit
```

Observed: **5 test files passed, 47 tests passed**, TypeScript exit 0.

Final full shared-worktree run after the last production edit:

```sh
ORTHO_REAL_WORKER=1 npx vitest run
npx tsc --noEmit
git diff --check -- src/compute/copy.ts src/compute/client.ts src/workspace/index.ts tests/v02-compute-review-fixes.test.ts tests/v02-workspace-review-fixes.test.ts docs/verification/v02-transport-review-fixes.md
```

Observed: **49 test files passed, 296 tests passed**, no skipped browser tests, TypeScript exit 0, diff check exit 0. Other contributors were working in disjoint files; these totals describe the shared worktree at verification time, not an isolated commit.

Existing actual-Chromium acceptance also passed all eleven operations and three cached slicing comparisons with source buffers attached/unchanged. Actual busy-Worker cancellation returned `AbortError`, created/terminated exactly one Worker, retained source arrays (7,200,000 position bytes; 2,400,000 index bytes), and kept the main-thread heartbeat alive (five ticks in the final run). Existing transport tests cover the two-Worker pool and superseded cached reads. Native Rust implementation/routing was not modified; no new native binary build or cargo execution is claimed here.

Default test runs intentionally skip the real-browser acceptance unless `ORTHO_REAL_WORKER=1` is set. Transport-double tests are explicitly labeled and are not presented as Chromium evidence. Parent-level independent re-review remains separate from this implementation verification.
