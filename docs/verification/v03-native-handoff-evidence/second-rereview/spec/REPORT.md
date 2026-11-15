# SPEC/ownership rereview — HOLD (G1b1bInputOnly)

- Q1 **CLOSED**: original terminal completion owns settlement after nested revoke; no RETURNED resurrection.
- Q2 **HOLD**: original message-listener case passes, but pool-owned listener cleanup throws still block terminate.
- Blocker: workerPool.ts:29–38,99–101, reached from nativeHandoff.ts:92; final fixture only throws on message at tests:176. Pool terminalAttempted is set before binding.stop; binding.stop throw skips native terminate and the remaining listener. Later release/dispose cannot recover.
- Actual fresh boundary55: **51 PASS / 4 FAIL, exit1**. Failures are removal4/5 on release and RETURN. terminate0, pending1/FAILED, occupied1/REVOKING, exact controlled5 B retained; independent history7 B untouched. This is not a genuine terminate failure: terminate was never attempted.
- All36 cleanup/terminate reentrancy combinations PASS; all8 actual terminate-failure controls PASS (slot/charge held, original error, no retry, no unintended h2/main-hold release). Adoption/category-union control PASS.
- Strict types[] ES2022+DOM heap128/semi8 exit0. Original87 unchanged witness PASS87/87 exit0. Final repository handoff tests PASS33/33 exit0, using own cache and native config loader.
- TDD Q1: same whole tests, RED exit1 pending1 vs0 → GREEN exit0; Q2: same whole tests, RED exit1 terminate0 vs1 → GREEN exit0. Q1 GREEN source exactly Q2 RED. Original28 test bodies preserved except import. Additional two terminate-failure cases correctly labeled existing-behavior coverage, not TDD. See tdd-audit.json and tdd/ raw snapshots/logs.
- Hashes of all four named files, pool, and both norms identical before/after: hashes-before.json / hashes-after.json. Fix manifest independently verified:148 entries (146 scratch,2 repository), SHA256 1c397953bb38c787c3d5262fafbefe6c4d6fed3f0fa72995383e52132d8e19df.
- No repository writes; no install/stage/commit/reset/stash/clean, no skills/profile changes, no full suite/browser/native run. UNIT instrumented-method fault only, no security/exploit claim. Parent owns acceptance.

## Replay (scratch only)

`node "C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-spec-rereview/run.mjs" init` (strict compile and freeze; use only for a fresh replay directory)

`node "C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-spec-rereview/run.mjs" quality` (expected exit0,87 PASS)

`node "C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-spec-rereview/run.mjs" boundary` (expected exit1,51 PASS/4 FAIL)

`node "C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-spec-rereview/run.mjs" focused` (expected exit0,33 PASS)

Exact commands, stdout/stderr and actual exits: strict128.*,quality87.*,boundary.*,focused33.*. Runnable witnesses: boundary.mjs and unchanged witness.mjs. Detailed state/ref/category matrix: ownership-matrix.json; blocker with correction criteria: review.json. Preserve original evidence; replay in another declared scratch directory with path-only relocation if needed.
