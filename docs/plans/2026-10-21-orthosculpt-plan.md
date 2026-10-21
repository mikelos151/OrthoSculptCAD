# OrthoSculpt CAD Implementation Plan

> For implementer: TDD throughout. Write a failing behavioural test, run it to observe missing behaviour, implement minimally, run it green, then repeat. Keep evidence in docs/verification/<owner>.md. Never substitute fabricated output.

**Goal:** Working locally exercised five-step O&P engineering application, plus attempt a verified Windows executable.
**Architecture:** React UI uses pure typed geometry for browser fallback, Rust interval slicing via bounded binary Tauri IPC in desktop. Separate import and CAM modules. Local-only no accounts/network/patient fixtures.
**Tech Stack:** Tauri 2, Rust, React19, TypeScript, Three, Vite, Tailwind4, Vitest, Playwright.

## 1. Foundation — parent
Write shared types, configuration and docs; install packages; use `npm test` and `npm run build`. Freeze API before dispatching disjoint owners.
## 2. Geometry — geometry owner
Files src/geometry/**, tests/geometry*.test.ts. Each cycle: analytic cylinder perimeter/area/AP/ML → interval slicing → open loop invalidation → topology → safe caps → PCA → Gram-Schmidt → calibration → Hermite brushes → smooth → scaling → signed heatmap. Run `npx vitest run tests/geometry*.test.ts`. Check analytical error and malformed input, no invented guarantees.
## 3. IO and shell — IO owner
Files src/io/**, src/manufacturing/**, tests/io*.test.ts, tests/manufacturing*.test.ts. Each cycle: coloured PLY → STL ascii/binary → OBJ assets safety → project roundtrip validation → CSV → shell on open capped-distal mesh → STL/3MF binary/XML verification. Run Vitest focused tests; block unsafe adapter and CNC fabrication.
## 4. UI — UI owner
Files src/App.tsx, src/main.tsx, src/components/**, src/styles.css, tests/ui*.test.ts. Build five-step real geometry flow, real Three raycast and brushes, raw RGB texture display, SVG section and tape table, undo, project and exports, clear demo/research labels. Fail a pure workflow validation test before implementation; test route and invalid inputs. Parent does real browser verification.
## 5. Native — Rust owner
Files crates/ortho-geometry/** and src-tauri/**. Rust red-green tests for byte bounds, finite/index input, real triangle slicing, ordered loop metrics, invalid contour detection. Tauri v2 CSP, no shell/network/filesystem privileges. `cargo test --manifest-path crates/ortho-geometry/Cargo.toml`; `cargo check --manifest-path src-tauri/Cargo.toml`. Document exact response protocol.
## 6. Integration — parent
Write tests/native*.test.ts before bridge; run browser fallback and real native bridge. Build front end; run browser import→repair→alignment→measure→calibrate→brush→undo→STL/3MF and project reload. Independent spec and quality reviews; remediate with regression tests. Audit dependencies. Build native exe when prerequisites available, smoke-launch and record bounds/errors. Package source ZIP without node_modules/targets or private user documents. Deliver links + exact test results and gaps.
