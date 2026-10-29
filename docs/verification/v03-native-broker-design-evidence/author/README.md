# G1b design handoff — DESIGN ONLY

## Artifact
`C:/Users/sandr/OrthoSculptCAD/docs/plans/v03-native-broker-g1b-design.md`

The plan is complete for parent review, not approved implementation. G1b1 is independently implementable without G2/G3. G1b2 introduces actual callsite ownership/mode fencing. Mixed-positive real retained owner + arena-analyze remains UNACCEPTED until G2c/G3 exist. No broker or ledger extension has been implemented.

## Evidence and replay
From `C:/Users/sandr/OrthoSculptCAD`, using existing dependencies only:

```bash
node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design/native-boundary-probe.mjs
node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design/verify-design.mjs
```

Original stdout/stderr is preserved in `native-probe.log` and `design-validation.log`; both commands exited 0. Native probe is existing-behavior coverage, NOT a production TDD RED/GREEN or a new adapter. It compiles unchanged accepted G1a with repository TypeScript, imports the emitted module into a fresh Chromium page, runs a real Worker from a Blob, records genuine messages, returns the real transferred AB and invokes native terminate. No server/network/fake response/worker flags are used. Browser closes in finally. The recorded transpile hash is intentionally a separate build identity, not the parent's earlier accepted bundle.

Observed: logical transfer does not detach; real detach makes ordinary G1a retain/reclassify/transfer refuse; returned native backing has a new JS wrapper; naive registerExisting creates a second charged allocation. A real DataCloneError leaves the AB attached. These are boundary facts motivating the internal adapter design, not proof that the proposed fix exists. Physical Worker thread completion/GC/RSS, new broker correlation, main SHA lifecycle, G2c/G3 and G4 remain unproved.

`source-start.json` and `source-end.json` contain SHA256 for every tracked regular file, unchanged HEAD and actual porcelain status. The final repository change is solely the new untracked plan. `design-validation.json` is explicitly SELF_CHECK_PASS_PARENT_REVIEW_PENDING: actual API/AST checks, bounded-document checks and proposed ABI arithmetic, not independent review. No full test suite was rerun and no previous acceptance totals are reused as new execution results.

## Parent review request
Before any production code, independently review the exact final plan hash in `handoff.json`, especially sole-ref batch preparation, real return rebinding under one ledger, all-or-nothing send rollback, remote-new grants, native-result reservation, two logical slot domains with physical incarnation correlation, release h1/pending h2, remote terminal versus main-settle separation, and source-mode activation prerequisites. Preserve full mixed-positive HOLD while allowing the independent primitive pion to start after design approval.

## Scope and operational issue
Only this new plan and this scratch directory were written. No stage/commit/reset/stash, dependencies, production/tests, other docs, profiles, skills, configuration, ZIP or dist changes. Initial Python subprocess invocation of git failed with WinError 5 (exit 1); shell git redirected its actual outputs into scratch, then Python read them successfully. This was an environment invocation issue, not a source change; all subsequent verification commands succeeded. Procedural notes remain here rather than changing read-only skills.
