# UI v0.2 — verification and integration notes

## Implemented surface

Operate / Inspect, five existing stages, existing Segoe / navy / mint vocabulary. No cloud, telemetry, patient registry or automatic medical-data persistence added. Workspace details use a pseudonymous case code, explicit side, optional liner/context/technical note. Side changes clear registration without mirroring geometry. Revisions are a bounded operation journal, not a replayable mesh archive. Bounded session undo retains geometry, working baseline, tape evidence **and physical-unit confirmation**.

New-project/import/demo/project-reload replacements use an explicit native dialog; Escape stays in the current project. `beforeunload` covers edited work, active operations and an unfinished stroke. Generating a download tracks the revision of the generated copy, but does not claim disk durability or clear the protection flag.

Project save defaults to encrypted manual-password mode (minimum 12 characters; shared crypto limits). Plain JSON remains available only after an explicit health-data warning and acknowledgement. Password fields are cleared after submission; no secret logging/storage was added. File size is checked before `File.text()`. Files are named `caseCode-rN…`. Report generation takes a frozen mesh/workspace/tape snapshot, remeasures current and reference on **exactly the same Z levels**, recomputes current quality, supplies both measurement/audit revisions, and calls the real asynchronous report builder.

3D reference is a transparent, non-pickable amber overlay. 2D comparison shares actual coordinates/extents/Z and shows measured circumference differences; it never interpolates another-height reference. Reference is explicitly the working baseline after orientation/calibration, not raw input. Source RGB remains separate from display colours. STL and 3MF positive surfaces are distinguished from the acknowledged research shell. Offset is not labelled guaranteed wall thickness; minimum thickness remains UNKNOWN.

## Strict pure-logic TDD

Observed RED then GREEN for synchronous task exclusion/generation fencing, non-durable copy tracking, fail-closed normal tools, completed-stroke journal parameters, independent/bounded undo snapshots including units, incomplete/empty quality evidence, stroke execution/budget and aborting a real transport boundary without detaching UI arrays. Static-render regressions cover pseudonymous metadata, Polish quality labels, password/default-encryption affordances and same-height reference contours.

Final focused command:

```text
npx vitest run tests/v02-ui-state.test.ts tests/v02-ui-panels.test.ts tests/v02-ui-dialogs.test.ts tests/v02-ui-comparison.test.ts tests/v02-ui-worker.test.ts tests/ui-workflow.test.ts
```

Result: **6 files / 20 tests passed** (includes unchanged legacy workflow tests). `npm run build` passed TypeScript and Vite; both shared geometry Worker and `display.worker` were emitted. Existing large-main-chunk warning remains (~1.52 MB minified). `git diff --check` passed for owned tracked files, with Git's existing LF/CRLF advisory only.

Whole-suite snapshot while other owners were actively writing review regressions: 249 total, 243 passed, 4 failed, 2 pending. Failures were outside UI ownership: legacy `geometry-contract.test.ts` now reaches the stricter outward-normal guard; three parent-authored RED report review regressions concern journal-parameter leakage, array-coerced positive quality and empty quality evidence. Do not describe that snapshot as a full green release. The parent owns reconciliation and full release/E2E acceptance.

## Real Chromium acceptance performed

Used an isolated Playwright Chromium instance, not the user's locked Brave profile. No fake geometry or fake backend responses.

- Demo → units → left side/code update → PCA → measurements: 14 actual rows, matching reference Z levels, overlapping real reference contour and measured 0.0 mm difference before edits.
- Default save choice was `encrypted`. Explicit plaintext path downloaded and read back a v2 project named `TT_SMOKE-r4.oscad.json`; side `left`, revision 4, source `synthetic`, journal `start/import/units/case-update/align-pca` were preserved.
- New-project after download still opened the work-protection dialog; Escape retained the project.
- Actual report download `TT_SMOKE-r4-raport.html` contained the case code and a 64-character geometry hash, and contained no `<script` element.
- Viewport 390 px had `documentElement.scrollWidth === 390`; localStorage and sessionStorage both had zero entries. Observed zero external network requests and zero page errors in this scenario. Desktop comparison and mobile screenshots were visually inspected.
- A legally loadable project with an outward current mesh and a collapsed finite baseline was exercised in Chromium: the heatmap Worker rejected it, the checkbox reverted to false, no heatmap legend appeared, save remained enabled, stage 4 remained usable and there were zero page errors. The dedicated pure regression was observed RED before adding independent baseline audit and GREEN afterwards.
- Undo of a `cm` → `mm` confirmation returned to stage 1, restored the editable `cm` selection and blocked project save until reconfirmed. Native help dialog opened and Escape closed it. Zero page errors.

Evidence (synthetic only; scratch files, not packaged patient data):
`C:/Users/sandr/AppData/Local/hermes/cache/scratch/v02-ui-comparison.png`, `v02-ui-mobile.png`, `v02-ui-project.json`, `v02-ui-report.html`, `v02-ui-stroke-evidence.json`, and reproducible `v02-ui-stroke-smoke.cjs`.

## Brush / heatmap main-thread issue and actual resolution

Integration inspection found that the geometry owner's public `applyBrush` and `deformationColors` now perform a full audit internally. Calling them in pointer moves or a render memo would block the UI despite moving other geometry tasks to Worker.

The UI now **records at most 128 coordinates per gesture**, performs no deformation/audit in pointer-move handlers, and submits the complete stroke to a real, terminable module Worker after release. Publication is atomic behind the same generation/busy gate as other edits. There is deliberately **no live-deformed preview during the gesture**; the UI says so. One successful gesture creates one geometry snapshot and one journal event with mode/radius/strength/actual changed-dab count. No-ops, rejection and cancellation do not publish partial geometry. Signed heatmaps also run in this Worker, not in the render path. The stored baseline is audited independently: current-mesh outward proof is not accepted as baseline proof. An unknown/inward/invalid baseline rejects the map rather than colouring it neutral green. Shared audit/slice workers are aborted/disposed synchronously before mutation/display tasks so cached comparison workers do not exhaust the compute owner's bounded pool.

Actual real-pointer Chromium test used repaired synthetic geometry: **5857 vertices / 11710 triangles**, audited outward. A three-dab relief gesture at 0.1 mm strength produced exactly one `brush-relief` event (`radiusMm:20`, `strength:0.1`, `dabCount:3`), changed coordinates, preserved source RGB and baseline, and undo restored coordinates and baseline exactly. Actual signed-map Worker output was consumed by the UI. Zero page errors.

A separate actual Worker cancellation sample constructed one real browser Worker, called its real `terminate` once, rejected with `AbortError` and preserved the UI source position buffer (70284 bytes). Samples scheduled abort at 40 ms and observed ~142 ms / ~219 ms during earlier renderer/build contention, and ~48 ms in the final repeat, with one 5 ms heartbeat tick in each captured sample. These are noisy Chromium/dev-renderer observations, **not a responsiveness bound or 60 FPS claim**. Core audit work is still repeated per dab inside the Worker; long gestures may remain slow and are cancellable/time-bounded. A cached, proven-safe geometry stroke session API would be a future performance improvement, not simulated functionality here.

## Remaining release boundaries

- Parent-owned full E2E must reconcile legitimate changed labels/dialogs, encryption round-trip/wrong password/tamper, side/registration invalidation, cancellation/stale publication and final report regressions across all owners.
- This subtask did not verify a Windows native executable, regulatory compliance, clinical suitability, manufacturing strength or supplied patient scans. None were claimed.
- HTML/CSV/plain JSON/STL/3MF remain unencrypted outputs; warnings do not replace operator storage/sharing safeguards.
- No changes were made to legacy tests, shared types, IO, geometry, compute or reports by this UI owner. No repository-wide commit was made.
