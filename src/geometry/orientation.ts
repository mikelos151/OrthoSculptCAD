import type { MeshData } from '../types';
import { auditMesh } from './audit';
import { copyMesh } from './core';

/** Never infer outwardness from the signed volume of an open or intersecting surface. */
export function orientMesh(input: MeshData): { mesh: MeshData; changed: boolean; warnings: string[] } {
  const audit=auditMesh(input), mesh=copyMesh(input);
  if(audit.orientation==='inward') {
    for(let t=0;t<mesh.indices.length;t+=3) [mesh.indices[t+1],mesh.indices[t+2]]=[mesh.indices[t+2],mesh.indices[t+1]];
    return {mesh,changed:true,warnings:['Reversed the global winding of one closed, vertex-manifold, intersection-free component to outward.']};
  }
  return {mesh,changed:false,warnings:audit.orientation==='outward'?[]:['Outward orientation unconfirmed: no winding change; open, inconsistent, disconnected, intersecting or budget/numerically unresolved geometry requires review.']};
}
