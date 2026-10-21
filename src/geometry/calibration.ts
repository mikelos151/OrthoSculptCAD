import type { MeshData, TapePoint } from "../types";
import { assertMesh, copyMesh } from "./core";
import { SliceIndex } from "./slicing";

/** Radial vertex deformation with linear Z factors and clamped extrapolation; no axial scaling. */
export function calibrateMesh(mesh: MeshData, tapes: TapePoint[]): MeshData {
  assertMesh(mesh);
  const result = copyMesh(mesh);
  if (!tapes.length) return result;
  if (tapes.length > 1000) throw new Error("Too many tape levels");
  const index = new SliceIndex(mesh),
    sorted = tapes.map((t) => ({ ...t })).sort((a, b) => a.z - b.z);
  const controls = sorted.map((t, i) => {
    if (
      !Number.isFinite(t.z) ||
      !Number.isFinite(t.circumference) ||
      t.circumference <= 0
    )
      throw new Error("Tape requires finite Z and positive circumference");
    if (i && t.z === sorted[i - 1].z) throw new Error("Duplicate tape height");
    const s = index.slice(t.z);
    if (!s.valid || s.perimeter <= 0)
      throw new Error("Tape height has no unambiguous closed contour");
    const factor = t.circumference / s.perimeter;
    if (factor < 0.5 || factor > 2)
      throw new Error("Calibration factor must be within 0.5–2");
    let twiceArea = 0,
      cx = 0,
      cy = 0;
    const p = s.loops[0].points;
    for (let j = 0; j < p.length; j++) {
      const a = p[j],
        b = p[(j + 1) % p.length],
        c = a[0] * b[1] - b[0] * a[1];
      twiceArea += c;
      cx += (a[0] + b[0]) * c;
      cy += (a[1] + b[1]) * c;
    }
    return {
      z: t.z,
      factor,
      cx: cx / (3 * twiceArea),
      cy: cy / (3 * twiceArea),
    };
  });
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const z = mesh.positions[i + 2];
    let a = controls[0],
      b = a;
    if (z >= controls.at(-1)!.z) a = b = controls.at(-1)!;
    else if (z > a.z) {
      let j = 1;
      while (controls[j].z < z) j++;
      a = controls[j - 1];
      b = controls[j];
    }
    const f = a === b ? 0 : (z - a.z) / (b.z - a.z),
      factor = a.factor + (b.factor - a.factor) * f,
      cx = a.cx + (b.cx - a.cx) * f,
      cy = a.cy + (b.cy - a.cy) * f;
    result.positions[i] = cx + (mesh.positions[i] - cx) * factor;
    result.positions[i + 1] = cy + (mesh.positions[i + 1] - cy) * factor;
  }
  assertMesh(result);
  return result;
}
