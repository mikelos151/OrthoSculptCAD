import type { MeshData, MeasurementRow, TapePoint } from '../types';
import type { MeshAudit } from '../geometry/auditTypes';
import type { WorkspaceState } from '../workspace/types';
export type ToleranceStatus = 'not-set' | 'within' | 'outside' | 'unavailable';
export interface ComparisonRow {
  z: number;
  current: MeasurementRow | null;
  reference: MeasurementRow | null;
  tape: number | null;
  tapeDelta: number | null;
  circumferenceDelta: number | null;
  apDelta: number | null;
  mlDelta: number | null;
  areaDelta: number | null;
  tolerance: ToleranceStatus;
}
export interface ReviewReportInput {
  mesh: MeshData;
  workspace: WorkspaceState;
  rows: MeasurementRow[];
  referenceRows?: MeasurementRow[];
  tapes: TapePoint[];
  audit: MeshAudit | null;
  /** If missing/stale, audit checks are shown as unknown rather than carried to another revision. */
  auditRevision?: number | null;
  /** Must equal workspace.revision; stale measurements are never rendered as current. */
  measurementRevision: number | null;
  /** Operator-defined engineering threshold, not a clinical recommendation. */
  toleranceMm?: number | null;
  /** Optional ISO timestamp for repeatable tests; runtime defaults to the actual system clock. */
  generatedAt?: string;
}
