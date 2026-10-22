import type { MeshData } from '../types';
export type QualityStatus = 'pass' | 'fail' | 'unknown';
export interface QualityCheck { id: string; label: string; status: QualityStatus; detail: string; }
export interface AuditOptions { maxPairTests?: number; maxIntersections?: number; }
export interface MeshAudit {
  checks: QualityCheck[];
  triangleCount: number;
  candidateTests: number;
  complete: boolean;
  elapsedMs: number;
  intersections: Array<[number, number]>;
  orientation: 'outward' | 'inward' | 'inconsistent' | 'unknown';
  signedVolume: number;
}
export interface RegistrationResult { mesh: MeshData; matrix: number[]; }
