import type { MeshData, MeasurementRow, ShellOptions, TapePoint, TopologyReport, Vec3 } from '../types';
import type { AuditOptions, MeshAudit, RegistrationResult } from '../geometry/auditTypes';
export interface ComputePayloads {
  analyze: { mesh: MeshData; options?: AuditOptions };
  topology: { mesh: MeshData };
  measure: { mesh: MeshData; interval: number };
  repair: { mesh: MeshData };
  orient: { mesh: MeshData };
  pca: { mesh: MeshData };
  register: { mesh: MeshData; landmarks: [Vec3, Vec3, Vec3]; flexionDegrees: number; side: 'left' | 'right' };
  calibrate: { mesh: MeshData; tapes: TapePoint[] };
  zone: { mesh: MeshData; percent: number; minZ: number; maxZ: number };
  shell: { mesh: MeshData; options: ShellOptions };
}
export interface ComputeResults {
  analyze: MeshAudit;
  topology: TopologyReport;
  measure: MeasurementRow[];
  repair: { mesh: MeshData; report: TopologyReport };
  orient: { mesh: MeshData; changed: boolean; warnings: string[] };
  pca: MeshData;
  register: RegistrationResult;
  calibrate: MeshData;
  zone: MeshData;
  shell: { mesh: MeshData; warnings: string[] };
}
export interface TaskOptions { signal?: AbortSignal; }
