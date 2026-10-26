# E2E-02 — native Worker budget after comparison project download

## Outcome: reproduced, regression RED

Real Playwright Chromium **156.0.8078.4**, existing server `http://127.0.0.1:4176`, no production changes, no server restart, no dist rebuild.

```bash
npx playwright test e2e/v02-worker-budget.spec.ts --reporter=list --output=test-results-worker-budget
```

Actual execution: **1 failed test**, approximately **2.8 minutes**. Four independent fresh browser contexts reproduced the exact visible alert in all four contexts. The first affected download was respectively **1, 1, 3, 2**. Thus **7 downloads actually completed**, of which **3 were clean** and **4 produced the alert**. The bounded plan was up to 5 downloads per context / 20 total; each context stops immediately after its first failure. This is not a claim that 20 downloads ran, nor a guarantee that every first download fails.

All failed iterations had already recovered both real, distinct same-Z SVG contours, the expected `Δ obwodu: -12,5 mm`, and visible 3D canvas before the strict no-alert assertion failed. Four screenshots show the recovered geometry coexisting with:

> Error: Silnik zajęty: osiągnięto limit obliczeń.

No `pageerror`, external HTTP request or CSP violation was recorded in any context. No geometry/production-source fix was attempted.

## Exact served candidate

The supplied frozen candidate identifier is the SHA-256 of **index.html**, not of the JS entry:

| Served object | SHA-256 |
| --- | --- |
| `/` / `dist/index.html` | `a985dc1bba97dbe369ed8627092e658656cfe7cdeb684e862ee48a0db250a91b` |
| `/assets/index-DVLn8Ywk.js` | `29957c9161f8c19e54da05d52cee2712e51c11946973fba28319e0aa2325c581` |
| `/assets/compute-CycYmv1L.js` | `95da1133852c6a1f641713443ce43dd67cd28d09ee559cf44ea37ebb5e585724` |
| `/assets/worker-D6uiTdBI.js` | `908f0af4179ba82c5e8ce4b98fa064d2b819289959419c645e5b22b3b7f68c20` |

Entry and compute hashes were read from the running server; index was checked both on disk and from HTTP. The bundle contains the admission guard `if(d>=2)throw Error(...)` **before** `new Worker(...)`. Current `src/compute/client.ts` may include newer diagnostics than this frozen bundle. Results above apply to the served frozen candidate only; they do not establish the behavior of a later rebuild.

## Minimal natural workflow

1. `importRGB(page)` from unchanged `e2e/helpers.ts`: public synthetic closed RGB PLY, **354 vertices / 704 triangles**, confirm millimetres.
2. Rectification step; set circumference change `-10`; apply and await the successful notification.
3. Set cross-section Z to `50`; await real Worker engine caption.
4. Enable working-reference comparison and await one reference SVG polygon and one current polygon, distinct points, same `Z 50,0 mm`, expected circumference delta.
5. Unchanged `project(page)` helper: open save dialog, select plaintext, explicitly acknowledge risk, click real download, read actual downloaded JSON. Assert 354 × 3 position values.
6. Await **both contours again**, expected delta and visible 3D, then strictly assert zero alerts, including any observed transient alert.
7. Repeat naturally, at most five downloads per fresh context, four contexts. No extra rapid forced interaction or injected application state.

## Native lifecycle evidence

Files under `docs/verification/v02-worker-budget-evidence/`:

- `summary.json`: origin, browser version, exact completed counts, privacy observations and failures.
- `session-1.json` through `session-4.json`: native constructor attempts/successes, real postMessage metadata (`workerId`, request id, generation, kind/op), replies, terminate calls, timestamps, live-worker snapshots and alert appearance.
- `session-1-failure.png` through `session-4-failure.png`: public synthetic model only.

Retained Playwright trace: `test-results-worker-budget/v02-worker-budget-E2E-02-p-02948-ative-compute-Worker-budget/trace.zip`.

`installWorkerBudgetProbe` wraps the real native constructor and native postMessage/terminate; it records metadata and invokes native behavior. It never changes payloads, transfer lists, responses, cancellation or timeouts, and never delays a response. DOM MutationObserver records alert appearance. Display workers are categorized separately, not counted in the compute pool. **No display Worker was constructed in these small-fixture runs**; the actual 3D view rendered WebGL2. Observational JS necessarily adds logging overhead, so the measured reproduction frequency is not an uninstrumented probability estimate.

Representative session 1 (milliseconds relative to navigation):

| Time | Native event | Compute workers alive |
| ---: | --- | --- |
| 9206.6 | before download 1; both established slice engines | #9 slice, #10 slice |
| 13285.3–13285.4 | both old engines terminate | none |
| 13547.4–13547.7 | #11 constructed, real `init` posted | #11 init |
| 13674.1–13674.2 | #12 constructed, real `task/topology` posted | #11 init, #12 topology |
| 13753.8 | #11 terminated during rebuild cleanup | #12 topology |
| 13756.4 | exact limit alert appears | #12 topology |
| 13995.4 onward | topology completes/terminates; analyze then runs | budget reused |
| 17529.9 | both real contours recovered; alert still present | two replacement slice engines |

Every failing context has the same critical pattern: an `init` and `task/topology` occupy the two slots after download, then the initializing engine is terminated and the limit alert appears. The maximum observed simultaneous **compute count is 2**, never 3. This is consistent with the admission guard rejecting an attempted third **WorkerClient before reaching the native constructor**. An alert snapshot showing only one worker is therefore not evidence against prior exhaustion: cleanup has already released the other slot by the time the DOM observer runs.

## Cause assessment and limits

**Confirmed:** transient scheduling/admission contention between an index initialization and the background topology audit during post-save reconstruction, rather than an ever-growing native-worker leak. The old comparison pair was actually terminated. Geometry later recovers while the error notification remains. The pool is application-enforced, not Chromium's global Worker capacity.

**Source/bundle-supported mechanism:** `App.tsx` audit effect (inspection lines 396–409) depends on `[mesh, busy]`, sets `checking=true`, and schedules audit after 80 ms. Main-index effect (416–456) gates on rendered `checking` and schedules construction after 100 ms. Reference effect (457–471) gates on the same rendered value but constructs immediately. The frozen JS entry contains these same 80 ms / 100 ms / immediate paths. Completing a save toggles `busy` despite unchanged geometry and restarts this coordination. Calling `setChecking(true)` in one passive effect is not a synchronous barrier against other effects from that same render observing the previous `checking=false`.

Ranked explanations checked against observations:

1. **Background-audit/index admission race:** supported in all four lifecycle traces by simultaneous `init` + `topology`, immediately followed by exact guard alert. Most likely mechanism.
2. **Leaked old comparison workers:** contradicted for these failures by native termination of both old slice workers and return to zero before reconstruction.
3. **Display Worker consumes shared budget:** contradicted for these runs by zero display-worker constructions and a compute-only shared guard.
4. **Browser Worker creation failure / malformed download:** contradicted by no native constructor-error events, a valid parsed downloaded project, and the exact application budget guard message rather than native-startup error.

**Not directly captured:** the precise JavaScript call stack of the rejected third WorkerClient. The guard throws before native Worker instrumentation can observe it. Therefore attributing that rejected request specifically to the 100 ms main-index timer versus an additional reference rebuild remains an inference from source ordering, not a captured constructor stack. No claim of a fully proven React scheduler sequence beyond the native events above.

## Recommended smallest fix to validate (not implemented)

Introduce a synchronous/shared admission phase for audit-versus-slice reconstruction, rather than relying exclusively on React `checking` state set by another effect. Mark audit intent synchronously before any new slice constructor can run, and have both slice effects honor that intent until audit finishes; then publish both comparison engines. Preserve abort/disposal semantics and the limit of two. An alternative narrow optimization is to reuse a still-valid audit for the same mesh revision after a save-only busy cycle, with explicit handling for interrupted/uncompleted audits; do not simply remove cancellation or omit an audit after a real mesh change.

Do **not** hide the alert, add test sleeps, raise MAX_WORKERS blindly, retry forever, or count display workers against compute. Acceptance gate after an owner rebuild: rerun this unchanged strict test and require all **20 actual downloads** to complete with both real contours, expected delta and no current or latched alert. Then run broader real-browser cancellation/gesture regression gates owned elsewhere. This investigation does not claim a verified production fix.
