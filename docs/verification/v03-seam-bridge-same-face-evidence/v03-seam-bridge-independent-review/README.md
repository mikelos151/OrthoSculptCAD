# Scratch seam bridge feasibility spike

## Verdict: VALIDATED — local bridge only; full builder remains PARTIAL / NOT CERTIFIED

The exact algebraic intrinsic-G1 reference can be kept separate from a certified rational-control approximation and the **real unchanged** `certifyFaceCubic` + `sampleCubic` path on the supplied two synthetic triangles. Both the given straight pair and a genuinely curved pair were exercised. The rational cubics and their PL representations are **approximations, not exact G1 curves**. This is not a C0/edge-only replacement for the approved product.

Everything created by this experiment is beneath:

`C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-seam-bridge-spike/`

Repository: `C:/Users/sandr/OrthoSculptCAD`, branch `feature/trimline-v03`, HEAD `bd9faa6b10945ea30ed6711ae5d180e66d9ea4f9`. No repository code/docs/tests edits, staging, configuration/dependency/skill changes, browser, application integration, full test suite, patient data or clinical claims. Existing verifier paths are **`tests/reference/`**, not the delegation's nonexistent `public/tests/reference/`.

## Run it

Requires the already installed `python`, `node`, and the repository's existing TypeScript compiler. No installation.

```bash
cd C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-seam-bridge-spike
python -B -m unittest -v
python -B spike.py
python -B spike.py --curved
python -B secondary.py

# Expected exit 1: certified too-coarse control approximation refusal.
python -B spike.py --curved --bits 2
# Expected exit 1: 1/500 + 1/250 exceeds the EXISTING 1/200 curve budget.
python -B spike.py --delta 1/500
# Expected exit 2: UNKNOWN, before oversized dyadic-grid work.
python -B spike.py --bits 257
```

Each primary CLI run creates a fresh `runs/cli-<id>/` directory, compiles only the three existing TS modules into this scratch directory's `compiled/`, invokes real Node, invokes the public independent Python verifier, then invokes the separate independent algebraic bridge checker. It prints the new `results.json` path. No partial successful result is returned after a verification failure. All negative runs retain `refusal.json`. The shared compiled files are deterministic; do not run compilation concurrently with a different build configuration.

Recheck the final preserved curved evidence independently:

```bash
python -B check_bridge.py --input runs/cli-c6818b7b743d/results.json
python -B C:/Users/sandr/OrthoSculptCAD/tests/reference/v03_face_cubic_verify.py --input runs/cli-c6818b7b743d/real-face-proof.json
```

`-B` / `PYTHONDONTWRITEBYTECODE=1` also prevent Python imports from writing cache files in the read-only repository.

## Actual execution evidence

Root `results.json` is the collected acceptance manifest with exact source/compiled/harness SHA-256 hashes, all final run paths, budget, counts, negative records, and TDD log pairs. Fresh reexecution creates new UUID paths, not replacements for preserved acceptance files.

| Final run | Real public verifier result | Leaves per span |
|---|---|---|
| `runs/cli-99d70b2cbaae/results.json` — straight ideal | PASS, 2 cases, 2 leaves, 4 samples | 1, 1 |
| `runs/cli-c6818b7b743d/results.json` — genuinely curved ideal | PASS, 2 cases, 8 leaves, 10 samples | 4, 4 |
| `runs/secondary-local-842b4239cdda/results.json` — optional Q(sqrt(3)) local cubic | PASS, 1 case, 4 leaves, 5 samples | 4 |

Scratch-only unit suite: **12 tests passed**, actual transcript `green-10.log`. Ten vertical RED→GREEN cycles are retained as `red-01.log`…`red-10.log` / `green-01.log`…`green-10.log`. For cycle 2, use `red-02-assertion.log`: the initially preserved `red-02.log` was an explicit unimplemented-behavior exception, then the test was corrected to produce the required assertion RED **before implementing curved behavior**. Other recorded REDs include missing end-to-end bridge, acceptance of overspending before its guard existed, missing independent checker, missing refusal evidence, false exact-G1 claims accepted by the earlier checker, and missing complete-CLI independent verification. Additional already-supported arithmetic/mutation cases are coverage, not invented extra RED cycles.

RED-era output is intentionally retained, including an overspending run that passed before the guard was implemented. **Only paths selected in root `results.json` and the final CLI logs are acceptance evidence.**

The final negative CLIs actually returned:

- `cli-coarse.log`: exit 1, REFUSED; first failing control has exact squared error `49/1024 > 1/1000000`; `runs/cli-d7faa7c35467/refusal.json` records the original and coarse controls, coefficients and exact sign. Real producer not called.
- `cli-overspent.log`: exit 1, REFUSED; exact sum `3/500 > 1/200`; `runs/cli-b648131cf46f/refusal.json`. Real producer not called.
- `cli-cap.log`: exit 2, UNKNOWN; grid request outside explicit 1..64-bit cap; `runs/cli-f757841405ae/refusal.json`. Real producer not called.
- Unit coverage exercises exhausted operation/bit budgets and a **nonzero** algebraic value whose bounded interval contains zero: unresolved cancellation is UNKNOWN, never equality.
- Canonical bridge-only error and false-G1 mutants are retained under their test run directories. The unchanged real FaceCubic proof still passes its public verifier, while the corrupted algebraic bridge claim is rejected. Mutants are not labeled actual producer output.

## What is exact, and what is approximated?

Primary faces are exactly the required integer/F32 triangles:

- F = (A=(0,0,0), B=(1,0,0), C=(0,1,0));
- G = (B,A,D=(0,-1,1)); shared E=(1/2,0,0).

The straight controls are the required `P_k=E+(k-3)*v/12`, `Q_k=E+k*w/12`, with `v=(1,-1,0)` and `w=(1,-sqrt(2)/2,sqrt(2)/2)`.

For the curved pair, change only non-seam-derivative controls:

- add `(0,1/32,0)` to P0 and P1;
- add `(0,-1/32,1/32)` to Q2 and Q3.

P2/P3 and Q0/Q1 remain unchanged. Thus derivatives are **exactly** `v/4` and `w/4`; unfolding gives U(w/4)=v/4 by coefficient identity, hence intrinsic C1 at this seam (stronger than required G1). Positive nonzero derivative identity is checked. The reference endpoints and real rational/PL seam endpoint are exactly E, not epsilon-welded.

The cross determinants of each curved span's endpoint chord with its seam tangent are both `-1/128`, proving both spans are genuinely nonstraight. All nonzero barycentric lower bounds in the curved witness are at least `1/32`; the seam's zero weights are legal. Full per-control algebraic barycentrics, world controls, rational dyadic controls, exact squared errors and outward enclosures are in each `results.json` / `bridge-reference.json`. Hull checks apply to **all controls and the whole Bernstein hull**, not sampled points.

The rational-only bad tangent witness has unfolded determinant `1-sqrt(2)`, coefficients `(1,-1)`, exact negative sign. Actual final rational cubics have determinant

`134225919/2147483648 - (94948677/2147483648)*sqrt(2)`,

also certified nonzero. This explicitly separates exact ideal smoothness from approximation. An interval containing zero does not prove equality: only both zero coefficients do.

The ideal straight witness's **rounded rational cubics are slightly perturbed**, so even those real sampler upper bounds are nonzero. They are not offered as proof that a curved sampler works. The genuinely curved run separately requires subdivision and has positive real sampler bounds:

- F: `209735681/79164837199872` mm²;
- G: `279948083/52776558133248` mm².

## Existing error budget, no fourth component

The chosen partition is computed with exact Fraction arithmetic:

`delta=1/1000 mm`, `tau=1/250 mm`, `delta+tau=1/200 mm`.

For every control, the helper computes the **world** squared difference in Q(sqrt(2)), then proves it is at most delta², using an exact sign and an independently checked outward rational enclosure. The final maximum squared-error upper bound for both primary runs is

`116699838861703889164030812074644519 / 100353353393387804136910732226917626776911872` mm²,

which was also checked exactly to be ≤`1/268435456` and hence well below delta²=`1/1000000`. No point sampling substitutes for this proof.

For B_ideal(t) and B_rat(t), their control differences enter with nonnegative unit-sum Bernstein weights. Therefore `||B_ideal(t)-B_rat(t)|| <= max_i ||P_i-R_i|| <= delta` **for every t**. The unchanged real sampler and public verifier supply `||B_rat(t)-L(t)|| <= tau` on complete parameter coverage. Triangle inequality yields `||B_ideal(t)-L(t)|| <= delta+tau=1/200`; same-parameter pairing also gives the two directed image-distance bounds.

Hit/canonicalization remains **1/200 mm** and full-C quantization remains **1/100 mm**, untouched and uncertified here. No error is borrowed from them and no new budget is introduced.

## Exact helper and independent checks

`spike.py` uses `(a,b)` Fractions for `a+b*sqrt(d)`, with d fixed to 2 or 3 per context. Only the needed addition, subtraction, multiplication and rational scaling are implemented; this is not a general algebraic-number/inversion/root-isolation library.

- Max 512-bit raw coefficient/intermediate bounds and 200,000 charged rational/helper operations, checked before field arithmetic allocations.
- Sign refinement at 8,16,32,64,128 bits; isqrt-derived rational sqrt enclosures. Unresolved sign or exhausted caps → UNKNOWN.
- Exact equality/zero uses coefficient identity, **never numerical near-zero**.
- Dyadic controls floor the first two barycentrics on a `2^-bits` grid and define the third as `1-a-b`; nonnegativity, exact sum and unchanged seam controls are verified. No floating geometry, Float64 fallback or transcendental approximation is used.
- TS receives literal rational input reconstructed through its genuine `rational` API; integer source coordinates are reconstructed with genuine `fromFloat32Bits`. One genuine shared TS context covers decoding, containment and sampling for the whole bundle (1024 bits / 2,000,000 operations, below the existing caps).

`producer.cjs` is only a harness. It exports the **unaltered** real containment and approximation result objects as `OrthoSculptFaceCubicProof/v1`; bigint→decimal-string is the sole output transformation. `real-face-proof.json` passes the unmodified public `v03_face_cubic_verify.py`, which calls its public Bezier verifier on the whole bundle. No field renaming or fabricated API response is involved.

`check_bridge.py` imports neither the bridge helper nor TS. It independently reconstructs the literal reference formulas, expands squared errors coefficientwise, verifies integer square-root enclosure identities and control/world binding to the real proof, and checks derivative/determinant identities. It is a **fixed-size local experimental checker**, not a hardened untrusted general proof-file parser. Its own coefficient inputs are capped and formulas have fixed degree/iteration counts; the old public verifier retains its own separate budgets. No wall-time/RSS guarantee is claimed by these arithmetic caps.

## Optional Q(sqrt(3)) case and degree growth

`secondary.py` builds one curved local cubic in the integer/F32 face `((1,1,0),(0,0,0),(1,-1,1))`. Its conormal `(1,-1,1)` has norm²=3. It checks four Q(sqrt(3)) controls, dyadic approximation, an independently expanded coefficient error and integer-isqrt enclosure, then the same real TS/public-verifier path. Its starting seam endpoint is exact. This is **one separate local span**, not a second multi-seam smoothness construction.

Local per-control bounds do not inherently require a single field containing every radical encountered elsewhere: certify each control against its own field/enclosure and take a rational maximum. That observation is evidenced by the separate sqrt2/sqrt3 local cases. It **does not establish** that constructing a long exact G1 curve, choosing shared controls, or proving relations between successive seams avoids composita. Shared symbolic dependencies may require Q(sqrt2,sqrt3,...) with degree growing as large as 2^m for independent square classes, plus coefficient-bit/operation growth. The experiment rejects mixed contexts rather than silently extending the field. No bound on those dependencies, long-curve construction cost, general root isolation or cancellation resolution was proven.

## What remains blocked

No source binding/full-S admission; no global routing, corridor choice, root isolation, regularity/simplicity/isotopy, vertex fans, arrangements, embedded Float32 C construction, full-C quantization, cut/shell/collar, Worker/App integration or clinical validation. Intrinsic seam smoothness is not world G1/C1 across a crease. A feasible local two-span bridge **does not** establish full-builder viability.

Recommendation: retain this as feasibility evidence for a separately specified algebraic-reference/rational-approximation representation. Before a builder, bound cross-seam symbolic dependencies and independently certify its geometric/global gates. Do not change the accepted runtime APIs or weaken the approved product to absorb unresolved work.
