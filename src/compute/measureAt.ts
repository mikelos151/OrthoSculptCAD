import type { MeasurementRow, MeshData } from '../types';
import { SliceIndex } from '../geometry/slicing';
/** Exact requested Z planes; segment volume is a trapezoidal approximation, not enclosed volume. */
export function measureAt(mesh: MeshData, heights: number[]): MeasurementRow[] {
  if (!Array.isArray(heights) || heights.length > 2000 || heights.some(z => !Number.isFinite(z) || Math.abs(z) > 1e6)) throw new Error('Nieprawidłowe poziomy pomiarów.');
  const index = new SliceIndex(mesh), rows: MeasurementRow[] = [];
  for (const z of [...new Set(heights)].sort((a, b) => a - b)) {
    const slice = index.slice(z), previous = rows.at(-1);
    const segmentVolume = previous?.valid && slice.valid && index.slice((previous.z + z) / 2).valid
      ? (previous.area + slice.area) * (z - previous.z) / 2 : null;
    rows.push({ z, circumference: slice.perimeter, area: slice.area, ap: slice.ap, ml: slice.ml, valid: slice.valid, segmentVolume });
  }
  return rows;
}
