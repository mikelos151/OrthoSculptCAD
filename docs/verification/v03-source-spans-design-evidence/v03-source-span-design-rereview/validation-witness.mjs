// Read-only domain/JS-intrinsic witness, NOT a SourceCandidateStore implementation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertMesh, assertTexture } from 'file:///C:/Users/sandr/OrthoSculptCAD/src/io/validation.ts';

const root = 'C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-span-design-rereview/';
const validationPath = 'C:/Users/sandr/OrthoSculptCAD/src/io/validation.ts';
let assertions = 0;
const check = (condition) => { assert.ok(condition); assertions++; };
const rejects = (fn) => { assert.throws(fn); assertions++; };
const accepts = (fn) => { assert.doesNotThrow(fn); assertions++; };
const mesh = {
  name: 'candidate',
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

// TextEncoder replaces lone surrogates with U+FFFD. The actual validator must
// exclude that concrete collision on its accepted metadata input domain.
const encoder = new TextEncoder();
check(Buffer.from(encoder.encode('\ud800')).equals(Buffer.from(encoder.encode('\ufffd'))));
for (let unit = 0xd800; unit <= 0xdfff; unit++) {
  const lone = String.fromCharCode(unit);
  rejects(() => assertMesh({ ...mesh, name: lone }));
  rejects(() => assertMesh({ ...mesh, name: `x${lone}y` }));
}
const acceptedNames = [
  '', 'ASCII', '\u007f', '\u0080', '\u07ff', '\u0800', '\ud7ff',
  '\ue000', '\ufffd', '\ud800\udc00', '\udbff\udfff', '\ud83d\ude00',
  '\u00e9', 'e\u0301', 'A'.repeat(200), '\ud83d\ude00'.repeat(100),
];
const encoded = [];
for (const name of acceptedNames) {
  accepts(() => assertMesh({ ...mesh, name }));
  const required = Buffer.byteLength(name, 'utf8');
  const reserved = new Uint8Array(required);
  const result = encoder.encodeInto(name, reserved);
  check(result.read === name.length && result.written === required);
  check(Buffer.from(reserved).equals(Buffer.from(name, 'utf8')));
  encoded.push(Buffer.from(reserved).toString('hex'));
}
check(new Set(encoded).size === acceptedNames.length);
for (const name of ['\0', '\u001f', '\ufffe', '\uffff', 'A'.repeat(201), '\ud83d\ude00'.repeat(101)]) {
  rejects(() => assertMesh({ ...mesh, name }));
}
// No normalization is specified: canonically equivalent but distinct names
// retain distinct bytes. Valid surrogate pairs are accepted under /u semantics.
check(!Buffer.from('\u00e9').equals(Buffer.from('e\u0301')));
for (const source of [undefined, 'synthetic', 'imported']) accepts(() => assertMesh({ ...mesh, source }));
for (const source of [null, '', 'S']) rejects(() => assertMesh({ ...mesh, source }));
for (const texture of ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,AA==']) {
  accepts(() => assertTexture(texture));
  accepts(() => assertMesh({ ...mesh, textureUrl: texture, uvs: new Float32Array(6) }));
  check([...texture].every((c) => c.codePointAt(0) < 128));
}
for (const texture of ['data:image/png;base64,\ud800', 'data:image/png;base64,\ufffd', 'https://example.invalid/a.png']) {
  rejects(() => assertTexture(texture));
}

// Feasibility witness for captured intrinsic accessors, not a new input policy.
const taPrototype = Object.getPrototypeOf(Float32Array.prototype);
const get = (prototype, name) => Object.getOwnPropertyDescriptor(prototype, name).get;
const taBuffer = get(taPrototype, 'buffer');
const taOffset = get(taPrototype, 'byteOffset');
const taBytes = get(taPrototype, 'byteLength');
const abBytes = get(ArrayBuffer.prototype, 'byteLength');
const abResizable = get(ArrayBuffer.prototype, 'resizable');
const abDetached = get(ArrayBuffer.prototype, 'detached');
const backing = new ArrayBuffer(32);
const view = new Float32Array(backing, 8, 3);
view.set([1, -0, 3]);
let ownGetterCalls = 0;
for (const name of ['buffer', 'byteOffset', 'byteLength', 'length', 'slice']) {
  Object.defineProperty(view, name, { get() { ownGetterCalls++; throw new Error('caller own getter'); } });
}
check(taBuffer.call(view) === backing);
check(taOffset.call(view) === 8 && taBytes.call(view) === 12);
check(abBytes.call(backing) === 32 && abResizable.call(backing) === false && abDetached.call(backing) === false);
check(ownGetterCalls === 0);
const copied = new Uint8Array(taBuffer.call(view), taOffset.call(view), taBytes.call(view)).slice();
check(copied.byteLength === 12);
check(new DataView(copied.buffer).getUint32(4, true) === 0x80000000);
check(ownGetterCalls === 0);
const resizable = new ArrayBuffer(16, { maxByteLength: 32 });
check(abResizable.call(resizable) === true);
rejects(() => abBytes.call(new SharedArrayBuffer(16)));
const detached = new ArrayBuffer(16);
structuredClone(detached, { transfer: [detached] });
check(abDetached.call(detached) === true);

const result = {
  kind: 'actual-validation-and-intrinsic-feasibility-witness-not-store-test',
  passed: true,
  assertions,
  actualValidationFile: validationPath,
  validationSha256: createHash('sha256').update(readFileSync(validationPath)).digest('hex'),
  loneSurrogateCodeUnitsChecked: 0x800,
  acceptedNameCases: acceptedNames.length,
  conclusions: [
    'Actual assertMesh rejects all lone surrogate code units in both single-character and embedded names.',
    'Actual assertMesh accepts valid surrogate pairs, including supplementary boundary cases; /u does not reject paired surrogates.',
    'The concrete TextEncoder lone-surrogate/replacement collision is outside the accepted name domain.',
    'Accepted name samples retain UTF-8 identity without normalization; encodeInto writes directly into the exact-sized destination.',
    'Actual texture grammar is ASCII-only; source is an explicit closed enum.',
    'Captured TypedArray accessors expose the true nonzero-offset view without touching own getters; raw-range copying preserves negative-zero bits.',
    'Captured ArrayBuffer accessors distinguish resizable/detached backing and reject SharedArrayBuffer.',
  ],
  limitations: 'No SourceCandidateStore exists or is implemented/tested here. No lifecycle implementation, SHA cancellation, allocation accounting, global RAM, admission, Worker fence, seam bridge, UI or product claim is made.',
};
writeFileSync(root + 'validation-witness-result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
