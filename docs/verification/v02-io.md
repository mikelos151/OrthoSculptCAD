# v0.2 Workspace / project IO verification

## Delivered scope and trust boundary

Local TypeScript modules only; no UI changes, key service, account, network IO, telemetry, localStorage or IndexedDB. `src/workspace/types.ts` and `src/io/index.ts` were not edited. The caller must wire imports/exports and retain the existing **File.size <=128 MiB check before File.text()/arrayBuffer()**. String APIs cannot prevent allocations that happened before they were called.

The case identifier is pseudonymous, not anonymous. Technical notes/context must not contain direct patient identifiers. The journal is an operator-maintained operation log, **not a digital signature, authenticated operator identity, complete mesh replay archive, clinical frame proof or clinical approval**. A SHA256 geometry digest does not sign the project or operator. There is no claim that every historical mesh revision can be restored.

## Contracts

- `createWorkspace(caseDetails?: Partial<CaseDetails>, nowISO?): WorkspaceState` creates revision 0 with an explicit `start` entry. Defaults: caseCode `CASE`, unspecified side, unknown liner, empty note/context, no registration.
- `validateWorkspace(unknown): WorkspaceState` validates and copies all nested data. Strict keys/types, canonical UTC ISO milliseconds, nondecreasing dates, contiguous journal revisions, matching first/last timestamps and revision. Maximum **2000 entries**, including start; appending at the cap fails without silently discarding history.
- `appendWorkspaceEvent(state, event, nowISO?): WorkspaceState` validates both current state and candidate, copies metadata/events/parameters/registration, leaves the input untouched. `caseDetails` updates require `case-update`; non-null registration updates require `register` and the immediately preceding source revision. Unspecified/changed side clears registration; no mirror operation occurs.
- caseCode: ASCII `[A-Za-z0-9_-]`, 1–40 characters. Note <=500, scanContext <=200, label 1–200. Strings reject control characters and malformed Unicode. Parameters: <=32 primitive entries, safe ASCII keys 1–40, strings <=200, finite numbers with absolute value <=1e12, booleans/null; nested values, dangerous prototype keys and unknown fields fail, never clamp.
- Registration: three finite 3D landmark tuples within ±100000 mm, explicit matching left/right side, flexion ±30 degrees, sixteen finite column-major matrix entries, affine bottom row `[0,0,0,1]`. The 3x3 part must be orthonormal with determinant ~1 (tolerance 1e-6), so reflection, scale and shear fail. Applying the matrix to distal landmark index 2 must place it at origin within `1e-4 + 1e-9 * max(abs(distal))` mm. Registration source revision must precede a `register` event. This checks recorded data consistency, not anatomical correctness.
- `fingerprintMesh(mesh): Promise<string>` uses real WebCrypto SHA-256. Bytes are exactly `uint32LE vertexCount`, `uint32LE triangleCount`, followed by `float32LE positions` and `uint32LE indices`; lowercase hexadecimal output. Name, source, RGB, UV and texture are not hashed.
- Three-argument `saveProject(mesh, originalPositions, tapes)` still writes strict **v1**. Supplying fourth `workspace` writes **v2**, retaining the same `format`, `units`, `mesh`, `originalPositions`, `tapes` fields and adding `workspace`. `loadProject` strictly requires workspace only for v2; legacy v1 output has no workspace property. The UI/caller must create an explicit migration/import journal entry for v1 rather than inventing previous history.
- Project raw number types, Float32 overflow, fractional/negative indices, RGB bounds, metadata and texture/UV compatibility are checked before typed geometry allocation.

## Protected file format

`protectProject(blob,password): Promise<Blob>`, `unprotectProject(text,password): Promise<string>`, `isProtectedProject(text): boolean`.

Strict JSON envelope v1 has **only** `format`, `version`, `salt`, `iv`, `ciphertext`. Format is `OrthoSculptProtectedProject`, version is numeric `1`. Salt/IV/ciphertext are canonical standard base64. The work factor is fixed by version, never supplied by the file; extra fields such as `iterations` fail before KDF. `isProtectedProject` is a bounded format-routing hint, not authentication/schema acceptance; damaged marked envelopes still route to protected loading.

- PBKDF2-HMAC-SHA256 **600000 iterations**, AES-256-GCM, random 16-byte salt, random 12-byte IV, 128-bit tag appended to ciphertext, non-extractable WebCrypto key.
- Exact AAD UTF-8 string: `OrthoSculptProtectedProject:1:PBKDF2-SHA256:AES-256-GCM`.
- Password length 12–1024 JS string code units; malformed Unicode rejected; no trim/normalization, no persistence/logging. All test phrases/data are synthetic. Real operator passwords belong only in the local UI, never chat/fixtures. There is no promise of reliable password/plaintext zeroization in JavaScript.
- Envelope schema, size, base64 syntax/decoded length/canonical padding checked before large decode or KDF. Blob.size checked before reading encryption plaintext. Both input and actual output have size checks.
- Wrong password, altered ciphertext/salt/IV, unsupported version/format and invalid envelopes all reject with `Nieprawidłowe hasło lub uszkodzony plik.`; no partial plaintext is returned. Caller validates decrypted JSON using `loadProject` before publishing state.

### Derived bounds (exported in src/io/cryptoLimits.ts)

| Bound | Bytes / chars |
|---|---:|
| File / envelope UTF-8 maximum | 134217728 bytes (128 MiB) |
| Metadata reserve | 4096 bytes |
| Ciphertext base64 maximum | 134213632 characters |
| Ciphertext including tag maximum | 100660224 bytes |
| Plaintext maximum | 100660208 bytes |
| GCM tag | 16 bytes |
| Actual fixed envelope metadata at max field lengths | 126 bytes |

Derivation: `base64Chars = floor((fileBytes - reserve)/4)*4`; `ciphertextBytes = base64Chars/4*3`; `plaintextBytes = ciphertextBytes - 16`. Thus plaintext is below 96 MiB and `4*ceil((plaintextBytes+16)/3)+reserve <=128 MiB`. Plain v1/v2 files retain the existing 128 MiB limit; encryption of a larger otherwise valid plain project fails with a size error rather than emitting a file the loader cannot open.

### Source verification

Official OWASP Password Storage Cheat Sheet, checked through official-domain search result during implementation:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

The source states PBKDF2 with HMAC-SHA256 and a work factor of 600000 or more (in its FIPS-related recommendation). This provides the work-factor reference, **not a FIPS/compliance claim** for this application. Direct `web_extract` was unavailable because the configured search backend is search-only; the official-domain result supplied the quoted recommendation.

## Actual RED → GREEN runs

All commands ran with real installed npm/Node and Vitest v4.1.12, not mocked runner output. The following are incremental production slices, not tests written after a completed implementation:

| Command suffix after `npm test --` | Observed RED | Observed GREEN |
|---|---|---|
| `tests/v02-io-workspace.test.ts` initial | 1 failed: missing workspace module/API | 1 passed |
| same, strict validation slice | 1 failed / 1 passed: malformed workspace accepted | 2 passed |
| same, registration slice | 1 failed / 3 passed: registration returned null | 4 passed |
| `tests/v02-io-fingerprint.test.ts` | 1 failed: fingerprintMesh not a function | 1 passed (5 with workspace at that stage) |
| `tests/v02-io-project.test.ts tests/io-project.test.ts` | 1 failed / 5 passed: fourth argument still produced v1 | 6 passed |
| workspace rigid-frame hardening | 1 failed / 4 passed: scaled registration accepted | 5 passed; later independent scale/shear/translation regression rows and actual Detailed registration compatibility added |
| `tests/v02-io-crypto.test.ts` initial | 1 failed: missing protected module | 1 passed real randomized encrypted roundtrip |
| same, negative/resource preflight slice | 2 failed / 1 passed: raw WebCrypto error; short password accepted | 3 passed |
| workspace stale registration slice | 1 failed / 5 passed: old source registration accepted | 6 passed |
| project preallocation slice | 1 failed / 1 passed: malformed metadata reached Float32Array constructor | 2 passed (7 including legacy project tests) |

Additional verification tests cover independent Node `pbkdf2Sync` + AES256GCM decryption of WebCrypto output, exact AAD/tag/work factor, UTF-8/chunked base64 roundtrip, randomized salt/IV, absence of plaintext identifiers/password in ciphertext, wrong password/tamper, strict unknown fields, all size equations and an actual oversized ~128 MiB ciphertext envelope rejected without KDF or large base64 decode. Constructor/read/KDF spies observe rejection boundaries; cryptographic roundtrips use real cryptography, not mock responses.

## Final focused results

```
npm test -- tests/v02-io-workspace.test.ts tests/v02-io-fingerprint.test.ts tests/v02-io-project.test.ts tests/v02-io-crypto.test.ts
Test Files 4 passed (4)
Tests 18 passed (18)
```

```
npm test -- tests/v02-io-workspace.test.ts tests/v02-io-fingerprint.test.ts tests/v02-io-project.test.ts tests/v02-io-crypto.test.ts tests/io.test.ts tests/io-stl.test.ts tests/io-security.test.ts tests/io-project.test.ts tests/io-obj.test.ts
Test Files 9 passed (9)
Tests 45 passed (45)
```

Scoped strict typecheck (production modules and their four test files) exited **0**, with no diagnostics:

```
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck src/workspace/index.ts src/io/project.ts src/io/protectedProject.ts src/io/cryptoLimits.ts tests/v02-io-workspace.test.ts tests/v02-io-fingerprint.test.ts tests/v02-io-project.test.ts tests/v02-io-crypto.test.ts
```

## Concurrent integration boundary — not a green full release

A real `npm test` while other owners were still editing returned **37 passing / 3 failing test files**, **197 passing / 2 failing tests** (199 collected tests; one additional failed suite). Failures were outside this ownership: missing `components/ProjectDialogs` in UI, the changed geometry normal-direction guard in `geometry-contract.test.ts`, and Worker cold-start timeout in `v02-compute-transport.test.ts`. A whole-project `node node_modules/typescript/bin/tsc -b --pretty false` likewise failed on in-progress App/compute/geometry integration; it produced no diagnostics for the owned workspace/IO modules. Do not interpret focused GREEN as a complete application build/release gate.

Browser encrypted download/reimport, password-dialog UX, File.size UI gate, unsaved guards, Worker E2E, packaged/native execution and clinical validation are for the parent/integration owners. No such acceptance is claimed by these Node tests. No unrelated files were staged or committed.
