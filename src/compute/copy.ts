import type { MeshData } from '../types';
import type { ComputePayloads } from './types';
import { abortError } from './protocol';
const MAX_BYTES = 128 * 1024 * 1024;
const COPY_ELEMENTS = 262_144; // <=1 MiB per synchronous copy; yield between chunks.
const ownedTransfers = new WeakMap<MeshData, ArrayBuffer[]>();
/** Only buffers allocated by copyMeshForWorker may be detached by the client transport. */
export function ownedMeshTransfers(mesh: MeshData): ArrayBuffer[] {
  const buffers = ownedTransfers.get(mesh);
  if (!buffers) throw new Error('Transport wymaga własnej kopii siatki.');
  return [...buffers];
}
export const needsAppearance = (op: keyof ComputePayloads) => !['analyze', 'topology', 'measure', 'measureAt'].includes(op);

/** Constant-time allocation gates on UI; numeric O(n) validation runs in Worker. */
export function preflightMesh(mesh: MeshData, appearance: boolean): void {
  if (!mesh || !(mesh.positions instanceof Float32Array) || !(mesh.indices instanceof Uint32Array) ||
      !(mesh.positions.buffer instanceof ArrayBuffer) || !(mesh.indices.buffer instanceof ArrayBuffer)) throw new Error('Nieprawidłowe bufory siatki.');
  const n = mesh.positions.length / 3;
  if (n < 3 || !Number.isInteger(n) || n > 2_000_000 || !mesh.indices.length || mesh.indices.length % 3 || mesh.indices.length > 12_000_000) throw new Error('Nieprawidłowy rozmiar siatki.');
  if (typeof mesh.name !== 'string' || mesh.name.length > 4096 || (mesh.source !== undefined && mesh.source !== 'synthetic' && mesh.source !== 'imported')) throw new Error('Nieprawidłowe metadane siatki.');
  let bytes = mesh.positions.byteLength + mesh.indices.byteLength;
  if (appearance) {
    for (const [a, stride] of [[mesh.colors, 3], [mesh.uvs, 2]] as const) {
      if (a !== undefined) {
        if (!(a instanceof Float32Array) || !(a.buffer instanceof ArrayBuffer) || a.length !== n * stride) throw new Error('Nieprawidłowe atrybuty siatki.');
        bytes += a.byteLength;
      }
    }
    if (mesh.textureUrl !== undefined && (typeof mesh.textureUrl !== 'string' || mesh.textureUrl.length > 24 * 1024 * 1024)) throw new Error('Nieprawidłowa tekstura.');
    bytes += (mesh.textureUrl?.length ?? 0) * 2;
  }
  if (bytes > MAX_BYTES) throw new Error('Przekroczono limit pamięci zadania.');
}
export async function copyMeshForWorker(mesh: MeshData, appearance: boolean, signal?: AbortSignal): Promise<MeshData> {
  preflightMesh(mesh, appearance);
  const copy = async <T extends Float32Array | Uint32Array>(source: T): Promise<T> => {
    if (signal?.aborted) throw abortError();
    const result = (source instanceof Float32Array ? new Float32Array(source.length) : new Uint32Array(source.length)) as T;
    for (let at = 0; at < source.length; at += COPY_ELEMENTS) {
      if (signal?.aborted) throw abortError();
      result.set(source.subarray(at, Math.min(at + COPY_ELEMENTS, source.length)), at);
      if (at + COPY_ELEMENTS < source.length) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (signal?.aborted) throw abortError();
    return result;
  };
  const owned: MeshData = { name: mesh.name, ...(mesh.source ? { source: mesh.source } : {}), positions: await copy(mesh.positions), indices: await copy(mesh.indices),
    ...(appearance && mesh.colors ? { colors: await copy(mesh.colors) } : {}),
    ...(appearance && mesh.uvs ? { uvs: await copy(mesh.uvs) } : {}),
    ...(appearance && mesh.textureUrl ? { textureUrl: mesh.textureUrl } : {}) };
  ownedTransfers.set(owned, [owned.positions.buffer, owned.indices.buffer, ...(owned.colors ? [owned.colors.buffer] : []), ...(owned.uvs ? [owned.uvs.buffer] : [])] as ArrayBuffer[]);
  return owned;
}
function scalar(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Nieprawidłowy parametr liczbowy geometrii.');
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error('Nieprawidłowy obiekt parametrów geometrii.');
  return value as Record<string, unknown>;
}
function denseArray(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Nieprawidłowa tablica parametrów geometrii.');
  const result: unknown[] = [], length = value.length;
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(value, i)) throw new Error('Niekompletna tablica parametrów geometrii.');
    result.push(value[i]);
  }
  return result;
}
export function copyParameters<K extends keyof ComputePayloads>(op: K, payload: ComputePayloads[K]): Omit<ComputePayloads[K], 'mesh'> {
  // Validate and snapshot every scalar BEFORE Worker creation or mesh copying. Never retain caller objects.
  let parameters: object = {};
  switch (op) {
    case 'analyze': {
      const { options } = payload as ComputePayloads['analyze'];
      if (options !== undefined) {
        const o = record(options), { maxPairTests, maxIntersections } = o;
        const budget = (value: unknown, min: number, max: number) => {
          const n = scalar(value, min, max);
          if (!Number.isSafeInteger(n)) throw new Error('Budżet audytu musi być liczbą całkowitą.');
          return n;
        };
        parameters = { options: {
          ...(maxPairTests === undefined ? {} : { maxPairTests: budget(maxPairTests, 0, 10_000_000) }),
          ...(maxIntersections === undefined ? {} : { maxIntersections: budget(maxIntersections, 1, 10_000) }),
        } };
      }
      break;
    }
    case 'measure': {
      const interval = scalar((payload as ComputePayloads['measure']).interval);
      if (interval <= 0) throw new Error('Interwał pomiarów musi być dodatni.');
      parameters = { interval }; break;
    }
    case 'measureAt': {
      const heights = denseArray((payload as ComputePayloads['measureAt']).heights, 0, 2000);
      parameters = { heights: heights.map(z => scalar(z, -1e6, 1e6)) }; break;
    }
    case 'register': {
      const { side, flexionDegrees, landmarks } = payload as ComputePayloads['register'];
      if (side !== 'left' && side !== 'right') throw new Error('Wymagana strona kończyny.');
      parameters = { side, flexionDegrees: scalar(flexionDegrees, -30, 30),
        landmarks: denseArray(landmarks, 3, 3).map(point => denseArray(point, 3, 3).map(x => scalar(x))) }; break;
    }
    case 'calibrate': {
      const tapes = denseArray((payload as ComputePayloads['calibrate']).tapes, 0, 1000), seen = new Set<number>();
      parameters = { tapes: tapes.map(t => {
        const { z: rawZ, circumference: rawCircumference } = record(t), z = scalar(rawZ), circumference = scalar(rawCircumference);
        if (circumference <= 0 || seen.has(z)) throw new Error('Taśma wymaga dodatniego obwodu i unikalnego poziomu.');
        seen.add(z); return { z, circumference };
      }) }; break;
    }
    case 'zone': {
      const p = payload as ComputePayloads['zone'], percent = scalar(p.percent, -50, 50), minZ = scalar(p.minZ), maxZ = scalar(p.maxZ);
      if (minZ > maxZ) throw new Error('Nieprawidłowa kolejność poziomów strefy.');
      parameters = { percent, minZ, maxZ }; break;
    }
    case 'shell': {
      const { thickness: rawThickness, flareAngle: rawAngle, flareRadius: rawRadius } = record((payload as ComputePayloads['shell']).options);
      const thickness = scalar(rawThickness, 0.5, 20), flareAngle = scalar(rawAngle, 0, 30), flareRadius = scalar(rawRadius, 0);
      if (flareAngle > 0 && flareRadius === 0) throw new Error('Wywinięcie wymaga dodatniego promienia.');
      // Bounds-dependent thickness/radius constraints remain in the Worker with numeric mesh validation.
      parameters = { options: { thickness, flareAngle, flareRadius } }; break;
    }
    case 'topology': case 'repair': case 'orient': case 'pca': break;
    default: throw new Error('Nieobsługiwana operacja geometrii.');
  }
  return parameters as Omit<ComputePayloads[K], 'mesh'>;
}
