/** Owned candidate only: no source admission, audit, cut or export authority.
 * Buffer-byte accounting covers private S and the full SHA preimage, not total
 * application RAM, native crypto working memory, GC timing or JS sandboxing.
 */
import type { MeshData } from '../types';
import { assertMesh, assertTexture } from '../io/validation';
import type { ArithmeticContext } from './numerics';
import { fromFloat32Bits } from './numerics';
import type { ExactTriangle3, CubicBarycentricControls, FaceCubicContainment } from './face-cubic';
import { certifyFaceCubic } from './face-cubic';

declare const sourceCandidateBrand: unique symbol;
export interface SourceCandidate { readonly [sourceCandidateBrand]: true }
export interface SourceStamp {
  readonly projectEpoch: number;
  readonly revision: number;
  readonly generation: number;
  readonly units: 'mm';
  readonly unitsConfirmed: true;
  readonly frameId: string;
}
export interface SourceCandidateLimits { readonly maxOwnedBufferBytes: number }
export interface SourceDescription {
  readonly kind: 'owned-source-candidate-v1';
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly stamp: SourceStamp;
  readonly vertexCount: number;
  readonly faceCount: number;
}
export type VertexIDs = readonly [number, number, number];
export type PositionBits = readonly [VertexIDs, VertexIDs, VertexIDs];
export interface ResolvedCandidateFace {
  readonly source: SourceDescription;
  readonly sourceFace: number;
  readonly vertexIDs: VertexIDs;
  readonly positionBits: PositionBits;
  readonly triangle: ExactTriangle3;
}
export interface CandidateBoundSpan {
  readonly kind: 'candidate-source-face-cubic-v1';
  readonly face: ResolvedCandidateFace;
  readonly containment: FaceCubicContainment;
}
export interface SourceCandidateStore {
  capture(mesh: MeshData, stamp: SourceStamp): Promise<SourceCandidate>;
  describe(source: SourceCandidate): SourceDescription;
  resolveFace(source: SourceCandidate, sourceFace: number, ctx: ArithmeticContext): ResolvedCandidateFace;
  bindFaceCubic(source: SourceCandidate, sourceFace: number, controls: CubicBarycentricControls, ctx: ArithmeticContext): CandidateBoundSpan;
  release(source: SourceCandidate): void;
  dispose(): void;
}
export class SourceCandidateError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'BUDGET_EXCEEDED' | 'SOURCE_IN_USE' | 'STALE_SOURCE' | 'UNAVAILABLE') {
    super(code); this.name = 'SourceCandidateError';
  }
}
const typed = Object.getPrototypeOf(Float32Array.prototype);
const nativeBuffer = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
const nativeOffset = Object.getOwnPropertyDescriptor(typed, 'byteOffset')!.get!;
const nativeBytes = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const nativeKind = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag)!.get!;
const nativeBufferBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const nativeResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')!.get!;
function invalid(): never { throw new SourceCandidateError('INVALID_INPUT'); }
function validationFailure(error: unknown): never {
  // Trusted structural validators throw plain Error for rejected data. Engine
  // allocation failures must remain operational UNKNOWN, not bad-geometry FAIL.
  if (error instanceof RangeError) throw error;
  return invalid();
}
function ownData(object: unknown, key: PropertyKey, optional = false): unknown {
  if (typeof object !== 'object' || object === null) return invalid();
  const d = Object.getOwnPropertyDescriptor(object, key);
  if (!d && optional) return undefined;
  if (!d || !('value' in d)) return invalid();
  return d.value;
}
function viewSize(input: unknown, prototype: object): number {
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== prototype) return invalid();
  try {
    if (nativeKind.call(input) !== (prototype === Float32Array.prototype ? 'Float32Array' : 'Uint32Array')) return invalid();
    const buffer = nativeBuffer.call(input) as ArrayBuffer;
    if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || nativeResizable.call(buffer)) return invalid();
    const bytes = nativeBytes.call(input) as number, offset = nativeOffset.call(input) as number;
    if (bytes === 0 || offset + bytes > nativeBufferBytes.call(buffer)) return invalid();
    return bytes;
  } catch { return invalid(); }
}
function preflight(input: MeshData, stampInput: SourceStamp): { mesh: MeshData; stamp: SourceStamp } {
  const positions = ownData(input, 'positions') as Float32Array;
  const indices = ownData(input, 'indices') as Uint32Array;
  const pBytes = viewSize(positions, Float32Array.prototype), iBytes = viewSize(indices, Uint32Array.prototype);
  const vertices = pBytes / 12, faces = iBytes / 12;
  if (!Number.isInteger(vertices) || vertices < 3 || vertices > 200000 ||
      !Number.isInteger(faces) || faces < 1 || faces > 200000) return invalid();
  const colors = ownData(input, 'colors', true) as Float32Array | undefined;
  const uvs = ownData(input, 'uvs', true) as Float32Array | undefined;
  if (colors !== undefined && viewSize(colors, Float32Array.prototype) !== vertices * 12) return invalid();
  if (uvs !== undefined && viewSize(uvs, Float32Array.prototype) !== vertices * 8) return invalid();
  const name = ownData(input, 'name');
  if (typeof name !== 'string' || name.length > 200 || /[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(name)) return invalid();
  const source = ownData(input, 'source', true);
  if (source !== undefined && source !== 'synthetic' && source !== 'imported') return invalid();
  const textureUrl = ownData(input, 'textureUrl', true);
  if (textureUrl !== undefined) {
    try { assertTexture(textureUrl); } catch (error) { return validationFailure(error); }
    if (uvs === undefined) return invalid();
  }
  const integer = (key: string): number => {
    const value = ownData(stampInput, key);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
    return value;
  };
  const projectEpoch = integer('projectEpoch'), revision = integer('revision'), generation = integer('generation');
  if (ownData(stampInput, 'units') !== 'mm' || ownData(stampInput, 'unitsConfirmed') !== true) return invalid();
  const frameId = ownData(stampInput, 'frameId');
  if (typeof frameId !== 'string' || frameId.length < 1 || frameId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(frameId)) return invalid();
  return { mesh: { positions, indices, colors, uvs, name, source, textureUrl: textureUrl as string | undefined },
    stamp: Object.freeze({ projectEpoch, revision, generation, units: 'mm', unitsConfirmed: true, frameId }) };
}
const encoder = new TextEncoder();
const domain = 'OrthoSculptSourceCandidate\0';
let nextSourceId = 0n;
function utf8Length(text: string): number {
  let n = 0;
  for (const scalar of text) {
    const cp = scalar.codePointAt(0)!;
    n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
  return n;
}
function copyView<T extends Float32Array | Uint32Array>(input: T): T {
  const bytes = nativeBytes.call(input) as number;
  const target = new ArrayBuffer(bytes);
  new Uint8Array(target).set(new Uint8Array(nativeBuffer.call(input), nativeOffset.call(input), bytes));
  return (Object.getPrototypeOf(input) === Uint32Array.prototype ? new Uint32Array(target) : new Float32Array(target)) as T;
}
function sourceBufferBytes(mesh: MeshData): number {
  return [mesh.positions, mesh.indices, mesh.colors, mesh.uvs].reduce((sum, a) =>
    sum + (a === undefined ? 0 : nativeBytes.call(a) as number), 0);
}
function preimageSize(mesh: MeshData, stamp: SourceStamp): number {
  return domain.length + 4 + 8 + sourceBufferBytes(mesh) + 2 + 1 +
    4 + utf8Length(mesh.name) + 1 + (mesh.textureUrl === undefined ? 0 : 4 + utf8Length(mesh.textureUrl)) +
    4 + 2 + 1 + 4 + utf8Length(stamp.frameId);
}
function preimage(mesh: MeshData, stamp: SourceStamp): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(preimageSize(mesh, stamp)));
  const data = new DataView(bytes.buffer);
  let offset = 0;
  const u8 = (n: number) => { bytes[offset++] = n; };
  const u32 = (n: number) => { data.setUint32(offset, n, true); offset += 4; };
  const text = (s: string) => {
    const length = utf8Length(s); u32(length);
    encoder.encodeInto(s, bytes.subarray(offset, offset + length)); offset += length;
  };
  encoder.encodeInto(domain, bytes); offset = domain.length;
  u32(1); u32(mesh.positions.length / 3); u32(mesh.indices.length / 3);
  const raw = (a: Float32Array | Uint32Array) => {
    for (const n of new Uint32Array(a.buffer, a.byteOffset, a.length)) u32(n);
  };
  raw(mesh.positions); raw(mesh.indices);
  for (const a of [mesh.colors, mesh.uvs]) { u8(a === undefined ? 0 : 1); if (a) raw(a); }
  u8(mesh.source === undefined ? 0 : mesh.source === 'synthetic' ? 1 : 2);
  text(mesh.name); u8(mesh.textureUrl === undefined ? 0 : 1);
  if (mesh.textureUrl !== undefined) text(mesh.textureUrl);
  text(stamp.units); u8(1); text(stamp.frameId);
  return bytes;
}
interface OwnedSource { mesh: MeshData; description: SourceDescription; bufferBytes: number }
export function createSourceCandidateStore(limits: SourceCandidateLimits): SourceCandidateStore {
  const maxOwnedBufferBytes = ownData(limits, 'maxOwnedBufferBytes');
  if (typeof maxOwnedBufferBytes !== 'number' || !Number.isSafeInteger(maxOwnedBufferBytes) ||
      maxOwnedBufferBytes < 1 || maxOwnedBufferBytes > 128 * 1024 * 1024) return invalid();
  let reservedBufferBytes = 0;
  const sources = new WeakMap<SourceCandidate, OwnedSource>();
  const retired = new WeakSet<SourceCandidate>();
  let closed = false, pending = false;
  let live: SourceCandidate | undefined;
  function authenticate(source: SourceCandidate): OwnedSource {
    if (closed) throw new SourceCandidateError('STALE_SOURCE');
    const owned = sources.get(source);
    if (!owned) throw new SourceCandidateError(retired.has(source) ? 'STALE_SOURCE' : 'INVALID_INPUT');
    return owned;
  }
  function release(source: SourceCandidate): void {
    if (retired.has(source)) return;
    const owned = sources.get(source);
    if (!owned) throw new SourceCandidateError('INVALID_INPUT');
    reservedBufferBytes -= owned.bufferBytes;
    sources.delete(source); retired.add(source); live = undefined;
  }
  function resolveFace(source: SourceCandidate, sourceFace: number, ctx: ArithmeticContext): ResolvedCandidateFace {
    const owned = authenticate(source);
    if (typeof sourceFace !== 'number' || !Number.isInteger(sourceFace) || sourceFace < 0 ||
        sourceFace >= owned.description.faceCount) return invalid();
    const vertexIDs = Object.freeze([owned.mesh.indices[3 * sourceFace], owned.mesh.indices[3 * sourceFace + 1],
      owned.mesh.indices[3 * sourceFace + 2]]) as VertexIDs;
    const words = new Uint32Array(owned.mesh.positions.buffer);
    const positionBits = Object.freeze(vertexIDs.map(id => Object.freeze([
      words[3 * id], words[3 * id + 1], words[3 * id + 2]]))) as unknown as PositionBits;
    const triangle = Object.freeze(positionBits.map(row => Object.freeze(row.map(bits => fromFloat32Bits(bits, ctx))))) as unknown as ExactTriangle3;
    return Object.freeze({ source: owned.description, sourceFace, vertexIDs, positionBits, triangle });
  }
  return {
    async capture(mesh: MeshData, stamp: SourceStamp): Promise<SourceCandidate> {
      if (closed) throw new SourceCandidateError('STALE_SOURCE');
      if (live || pending) throw new SourceCandidateError('SOURCE_IN_USE');
      pending = true;
      let reservation = 0;
      let snapshot: MeshData | undefined, hashInput: Uint8Array<ArrayBuffer> | undefined;
      try {
        const prepared = preflight(mesh, stamp);
        mesh = prepared.mesh;
        const sourceBytes = sourceBufferBytes(mesh), preimageBytes = preimageSize(mesh, prepared.stamp);
        const total = sourceBytes + preimageBytes;
        if (!Number.isSafeInteger(total) || total + reservedBufferBytes > maxOwnedBufferBytes) {
          throw new SourceCandidateError('BUDGET_EXCEEDED');
        }
        // Reserve the WHOLE new buffer set before any owned buffer allocation.
        reservation = total; reservedBufferBytes += total;
        snapshot = { name: mesh.name, source: mesh.source,
          positions: copyView(mesh.positions), indices: copyView(mesh.indices),
          ...(mesh.colors === undefined ? {} : { colors: copyView(mesh.colors) }),
          ...(mesh.uvs === undefined ? {} : { uvs: copyView(mesh.uvs) }), textureUrl: mesh.textureUrl };
        try { assertMesh(snapshot); } catch (error) { return validationFailure(error); }
        const ownedStamp = prepared.stamp;
        hashInput = preimage(snapshot, ownedStamp);
        const hash = await globalThis.crypto.subtle.digest('SHA-256', hashInput);
        if (closed) throw new SourceCandidateError('STALE_SOURCE');
        const sourceDigest = 'sha256:' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        const handle = Object.freeze(Object.create(null)) as SourceCandidate;
        sources.set(handle, { mesh: snapshot, bufferBytes: sourceBytes, description: Object.freeze({ kind: 'owned-source-candidate-v1',
          sourceId: `source-candidate-${++nextSourceId}`, sourceDigest, stamp: ownedStamp,
          vertexCount: snapshot.positions.length / 3, faceCount: snapshot.indices.length / 3 }) });
        live = handle;
        reservation -= sourceBytes; // Live S retains only its buffer reservation.
        return handle;
      } catch (error) {
        if (closed) throw new SourceCandidateError('STALE_SOURCE');
        if (error instanceof SourceCandidateError) throw error;
        throw new SourceCandidateError('UNAVAILABLE');
      } finally {
        // An uncancellable native digest must settle before this cleanup runs.
        reservedBufferBytes -= reservation;
        snapshot = undefined; hashInput = undefined;
        pending = false;
      }
    },
    describe(source: SourceCandidate): SourceDescription { return authenticate(source).description; },
    release,
    dispose(): void {
      if (live) release(live);
      closed = true;
      // Do not clear pending references or its reservation: native SHA cannot
      // be cancelled. Its continuation refuses publication and cleans once.
    },
    resolveFace,
    bindFaceCubic(source: SourceCandidate, sourceFace: number, controls: CubicBarycentricControls, ctx: ArithmeticContext): CandidateBoundSpan {
      const face = resolveFace(source, sourceFace, ctx);
      return Object.freeze({ kind: 'candidate-source-face-cubic-v1', face,
        containment: certifyFaceCubic(face.triangle, controls, ctx) });
    },
  };
}
