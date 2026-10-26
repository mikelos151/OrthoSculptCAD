import type { MeshData, SliceResult } from '../types';
import type { ComputePayloads, ComputeResults } from './types';
export type GeometryOperation = keyof ComputePayloads;
export type WorkerCommand = { kind: 'task'; op: GeometryOperation; payload: ComputePayloads[GeometryOperation] } | { kind: 'init'; mesh: MeshData } | { kind: 'slice'; z: number };
export type WorkerRequest = WorkerCommand & { id: number; generation: number };
export const WORKER_FAILURE_MESSAGE = 'Nie udało się wykonać obliczenia geometrii.';
// Closed public diagnostic: never forward arbitrary exception text from a Worker.
export const ZONE_NO_CHANGE_MESSAGE = 'Korekta strefy nie zmieniła żadnych współrzędnych. Sprawdź zakres Z, niezerowy procent i gęstość siatki; strefa może przecinać ściany bez wierzchołków. Model i historia pozostały bez zmian.';
export type WorkerResponse = { id: number; generation: number } & ({ ok: true; result: ComputeResults[GeometryOperation] | SliceResult | null } | { ok: false; error: string; code?: 'ZONE_NO_CHANGE' });
export function transferBuffers(value: unknown): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const visit = (v: unknown) => {
    if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer) buffers.add(v.buffer); }
    else if (v instanceof ArrayBuffer) buffers.add(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(value);
  return [...buffers];
}
export function abortError(): Error { return new DOMException('Obliczenie anulowane.', 'AbortError'); }
