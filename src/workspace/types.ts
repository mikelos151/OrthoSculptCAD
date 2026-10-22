import type { Vec3 } from '../types';
/** Pseudonymous, operator-provided details; not a patient registry. */
export type LimbSide = 'unspecified' | 'left' | 'right';
export interface CaseDetails {
  caseCode: string;
  side: LimbSide;
  technicalNote: string;
  liner: 'unknown' | 'with-liner' | 'without-liner';
  scanContext: string;
}
/** Column-major affine matrix, mapping the immediately preceding mesh into the new frame. */
export interface RegistrationRecord {
  side: Exclude<LimbSide, 'unspecified'>;
  landmarks: [Vec3, Vec3, Vec3];
  matrix: number[];
  flexionDegrees: number;
  sourceRevision: number;
}
export type WorkspaceEventKind =
  | 'start' | 'import' | 'migration' | 'units' | 'repair' | 'orientation'
  | 'align-pca' | 'register' | 'calibrate' | 'brush-relief' | 'brush-compress'
  | 'smooth' | 'scale-zone' | 'undo' | 'reset' | 'case-update' | 'tape-update';
export interface WorkspaceEvent {
  revision: number;
  at: string;
  kind: WorkspaceEventKind;
  label: string;
  parameters: Record<string, string | number | boolean | null>;
}
/** Operation journal is not a digital signature or a complete replayable mesh archive. */
export interface WorkspaceState {
  format: 'OrthoSculptWorkspace';
  version: 1;
  caseDetails: CaseDetails;
  revision: number;
  createdAt: string;
  updatedAt: string;
  registration: RegistrationRecord | null;
  events: WorkspaceEvent[];
}
export interface NewWorkspaceEvent {
  kind: WorkspaceEventKind;
  label: string;
  parameters?: WorkspaceEvent['parameters'];
  registration?: RegistrationRecord | null;
  caseDetails?: CaseDetails;
}
