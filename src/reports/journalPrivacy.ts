import type { WorkspaceEvent } from '../workspace';

// Export policy, not a general redactor: unknown names/types/enum values never leave the journal.
// Numeric bounds are engineering resource/review limits, not clinical tolerances.
const numeric: Record<string, readonly [number, number, boolean?]> = {
  percent: [-100, 100], minZ: [-100_000, 100_000], maxZ: [-100_000, 100_000],
  minZMm: [-100_000, 100_000], maxZMm: [-100_000, 100_000], zMm: [-100_000, 100_000],
  circumferenceMm: [0, 100_000], radiusMm: [0, 100_000], maxResidualMm: [0, 100_000],
  flexionDegrees: [-30, 30], scale: [0, 1000], strength: [0, 1],
  vertices: [0, 2_000_000, true], triangles: [0, 2_000_000, true],
  tapeCount: [0, 2000, true], dabCount: [0, 100_000, true],
};
const enums: Record<string, readonly string[]> = {
  source: ['synthetic', 'imported'], side: ['left', 'right', 'unspecified'],
  mode: ['relief', 'compress', 'smooth'], sourceUnit: ['mm', 'cm', 'm', 'inch'],
  units: ['mm', 'cm', 'm', 'inch'],
};
export function reportJournalParameters(parameters: WorkspaceEvent['parameters']): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(parameters)) {
    const range = Object.hasOwn(numeric, name) ? numeric[name] : undefined;
    if (range && typeof value === 'number' && Number.isFinite(value) && value >= range[0] && value <= range[1] && (!range[2] || Number.isSafeInteger(value))) result[name] = value;
    const allowed = Object.hasOwn(enums, name) ? enums[name] : undefined;
    if (allowed && typeof value === 'string' && allowed.includes(value)) result[name] = value;
  }
  return result;
}
