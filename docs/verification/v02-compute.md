# v0.2 compute verification

## Implemented boundaries

- `runGeometryTask` dispatches analyze, topology, measure, exact-height measureAt, repair, orient, PCA, landmark registration (including its real matrix), calibration, zone scaling and shell construction to `new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})` in browsers.
- Worker calls the actual geometry functions using lazy imports. Repair merges the real operation warnings into the typed topology report rather than dropping them.
- `createWorkerSliceEngine` uploads positions/indices once, creates one worker-owned `SliceIndex`, and reuses it. Slice reads have one active request and at most one newest pending read. Superseded promises reject with AbortError immediately; they are not left pending. Only this read-only API coalesces requests. Mutations do not use latest-wins scheduling.
- AbortSignal on tasks/cold engine creation, or engine dispose, terminates the actual owned worker. Slice calls additionally accept an optional `{signal}`; cancellation closes that index engine and rejects its pending reads. Request IDs and worker generations reject stale publications.
- Pool is **two total live workers**, including cached slice engines. Admission is explicit busy rejection, not an unbounded queue or silent cancellation. One in-flight message/client. Cold worker startup, individual requests and queued slice reads have 120-second bounds; dispose is idempotent.
- Constant-time shape/allocation gates run before worker creation. Copies are bounded to 128 MiB/task, geometry to 2M vertices / 4M triangles. Typed-array copies yield between 262144-element chunks (at most 1 MiB per synchronous chunk), checking cancellation between chunks. O(n) numeric mesh validation and cold index construction run inside the Worker.
- Read-only operations omit RGB/UV/texture payloads. Mesh-changing operations copy and preserve those source attributes and provenance. Explicit scalar/array parameter allowlists avoid copying arbitrary metadata. measureAt accepts at most 2000 finite heights with |Z| <= 1e6, sorts/deduplicates and samples the exact requested planes with one index. Volumes are trapezoidal estimates, null for the first/invalid segment, with midpoint-validity checking as in existing measureMesh.
- Only newly owned input copies transfer to Worker; Worker clones result arrays before transferring output. UI buffers and retained service inputs never enter the return transfer list. There is no SharedArrayBuffer or zero-copy claim. SliceIndex itself makes another internal geometry copy: memory includes input, transport and index/result copies.
- Browser Worker startup/runtime/message errors surface generic diagnostics without worker stack/name data and do not fall back to main-thread TypeScript. No network, persistence, telemetry or synthetic result branch was added.
- `native.ts` Rust upload/generation/binary-response/height validation branch is unchanged. Browser non-native slicing selects Worker. Node with no window and no Worker deliberately runs the same real pure TypeScript functions; this is a test/server adapter, not browser cancellation/performance evidence.

## TDD evidence

Observed RED then GREEN cycles in terminal for: missing compute adapter; missing module-worker dispatch; running AbortSignal cancellation not settling; unnecessary appearance copying and non-yielding cold-copy cancellation; missing worker slice engine; superseded slice promises never settling; browser slicing selecting TypeScript instead of Worker; absent cold worker startup deadline; missing real operation dispatch cases; missing exact-height dispatch; runtime undefined laterality/flexion silently invoking geometry defaults.

Transport tests use a clearly labelled Worker transport double, real structuredClone transfer/detachment semantics and the real worker service/geometry functions. They separately cover two-worker admission, no implicit mutation cancellation, request/generation fences, buffer/appearance/provenance preservation, post-dispose rejection, error/messageerror, request deadline, cold-copy abort and newest-pending read bounds. They are not counted as real Chromium workers.

## Executed acceptance

Command (Git Bash):

```
ORTHO_REAL_WORKER=1 npx vitest run tests/v02-compute-browser.test.ts tests/v02-compute-dispatch.test.ts tests/v02-compute-transport.test.ts tests/native.test.ts tests/native-protocol.test.ts tests/native-limits.test.ts
```

Observed: **6 files, 37 tests passed**. This includes **2 real Chromium acceptance tests**, not mock-only claims. The browser suite is opt-in; default npm test explicitly skips those two tests.

Real Chromium acceptance starts an isolated Vite dev server on an ephemeral loopback port and a static fixture page, without changing the project server config. Playwright observed 12 genuine worker events for 11 operation jobs plus one cached slicing engine. Every operation agreed with the real pure geometry reference, all three cached slice planes agreed, and caller arrays remained attached and unchanged. The exact-height operation returns [50,100,150] for unordered repeated input heights.

Actual cancellation sample from the final run:

```
{"error":"AbortError","posted":true,"created":1,"terminated":1,"ticks":5,"elapsedMs":49,"positionBytes":7200000,"indexBytes":2400000,"triangles":200000}
```

Method: synthetic 200000-triangle fixture, real Worker subclass only observes native constructor/postMessage/terminate (does not replace computation), abort scheduled 20 ms after upload, main-thread heartbeat every 5 ms. Wall time includes chunked copies/upload/startup/cancellation; it is NOT geometry completion time or a throughput guarantee. Other observed runs were approximately 48 ms with 4–5 heartbeat ticks. Hardware queried with Node: Windows win32 release 10.0.26300; Intel Core Ultra 9 275HX; 24 logical CPUs; 31.43 GiB memory. No 60 FPS/0.5 ms claim.

`node node_modules/vite/bin/vite.js build` succeeded and emitted a separate `dist/assets/worker-DCkiZe4L.js` (47.91 kB in that run). This was a web bundling check, not a Tauri/native rebuild.

## Integration owner follow-up / limits

1. **Pool coordination is required in UI:** two cached current/reference engines consume both slots. Dispose cached engines before geometry mutation/measurement jobs, or serialize/coordinate their lifetimes. Even with one cached engine, automatic topology + analyze must be serialized rather than launched together into the one remaining slot. Busy rejection deliberately does not kill an unrelated job/index. This is not a silent fallback policy.
2. Browser acceptance above uses the static Vite fixture, not the application's production CSP or all wizard states. Parent must run integrated UI/revision/cancel E2E and extracted production-asset/CSP tests. Worker must be permitted with a narrow same-origin worker-src policy; no unsafe-eval is required by production compute. The test-only dynamic import loader avoids Vitest rewriting serialized evaluate functions.
3. `SliceEngine.dispose` remains optional for backwards-compatible Rust/Node engines; UI must call `engine.dispose?.()` unless it specifically holds WorkerSliceEngine (dispose required). Direct WorkerSliceEngine creation accepts optional TaskOptions for cold cancellation.
4. Latest full-suite observation while other owners were editing: 231 passed, 1 failed, 2 skipped (43 files / 234 tests). The failure was outside compute: geometry-contract applyBrush fixture rejected by new outward-orientation guard. Subsequent targeted compute/native/Chromium acceptance is green. Full-suite totals will change as other owners add tests.
5. Latest project tsc run reported only in-progress App.tsx / v02-ui-dialogs issues, not compute/native/compute tests. Parent must rerun typecheck after UI convergence. No out-of-scope fixes were made.
6. Node pure fallback cannot interrupt a synchronous CPU-bound pure function. Real browser termination is the cancellation proof. No native executable was rebuilt or launched; Windows AppControl 4551 remains a separate blocked native boundary. No external patient scan/clinical validation was performed.
