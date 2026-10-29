# Distant invalid-S — scratch-only proof/fixture spike

## Verdict: VALIDATED behavior; admission remains BLOCKED

Actual existing `capture → bindFaceCubic → sampleCubic` succeeds for all five tiny TESTDATA meshes, while a fresh public `auditMesh` rejects the three invalid whole-S variants. This is coverage of existing behavior, **not** new production behavior, a fake RED, a clinical assessment, a v0.3 release, or acceptance of tracer 4 admission.

### Reproduce

From Git Bash (no dependency installation, repository writes or full browser suite):

```bash
PYTHONDONTWRITEBYTECODE=1 python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-admission-fixtures/run_spike.py
```

The runner compiles only the existing audit/source-candidate/cubic dependency closure into this directory, with the actual repository `tsconfig.json` strict ES2022/ESNext/bundler mode. Only emit-related options/root/output/include differ. Each Node child receives process-local `NODE_OPTIONS='--max-old-space-size=128 --max-semi-space-size=8'`. A Node-only resolver hook adds `.js` within the owned emitted build directory; production sources and emitted JS are not rewritten. Python is stdlib only and disables bytecode writes into read-only reference directories.

### Verified cases

Mesh name, synthetic source metadata, all RGB/UV words, frame, units and stamp are identical. IDs live **outside** `MeshData.name`. Local face 0 is always ordered `[0,2,1]`; its three vertex positions/raw bits and all attributes are unchanged. Every bound cubic uses the same interior barycentric controls and the same arithmetic context through resolution, binding and sampling. Each actual local approximation has 12 leaves/13 samples and is identical across variants.

| Case | Actual required whole-S audit | Detail |
|---|---|---|
| Positive corrected S: cube, 8 V / 12 F | PASS | complete; outward; finite signedVolume=1; 8 required checks pass |
| Remove distant face 2 `[4,5,6]` | FAIL / outward UNKNOWN | 3 boundary edges; watertight fail |
| Duplicate distant face 2 | FAIL / outward UNKNOWN | 3 nonmanifold edges, 3 bad links, duplicate intersection `[2,12]` |
| Change only remote v6.z to exactly `-1/4` | FAIL / outward UNKNOWN | self-intersections fail, includes `[0,2]`; `complete=false` retained because of numeric ambiguity |
| Swap only distant faces 2/3 | PASS | positive control: legitimate order change also changes whole-source digest |
| Positive S, pair budget 0 | UNKNOWN | incomplete; zero tests; self-intersections/outward unresolved; no auto-PASS |

`minimum-thickness` is explicitly UNKNOWN for **every** report, including positive S. “PASS” above means only the eight named source-quality checks plus completion/orientation/volume conditions—not all checks, wall thickness, material safety or admission.

Policy stays `maxPairTests=2_000_000`, `maxIntersections=100`; existing 200000 V/F caps are unchanged. No repair, orientation fallback, native Worker, large geometry, benchmark, credential or PHI handling was used.

### Independent exact reference

`exact_fixtures.py` uses stdlib `Fraction`, undirected-edge incidence with directed uses, per-vertex link graphs, edge-connected face components and an exact origin determinant sum. It is not a clone of the production floating-point audit/BVH/intersection implementation. The source oracle is reused read-only for integer binary32 decoding, current literal `positionsBits/indices/name/source/colorsBits/uvsBits` input validation and canonical SHA preimage/`hashlib`.

The positive cube has 18 edges each used twice, eight cyclic links, one component and exact signed volume 1. The crossing mutant has the **same entire indexed topology** and nondegenerate faces, yet exact positive signed volume `7/12`: topology and positive volume alone do not prove embedding. Removed/duplicate models have exact determinant sums `5/6` and `7/6`; these are algebraic sums, **not enclosed-volume validity claims** for invalid/open surfaces.

For crossing faces `[0,2,1]` and `[4,5,6]` (index-disjoint), the stored F32 coordinates imply `z=1-(5/4)w6`, so `w6=4/5` on z=0. The intersection is the positive-length segment from `(4/5,4/5,0)` to `(1,4/5,0)`.
For **every real** `0<s<1`, let `p(s)=((4+s)/5,4/5,0)`:

- face 0 barycentrics `((1-s)/5,4/5,s/5)`;
- face 2 barycentrics `((1-s)/5,s/5,4/5)`.

The harness independently verifies the linear-polynomial coefficients of both affine maps and unit sums. Each affine weight has nonnegative endpoints, not both zero, therefore is strictly positive throughout the open parameter interval. This proves a continuum of relative-interior intersection, not a finite numeric sample. Endpoint barycentrics and squared length `1/25` are exact in `exact-intersection-witness.json`.

An explicit hypothetical raw cube of height 2 and separate B translated +1 X are stored in `catalog.json`; corrected S is height 1. These are different synthetic geometries, not evidence of an actual production preparation/repair operation.

### Native hash + actual saved PASS experiment

For all five cases native Node WebCrypto SHA-256 from actual `store.capture` matches independently recomputed Python `hashlib` whole-source digest. All five digests differ; there is no metadata renaming confound. Every ordered resolved face is compared with the independent oracle.

`actual-positive-audit.json` is an actual fresh positive audit report. `synthetic-untrusted-saved-PASS-claims.json` contains three **clearly labeled synthetic untrusted associations**: mutated case + correctly recomputed digest + that unchanged old report. It is not a response from any external API, project format or trusted service. The same-count selfcross mutant defeats even a trivial saved face-count check; the actual fresh audit nonetheless reports FAIL and incomplete/UNKNOWN. The experiment never installs or accepts such claims.

`actual-local-face-proof.json` uses the **existing unchanged** `OrthoSculptFaceCubicProof/v1` literal schema. The existing public inverse containment verifier calls the complete existing Bézier verifier once for the whole five-case bundle: 5 cases, 60 leaves, 65 samples PASS. A deliberately off-plane control is rejected in the focused regression tests. This local certificate does not prove whole-source validity.

### Files and evidence

- `catalog.json`: literal small TESTDATA/proposal catalog, not production reload protocol.
- `exact-topology.json`, `exact-intersection-witness.json`: independent exact findings.
- `actual-audit-reports.json`, `actual-positive-audit.json`, `actual-results.json`: actual existing-code reports.
- `actual-local-face-proof.json`: untouched literal local producer proof schema.
- `synthetic-untrusted-saved-PASS-claims.json`: labeled untrusted old-report associations only.
- `exact_fixtures.py`, `actual_harness.mjs`, `test_fixture_regression.py`, `run_spike.py`: runnable harness/tests/runner.
- `commands-and-results.json`, `logs/`, `hashes.json`, `handoff.json`: exact commands, real exit/output, source/emitted/artifact hashes and compact handoff.

## What remains blocked

The audit here runs on the explicit public input mesh, **separate from the candidate's inaccessible private bytes**. No private retained-source audit owner, audit working-set/shared-ledger bound, source admission token, cut/shell/export consumer block or native Worker/stale-publication fences were implemented or tested. The positive candidate is still not source authority. Tracer 4 must not be called accepted until that real owner/admission/consumer path exists and is independently exercised. Numeric ambiguity in the selfcross report is honestly retained as incomplete, even though known exact and actual intersection witnesses already make it FAIL.

No repository source/tests/docs/profiles/config files were modified. The other architect's in-flight files were neither read nor modified (their untracked path appears only in read-only `git status`). Reads were limited to the relevant existing source/dependencies, tests/reference/schema context and the expressly requested existing source plan. All authored artifacts live in this owned scratch directory. Repository HEAD/source hashes, build hashes, commands and full observed outputs are recorded by the runner. No global skill edits were made: scratch-only ownership takes precedence; the reusable workflow is recorded here. The resolved packaged-Git subprocess restriction is documented in `environment-note.md`.
