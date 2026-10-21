import type { MeshData, MeasurementRow } from "../types";
import { getBounds } from "./core";
import { SliceIndex } from "./slicing";

/** Areas in mm² and segment volumes in mm³; trapezoidal estimates, not exact enclosed volume. */
export function measureMesh(
  mesh: MeshData,
  interval: number,
): MeasurementRow[] {
  if (!Number.isFinite(interval) || interval <= 0)
    throw new Error("Measurement interval must be positive and finite");
  const bounds = getBounds(mesh),
    min = bounds.min[2],
    max = bounds.max[2],
    count = Math.ceil((max - min) / interval);
  if (count > 10_000) throw new Error("Measurement sample limit exceeded");
  const index = new SliceIndex(mesh),
    rows: MeasurementRow[] = [];
  for (let i = 0; i <= count; i++) {
    const z = Math.min(max, min + i * interval),
      s = index.slice(z),
      previous = rows.at(-1);
    const segmentVolume =
      previous &&
      previous.valid &&
      s.valid &&
      index.slice((z + previous.z) / 2).valid
        ? ((previous.area + s.area) * (z - previous.z)) / 2
        : null;
    rows.push({
      z,
      circumference: s.perimeter,
      area: s.area,
      ap: s.ap,
      ml: s.ml,
      valid: s.valid,
      segmentVolume,
    });
  }
  return rows;
}
