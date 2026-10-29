# M0c3a — independent test-oracle interchange (not a production proof format)

This freezes literal fixture names for the TS implementation and independent Python oracle. The authoritative API, canonical digest byte layout and scope remain `v03-source-bound-spans-design.md` (reviewed SHA-256 `c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf`). No adapter, audit admission, public snapshot export or project format is introduced.

Python owns `tests/reference/v03_source_candidate_oracle.py`, `tests/reference/test_v03_source_candidate_oracle.py`, and the generated `tests/fixtures/v03-source-candidate-oracle.json`. TS owns `src/trimline/source-candidate.ts` and `tests/v03-source-candidate.test.ts`. Owners do not modify or inspect one another's implementation. The TS tests may consume the completed generated JSON. Parent runs real interoperability after both deliveries.

## Literal JSON shape

```ts
interface OracleFixture {
  format: 'OrthoSculptSourceCandidateOracle';
  version: 1;
  cases: Array<{
    id: string; // unique, synthetic case label
    mesh: {
      name: string; // required, may be empty; real io/validation.ts rules
      positionsBits: number[]; // uint32 raw finite F32 patterns, xyz order
      indices: number[]; // uint32 ordered source indices
      colorsBits?: number[]; // raw finite F32, RGB stride 3
      uvsBits?: number[]; // raw finite F32, UV stride 2
      source?: 'synthetic' | 'imported'; // absent encodes byte 0
      textureUrl?: string; // valid embedded PNG/JPEG and requires UVs
    };
    stamp: {
      projectEpoch: number;
      revision: number;
      generation: number;
      units: 'mm';
      unitsConfirmed: true;
      frameId: string;
    };
    expected: {
      sourceDigest: string; // sha256:<64 lowercase hex>, whole canonical preimage
      vertexCount: number;
      faceCount: number;
      faces: Array<{
        sourceFace: number; // triangle ordinal, never an index offset
        vertexIDs: [number, number, number]; // preserve source order
        positionBits: [[number, number, number], [number, number, number], [number, number, number]];
        triangle: [Rat3, Rat3, Rat3];
      }>;
    };
  }>;
}
interface Rat { n: string; d: string } // reduced signed numerator, positive denominator
 type Rat3 = [Rat, Rat, Rat];
```

## Independence and execution

- Oracle uses stdlib `hashlib` for the normative canonical preimage and integer/Fraction decoding of finite raw F32 bits, not a call to the TS implementation and not Float64-to-rational conversion.
- Valid fixtures only; a bounded suite of at most 32 small meshes, all declared synthetic test data. Optional `source: 'imported'` cases test this metadata encoding only and do not represent patient scans. Include full-source changes outside face 0, face/index permutations, negative zero, subnormal and large finite coordinates, optional RGB/UV/texture, Unicode names, source tags and frame/stamp changes. Epoch/revision/generation are excluded from the digest, not forgotten from the runtime stamp.
- Every expected face is included in source-face order; all ratios canonical. Generate the fixture by actual execution and retain its exact hash. Tests compare live `describe`/`resolveFace` results from the real store with these values; never relabel a handcrafted oracle document as producer output.
- Runtime `sourceId` and opaque handles are deliberately not predictable oracle fields. Their authenticity/uniqueness, deep freezing, caller isolation, lifecycle, budget rollback, same-context binding and native SHA completion must be tested separately against the real store.
- JSON consumption here is test scaffolding only. Validate fixture integers before typed-array construction. This does not implement or replace the separate raw-number import validation gate.
- This oracle does not establish audit admission, trusted physical registration, global RAM accounting, complete smooth curves, cutting, shell/collar or clinical safety.
