# Rust slice validity — two confirmed review defects

Scope: only `crates/ortho-geometry/src/slice.rs`, its existing Rust integration tests, and this verification note. No frontend, bridge, packet schema, dependency, security-policy, or architecture changes. No staging or commits.

## Reproductions and causes

1. The side-wall prism with XY contour `[[0,0],[5,0],[0,4],[4,4],[1,1]]`, Z levels 0/100, and slice Z=50 was accepted as valid despite its self-intersecting boundary. The returned diagnostic loop had area 2 and perimeter 21.05997848692523. Degree-two graph topology and positive shoelace area do not establish polygon simplicity.
2. A square side-wall prism `[[0,0],[10,0],[10,10],[0,10]]` with additional duplicate triangle `[0,1,5]` was accepted at Z=50 with area 100 and perimeter 40. The old combined non-coplanar incidence counter allowed two coincident interior-crossing segments, conflating them with legitimate shared mesh edges lying on the slice plane.

Both exact reproductions were added as real Rust integration tests **before changing production code**. Release execution returned `14 passed; 2 failed`; both failures showed `valid: true` for the confirmed invalid inputs.

## Changes

- Require a simple polygon before setting `valid=true`: reject non-adjacent crossings, collinear overlaps, endpoint/interior touching, and adjacent backtracking. Ordinary collinear continuation remains permitted.
- Use local-coordinate orientation predicates with geometric/roundoff tolerance, and a sorted X-AABB sweep with Y-AABB pruning.
- Bound the sweep to **4,000,000 active-set visits**, including visits rejected by Y bounds or expired X intervals. A pathological active set therefore cannot silently cause uncontrolled quadratic validation. Budget exhaustion returns `valid=false`; diagnostic loops and metrics remain available. Sorting is O(N log N), storage O(N), and active scanning is capped; no wall-clock guarantee is claimed.
- Track coplanar, on-plane-edge, and interior-crossing incidences separately. Two genuine shared on-plane-edge incidences remain accepted, including unwelded triangle soup; repeated interior-crossing segments are invalid. Mixed crossing/on-plane or crossing/coplanar coincidences are also invalid.
- Preserve the response packet layout and existing segment/output limits.

## Regression coverage

The existing 14 tests remain, including unwelded triangle soup, coplanar caps, shared-vertex/edge planes, interval BVH pruning, exact response encoding, and the segment limit. Six additional test functions cover:

- Both exact confirmed reproductions, retaining diagnostic loops.
- Adjacent backtracking, non-adjacent collinear overlap, vertex-on-edge contact, and a repeated non-adjacent vertex.
- Valid concave, near-collinear, closely separated parallel, and large translated contours (coordinates near 900,000), at bottom/interior/top planes.
- Reversed-winding and geometrically duplicated/unwelded crossing faces, including a packet with `valid=0` and the retained loop.
- A small valid serpentine boundary and a larger simple boundary that fails closed when validation work is exhausted.

## Real execution

Commands were run from `C:/Users/sandr/OrthoSculptCAD` with the installed toolchain; no toolchain or security changes were made.

```text
C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path crates/ortho-geometry/Cargo.toml --test geometry -- --nocapture
# Initial RED: 14 passed; 2 failed; finished in 0.29s.
# Both confirmed invalid inputs were accepted before the fix.

C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path crates/ortho-geometry/Cargo.toml --test geometry
# Expanded RED: 15 passed; 5 failed; finished in 0.29s.
# After polygon-only fix: 18 passed; 2 failed; finished in 0.32s.
# Only duplicate-crossing tests still failed at that intermediate step.

C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path crates/ortho-geometry/Cargo.toml
# Final GREEN: 20 passed; 0 failed; 0 ignored; finished in 0.31s.

C:/Users/sandr/.cargo/bin/cargo.exe test --release --manifest-path src-tauri/state-tests/Cargo.toml
# GREEN: 5 passed; 0 failed; 0 ignored; finished in 0.00s.
# Includes native smoke measurements, state validation, and navigation policy tests.
```

Additional checks: `git diff --check` exited 0 (Git emitted only LF/CRLF conversion warnings). `cargo clippy --release --manifest-path crates/ortho-geometry/Cargo.toml --all-targets -- -D warnings` could not run because `cargo-clippy.exe` is not installed for the existing stable MSVC toolchain; no installation was attempted.

Windows Application Control returned OS error 4551 for an initial separate regression harness and one intermediate rebuilt geometry test executable. These attempts did not execute tests and are not counted as successful runs. The separate harness was removed, and coverage resides in the existing `tests/geometry.rs`; the final complete core suite executed successfully as shown above. Full Tauri verification was not retried because of the previously established Windows security block. No protections were disabled or bypassed. These checks establish regression behavior for the tested inputs, not clinical suitability or general 3D mesh validity.
