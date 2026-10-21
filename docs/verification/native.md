# Native verification — OrthoSculpt CAD

## Current status

After independent review, two contour-validity defects were fixed. The current core suite is **20/20 PASS**, rerun by the parent; state tests remain **5/5 PASS**. See `native-review-fixes.md` and `FINAL.md`. The earlier 14-test counts below are historical execution records, not the final regression count. Full Tauri compilation/launch remains blocked.

Rust stable 1.99.1 and MSVC linker work. **Full Tauri build/check is blocked by Windows application-control policy (os error 4551)** when Cargo executes dependency build scripts (release: `camino-17237375d5893837/build-script-build`; debug: serde_core, quote, icu_normalizer_data). No security controls were disabled. This is not a missing-Rust claim and is not a successful desktop build.

Real successful execution so far:
- `C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path crates/ortho-geometry/Cargo.toml`: **14 passed, 0 failed**, including the 250,000-segment limit, unwelded triangle soup, coplanar caps and isolated tangent vertex. An earlier debug run passed 11/11; after adding the final 3 tests, Windows blocked the newly linked debug harness (4551), while the final release suite executed successfully.
- `C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path src-tauri/state-tests/Cargo.toml`: 5 passed, 0 failed (actual state, navigation policy and synthetic CLI report generator, not mocks).
- `python src-tauri/tests/security_config.py`: 2 passed.
- `PATH=/c/Users/sandr/.cargo/bin:$PATH node node_modules/@tauri-apps/cli/tauri.js info`: Rust/Cargo/MSVC/WebView2 all detected, WebView2 `155.0.4283.62`; Tauri `2.12.5`, tauri-build `2.7.4`; config parsed.

A few debug/release test harness executables were blocked with 4551; the successful focused and full core commands above are genuine. The unused empty library/doctest harness is disabled because all core coverage lives in the integration suite. `cargo check --manifest-path src-tauri/Cargo.toml` and release variant both failed at dependency build-script execution before checking shell application code. A standalone `native-smoke.exe` was compiled but Windows blocked its launch with the same 4551; its exact report generator did execute successfully inside the state test harness. Desktop/WebView IPC and Blob downloads remain unverified until application-control approval permits the build. No Rust install was repeated; optional rustfmt/clippy components are absent, so `cargo fmt`/`cargo clippy` could not run.

## Synthetic native smoke route

Full GUI exe supports `orthosculpt-cad.exe --self-test <new-report-path>`. It executes the real bounded upload, Rust cylinder slicing, binary response, invalid-upload retention and stale-generation rejection, then writes only synthetic JSON using `create_new` (never overwrites a chosen existing file). This is OS CLI only, not a JavaScript command. Since full Tauri compilation is blocked, this exe route is implemented but not launch-verified.

Independent GUI-free driver: `cargo run --release --manifest-path src-tauri/state-tests/Cargo.toml --example native-smoke` (compiled here, launch blocked with 4551). Its same report generator **was executed** by `cargo test --release --manifest-path src-tauri/state-tests/Cargo.toml -- --nocapture`, yielding:

```json
{"synthetic":true,"valid":true,"vertices":512,"triangles":512,"z":60.0,"perimeter":251.32110315389045,"area":5026.043563981722,"ap":80.0,"ml":80.0,"queryMs":0.4203,"candidateTriangles":512,"visitedNodes":127,"responseBytes":8264,"generation":2,"malformedRejected":true,"staleRejected":true,"guiTested":false,"clinicalValidation":false}
```

The timing is a single measured test run, not a latency promise. Actual WebView command invocation, rendering, File/Blob save and navigation-handler wiring still need native smoke verification.

## Binary protocol (version 1, all little-endian)

Input `upload_mesh`: raw `Uint8Array`/`ArrayBuffer`, **not JSON numeric arrays**.
- offset 0: u32 magic `0x4f534344`
- offset 4: u32 version `1`
- offset 8: u32 vertexCount
- offset 12: u32 triangleCount
- offset 16: vertexCount triples of f32 XYZ
- then triangleCount triples of u32 zero-based vertex indices
- exact length `16 + 12*vertexCount + 12*triangleCount`; trailing bytes rejected.

Limits checked before mesh-vector allocation: 3..1,000,000 vertices; 1..2,000,000 triangles; packet <=36,000,016 bytes. All coordinates must be finite and |coordinate|<=1,000,000 mm; indices in bounds; triangles with squared double-area <=1e-24 are rejected, not silently removed. Tauri already owns an incoming body before parser validation; this is **not** a transport-layer memory cap or zero-copy.

Upload result JSON: `{generation, vertices, triangles, bounds:[[minX,minY,minZ],[maxX,maxY,maxZ]]}`. Validated mesh/index replaces old state atomically. A malformed upload preserves the old mesh and generation. Generation is u64 restricted to JavaScript's safe-integer range. Call `slice_mesh({z,generation})`; stale generations reject. Optional missing generation selects current mesh for direct callers; the frontend bridge should always provide it. A change during query also rejects.

Output `slice_mesh`: raw `tauri::ipc::Response`, no JSON envelope.
- offset 0: u32 magic `0x4f53534c`
- offset 4: u32 version `1`
- offset 8: u32 valid (0/1)
- offset 12: u32 loopCount
- offset 16: f64 z
- offset 24: f64 queryMs (measured wall-clock in core, not a performance guarantee)
- each loop: u32 closed, u32 pointCount, f64 perimeter, f64 area, f64 AP, f64 ML, then pointCount pairs f64 X,Y
- base header 32 bytes; each loop header 40 bytes; each XY pair 16 bytes. Closed loops omit a repeated first point.

AP is Y extent; ML is X extent; area is unsigned shoelace mm² using translated origin; perimeter is ordered segment length mm. `valid` requires exactly one closed nonbranching positive-area contour. Disconnected loops are returned separately but overall invalid; never summed into one clinical measurement. Open/branch results are diagnostics only. No-intersection result has valid=0 and loopCount=0. Core rejects nonfinite/out-of-range z. Error results are rejected Tauri promises, not binary packets.

## Implementation/security

Pure core uses no third-party dependencies. A balanced reusable z-interval BVH, built once on upload, visits/prunes nodes and returns intersecting candidate leaves; individual triangles are tested after pruning. Tests verify node visitation and pruning on a 100-level cylinder. Worst-case triangles spanning the entire height are not promised sublinear queries. Segment graph weld tolerance is `max(1e-8 mm, mesh span*1e-9)`; a maximum of 250,000 unique section segments bounds graph/response work. Coplanar internal edges cancel; boundary edges shared with side facets deduplicate. No claim of full mesh repair, medical validation, self-intersection certification, <0.5ms or zero-copy.

The shell grants only custom mesh upload/slice permissions to local main window. The app command manifest in `build.rs` generates `allow-upload-mesh` and `allow-slice-mesh`; do not add manual permissions with duplicate identifiers. Main window is created programmatically (`create:false` in config) to attach a tested origin-only navigation allowlist and deny new windows. It includes no shell/fs/http/opener/updater plugins. CSP allows local app/IPC, inline styles for React/Three, local Blob/data images, no remote script/font/texture hosts and no unsafe-eval. Development websocket is restricted to 127.0.0.1:4174. No app telemetry, networking, autoload of patient files or persistence. Frontend file selection/download remains explicitly operator-triggered browser File/Blob flow.

Build paths: `frontendDist=../dist`, `devUrl=http://127.0.0.1:4174`, `beforeBuildCommand=npm run build`, `beforeDevCommand=npm run dev`. `bundle.active=false`; requested artifact is an exe, not an installer. Once policy allows execution: `cargo build --release --manifest-path src-tauri/Cargo.toml` after frontend build. Windows11 requires existing WebView2 runtime; actual launch and file-download smoke test are still required.
