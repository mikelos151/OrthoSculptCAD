import type { ComputePayloads, ComputeResults } from './types';

/** Real pure geometry; also the explicitly documented Node/test-only adapter. */
export async function executeGeometry<K extends keyof ComputePayloads>(op: K, payload: ComputePayloads[K]): Promise<ComputeResults[K]> {
  const mesh = payload.mesh;
  let result: unknown;
  switch (op) {
    case 'topology': result = (await import('../geometry/core')).validateMesh(mesh); break;
    case 'repair': {
      const repaired = (await import('../geometry/repair')).repairMesh(mesh);
      result = { mesh: repaired.mesh, report: { ...repaired.report, warnings: [...new Set([...repaired.report.warnings, ...repaired.warnings])] } };
      break;
    }
    case 'analyze': result = (await import('../geometry/audit')).auditMesh(mesh, (payload as ComputePayloads['analyze']).options); break;
    case 'orient': result = (await import('../geometry/orientation')).orientMesh(mesh); break;
    case 'measure': result = (await import('../geometry/measurement')).measureMesh(mesh, (payload as ComputePayloads['measure']).interval); break;
    case 'measureAt': result = (await import('./measureAt')).measureAt(mesh, (payload as ComputePayloads['measureAt']).heights); break;
    case 'pca': result = (await import('../geometry/alignment')).alignPCA(mesh); break;
    case 'register': {
      const p = payload as ComputePayloads['register'];
      result = (await import('../geometry/alignment')).registerLandmarksDetailed(mesh,
        { anterior: p.landmarks[0], lateral: p.landmarks[1], distal: p.landmarks[2] }, p.flexionDegrees, p.side); break;
    }
    case 'calibrate': result = (await import('../geometry/calibration')).calibrateMesh(mesh, (payload as ComputePayloads['calibrate']).tapes); break;
    case 'zone': {
      const p = payload as ComputePayloads['zone'];
      result = (await import('../geometry/deformation')).scaleZone(mesh, p.percent, p.minZ, p.maxZ); break;
    }
    case 'shell': result = (await import('../manufacturing/shell')).buildShell(mesh, (payload as ComputePayloads['shell']).options); break;
    default: throw new Error('Unsupported geometry operation');
  }
  return result as ComputeResults[K];
}
