# M0c1 TypeScript delivery

Owned repository files: `src/trimline/bezier.ts`, `tests/v03-bezier.test.ts` only. No App integration, changes to numerics, dependency changes, commits, staging, resets, stashes, full suites or browsers. Independent Python implementation was not read or run.

## Verified result

- Latest targeted export run: `25-delivery-targeted-export.log`: 21 tests passed.
- TypeScript: `24-tsc-after-test-cast-fix.log`: exit 0.
- Default run: `23-default-no-export.log`: 21 passed; snapshot of this evidence directory unchanged during test execution.
- Real export: `proof-delivery.json` (`OrthoSculptBezierProof`, version 1). Exact rational serialization, canonical decimal strings and gcd reduction inspected programmatically.
- Programmatically parsed totals and hashes: `delivery-summary.json`: 6 cases, 97 leaves, 103 samples. Geometry IDs: linear, curved, nonplanar, zerochord, constant, negative.
- This is not an independent Python PASS; parent must run the independent verifier against a freshly exported bundle, then full acceptance suites and reviews.

## Vertical TDD evidence

Original logs retained, not replaced:

| Behavior | Assertion RED | GREEN |
| --- | --- | --- |
| API / parametric linear cubic | 01-linear-RED.log | 02-linear-GREEN.log |
| Curved exact half-subdivision | 03-curved-RED.log | 04-curved-GREEN.log |
| Tree budgets | 06-budgets-RED.log | 07-budgets-GREEN.log |
| Owned integer limits | 08-limits-RED.log | 09-limits-GREEN.log |
| Positive normative tolerance | 10-tolerance-RED.log | 11-tolerance-GREEN.log |
| Dense own-data snapshot | 12-snapshot-RED.log | 13-snapshot-GREEN.log |
| Deep immutable output | 14-immutable-RED.log | 15-immutable-GREEN.log |
| Actual optional result export | 19-export-RED.log | 20-export-GREEN.log |

05, 17 and 18 are honestly labeled additional COVERAGE (already green), not invented RED cycles. Added exact equality/excess boundary coverage is in the final runs.

## Reproduce from repository root (Git Bash)

```bash
'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v03-bezier.test.ts --maxWorkers=1
'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
ORTHO_BEZIER_EVIDENCE_OUT='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-bezier-agent/proof-parent-fresh.json' 'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v03-bezier.test.ts --maxWorkers=1
```

Export requires an absolute path with an existing parent inside the local Hermes scratch directory. It uses exclusive creation (`wx`): use a NEW filename each time; existing evidence is deliberately not overwritten. No environment variable means no export writes.

## Known execution issues, resolved

- First late TypeScript run (`22-final-tsc.log`) found a TS2352 cast in the deliberately malformed getter fixture. Replaced with explicit `unknown` cast and an assertion that the call throws the original NumericsError. Production behavior did not change. Later TypeScript and targeted tests passed.
- The first automatic manifest attempt could not spawn `git` from native Node (EPERM). Original error is preserved in `delivery-manifest.json` despite that filename. Retried via Git Bash supplying actual HEAD to Node; successful JSON is `delivery-summary.json`.

## Scope and mathematical contract

One input cubic in 3D, exact de Casteljau at one half; a single passed context for every rational construction/operation/comparison. Acceptance uses the global matched-parameter bound max(||D1||^2, ||D2||^2) <= tolerance^2, not sampled error. Every child split reserves both nodes and the pending-node minimum leaf count before midpoint arithmetic. Shared midpoint and boundary parameter are constructed once. No floating conversion or square root is used for decisions.

Tests additionally prove exact leaf/root polynomial identity by evaluation at four distinct rational parameters (degree <= 3), recompute the prescribed global bound, check continuity/shared object identity, exact max, nonparametric collinearity, tiny values below Float64 underflow, exact tree caps, pending-node refusal timing, numeric authenticity/getter avoidance, cumulative budgets, input preservation and deeply frozen output.

A certificate for a constant or zero-chord cubic is permitted and is NOT a statement of simple curve/cut validity, mesh embedding, shell correctness or clinical accuracy.
