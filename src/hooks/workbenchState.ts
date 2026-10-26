import type { QualityStatus } from '../geometry/auditTypes';
import type { BrushMode, MeshData, TapePoint } from '../types';
import type { Unit } from '../components/workflow';

export interface UndoSnapshot { mesh: MeshData; baseline: Float32Array | null; tapes: TapePoint[]; unitsConfirmed: boolean; unit: Unit; }
export function makeUndoSnapshot(input: UndoSnapshot): UndoSnapshot {
  return { ...input, mesh: { ...input.mesh, positions: input.mesh.positions.slice(), indices: input.mesh.indices.slice(), colors: input.mesh.colors?.slice(), uvs: input.mesh.uvs?.slice() }, baseline: input.baseline?.slice() ?? null, tapes: input.tapes.map(tape => ({ ...tape })) };
}
export function pushUndoHistory(history: UndoSnapshot[], snapshot: UndoSnapshot, maxCount = 20, maxBytes = 128 * 1024 * 1024): UndoSnapshot[] {
  const next = [...history, snapshot];
  const size = (entry: UndoSnapshot) => entry.mesh.positions.byteLength + entry.mesh.indices.byteLength + (entry.mesh.colors?.byteLength ?? 0) + (entry.mesh.uvs?.byteLength ?? 0) + (entry.baseline?.byteLength ?? 0);
  let bytes = next.reduce((sum, entry) => sum + size(entry), 0);
  while (next.length && (next.length > maxCount || bytes > maxBytes)) bytes -= size(next.shift()!);
  return next;
}
import type { NewWorkspaceEvent } from '../workspace/types';

export function changedCoordinates(a: Float32Array, b: Float32Array): boolean {
  return a.length !== b.length || a.some((value, index) => value !== b[index]);
}
export function strokeEvent(mode: BrushMode, radiusMm: number, strength: number, dabCount: number): NewWorkspaceEvent | null {
  return dabCount > 0 ? { kind: mode === 'smooth' ? 'smooth' : mode === 'relief' ? 'brush-relief' : 'brush-compress', label: 'Pociągnięcie pędzla', parameters: { mode, radiusMm, strength, dabCount } } : null;
}

export function qualitySummary(audit: { complete: boolean; checks: { id: string; status: QualityStatus }[] } | null): QualityStatus {
  if (!audit || !audit.checks.length) return 'unknown';
  if (audit.checks.some(check => check.status === 'fail')) return 'fail';
  const required = ['edge-manifold', 'watertight', 'vertex-manifold', 'components', 'degenerate-triangles', 'winding', 'self-intersections', 'outward', 'minimum-thickness'];
  return audit.complete && required.every(id => audit.checks.some(check => check.id === id && check.status === 'pass')) && audit.checks.every(check => check.status === 'pass') ? 'pass' : 'unknown';
}

export function normalsUsable(audit: { orientation: string; checks: { id: string; status: QualityStatus }[] } | null): boolean {
  return audit?.orientation === 'outward' && ['winding', 'outward'].every(id => audit.checks.some(check => check.id === id && check.status === 'pass'));
}

export function workProtection(edited: boolean, revision: number, generatedRevision: number | null) {
  return { guard: edited, copyCurrent: generatedRevision === revision };
}

export interface StrokeSource {
  projectEpoch: number;
  revision: number;
  mesh: MeshData | null;
  unit: Unit;
  unitsConfirmed: boolean;
}
export interface StrokeTicket { readonly source: Readonly<StrokeSource>; }
/** Recording is a transaction too: bind it before pointer-up starts a Worker. */
export function createStrokeFence() {
  let active: StrokeTicket | null = null;
  return {
    begin(source: StrokeSource): StrokeTicket | null {
      if (active || !source.mesh || !source.unitsConfirmed) return null;
      active = { source: { ...source } };
      return active;
    },
    current(ticket: StrokeTicket, source: StrokeSource): boolean {
      const before = ticket.source;
      return active === ticket && source.mesh !== null && source.unitsConfirmed &&
        before.projectEpoch === source.projectEpoch && before.revision === source.revision &&
        before.mesh === source.mesh && before.unit === source.unit &&
        before.unitsConfirmed === source.unitsConfirmed;
    },
    finish(ticket: StrokeTicket) { if (active === ticket) active = null; },
    cancel() { active = null; },
  };
}

export interface TaskTicket { generation: number; signal: AbortSignal; }
/** Synchronous exclusion plus a generation fence; cancellation aborts the real transport. */
export function createTaskGate() {
  let generation = 0;
  let active: { ticket: TaskTicket; controller: AbortController } | null = null;
  return {
    begin(): TaskTicket | null {
      if (active) return null;
      const controller = new AbortController();
      const ticket = { generation: ++generation, signal: controller.signal };
      active = { ticket, controller };
      return ticket;
    },
    current(ticket: TaskTicket) { return active?.ticket === ticket && !ticket.signal.aborted; },
    finish(ticket: TaskTicket) { if (active?.ticket === ticket) active = null; },
    cancel() { active?.controller.abort(); active = null; generation++; },
    get busy() { return active !== null; },
  };
}
