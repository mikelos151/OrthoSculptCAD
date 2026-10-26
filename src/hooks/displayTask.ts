import { applyBrush, auditMesh, deformationColors } from '../geometry';
import type { BrushMode, MeshData, Vec3 } from '../types';
import { changedCoordinates } from './workbenchState';
export type DisplayTask = { kind: 'stroke'; mesh: MeshData; points: Vec3[]; mode: BrushMode; radius: number; strength: number } | { kind: 'heatmap'; mesh: MeshData; baseline: Float32Array };
export type DisplayResult = { kind: 'stroke'; mesh: MeshData; dabCount: number } | { kind: 'heatmap'; colors: Float32Array };
/** Invoked in a Worker by the browser; the direct executor is the unit-test seam. */
export const MAX_STROKE_DABS = 128;
export function executeDisplayTask(task: DisplayTask): DisplayResult {
  if (task.kind === 'stroke' && (!Array.isArray(task.points) || task.points.length > MAX_STROKE_DABS)) throw new Error('Limit 128 punktów w jednym pociągnięciu.');
  if (task.kind === 'heatmap') {
    // Project baseline positions are independently untrusted: a current-mesh
    // outward audit says nothing about this different stored surface.
    const baselineAudit = auditMesh({ ...task.mesh, positions: task.baseline });
    if (baselineAudit.orientation !== 'outward' || !baselineAudit.checks.some(check => check.id === 'outward' && check.status === 'pass')) throw new Error('Referencja ma niepotwierdzoną orientację / topologię. Podpisana mapa jest zablokowana.');
    return { kind: 'heatmap', colors: deformationColors(task.mesh, task.baseline) };
  }
  let mesh = task.mesh, dabCount = 0;
  for (const center of task.points) {
    const next = applyBrush(mesh, { center, mode: task.mode, radius: task.radius, strength: task.strength });
    if (changedCoordinates(mesh.positions, next.positions)) { mesh = next; dabCount++; }
  }
  return { kind: 'stroke', mesh, dabCount };
}
