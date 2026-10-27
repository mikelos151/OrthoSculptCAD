# M0a numerics — actual execution evidence

Repository: `C:/Users/sandr/OrthoSculptCAD`
Branch observed before editing: `feature/trimline-v03`
HEAD observed before editing: `e3f28e2849b5c6de72d642eb8928b08133eeeb93`
Owned source/test files only: `src/trimline/numerics.ts`, `tests/v03-numerics.test.ts`.

## Command used for every numbered test log

```bash
'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/v03-numerics.test.ts --maxWorkers=1 --reporter=verbose
```

Executed from the repository, with stderr merged into stdout and `set -o pipefail`, teeing each run to this scratch directory. RED exit codes were 1 (expected assertion failures); GREEN exit codes were 0.

| Slice | RED log | GREEN log |
|---|---|---|
| Minimal construction | 01-construction-red.log | 02-construction-green.log |
| Fraction validation | 03-validation-red.log | 04-validation-green.log |
| Exact operations/comparison | 05-operations-red.log | 06-operations-green.log |
| Owned cumulative budgets | 07-budget-red.log | 08-budget-green.log |
| Freeze/forge/accessors | 09-forge-red.log | 10-forge-green.log |
| Finite bit decoding | 11-decode-red.log | 12-decode-green.log |
| First direct-rounding regression | 13-rounding-red.log | 14-rounding-green.log |
| Zero/subnormal/min-normal | 15-subnormal-red.log | 16-subnormal-green.log |
| Normal ties/overflow threshold | 17-overflow-red.log | 18-overflow-green.log |

First RED was `expected undefined to be type of 'function'`, not a missing module or syntax/import error. The module at that point contained only the Rational interface. Supplemental properties were added after the vertical slices were GREEN; their execution is in `19-properties-green.log` and the final run.

## Final verification

- `23-final-tests.log`: 1 file passed, **13 tests passed**, 0 failed; process exit 0.
- `24-final-tsc.log`: empty successful compiler output; process exit 0 from:

```bash
'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

- Earlier successful invocations are preserved as `20-tsc.log`, `21-final-tests.log`, and `22-final-tsc.log`. The last rerun followed a conservative preflight check before even the bounded 24-bit decoder significand is converted to BigInt.
- The final shell invocation explicitly printed `targeted_test_exit=0` and `tsc_exit=0`.

## Scope and deliberate limits

No application integration, build, full-suite/browser run, staging, commit, stash, reset, release files or other-agent files were edited. The Python oracle/fixture was not imported, read or used as an implementation dependency.

The implementation admits conservative BUDGET_EXCEEDED refusals even if cancellation or later reduction could produce a small result. Input magnitudes are checked before abs/stringification/gcd; product/sum/shift widths are checked before allocation. Budgets bound primitive work and bit sizes, not aggregate process memory or real-time deadlines. The only Float64 rational conversion in these owned files is the explicit negative-control regression test proving double rounding; production converts only bounded mantissa/bit-related integers.
