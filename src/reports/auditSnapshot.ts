import type { MeshAudit, QualityCheck } from '../geometry/auditTypes';

export const statusNames = { pass: 'SPRAWDZONO', fail: 'NIEZGODNOŚĆ', unknown: 'NIEUSTALONO' };
const coreChecks = ['edge-manifold', 'watertight', 'vertex-manifold', 'components', 'degenerate-triangles', 'winding', 'self-intersections', 'outward'];

/** Bound first, then project the small immutable report snapshot. Never clone intersection witnesses. */
export function reportAudit(audit: MeshAudit | null): { checks: QualityCheck[]; complete: boolean; hasCore: boolean } | null {
  if (audit === null) return null;
  if (!Array.isArray(audit.checks) || audit.checks.length > 64 || typeof audit.complete !== 'boolean') throw new Error('Nieprawidłowe kontrole jakości raportu lub limit audytu.');
  const ids = new Set<string>();
  const checks = audit.checks.map(c => {
    if (!c || typeof c.id !== 'string' || !c.id.length || c.id.length > 100 || ids.has(c.id) ||
      typeof c.status !== 'string' || !Object.hasOwn(statusNames, c.status) ||
      typeof c.label !== 'string' || c.label.length > 500 || typeof c.detail !== 'string' || c.detail.length > 4000) throw new Error('Nieprawidłowe lub powielone kontrole jakości raportu.');
    ids.add(c.id);
    return {id:c.id, label:c.label, status:c.status, detail:c.detail};
  });
  const hasCore = coreChecks.every(id => ids.has(id));
  return {checks, hasCore, complete:audit.complete && hasCore};
}
