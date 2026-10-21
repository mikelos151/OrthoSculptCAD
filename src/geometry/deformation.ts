import type { BrushOptions, MeshData } from "../types";
import { assertMesh, copyMesh, cross, getBounds, sub, vertex } from "./core";

/** Percent is radial/circumference change, never a volume-percent conversion. */
export function scaleZone(
  mesh: MeshData,
  percent: number,
  zMin: number,
  zMax: number,
): MeshData {
  const bounds = getBounds(mesh);
  if (
    !Number.isFinite(percent) ||
    percent < -50 ||
    percent > 50 ||
    !Number.isFinite(zMin) ||
    !Number.isFinite(zMax) ||
    zMin > zMax
  )
    throw new Error(
      "Zone needs finite ordered heights and circumference change within ±50%",
    );
  const result = copyMesh(mesh),
    factor = 1 + percent / 100,
    [cx, cy] = bounds.center;
  let changed = false;
  for (let i = 0; i < mesh.positions.length; i += 3)
    if (mesh.positions[i + 2] >= zMin && mesh.positions[i + 2] <= zMax) {
      result.positions[i] = cx + (mesh.positions[i] - cx) * factor;
      result.positions[i + 1] = cy + (mesh.positions[i + 1] - cy) * factor;
      // Compare stored Float32 values, not the unrounded arithmetic result.
      changed ||= result.positions[i] !== mesh.positions[i] ||
        result.positions[i + 1] !== mesh.positions[i + 1];
    }
  if (!changed)
    throw new Error(
      "Korekta strefy nie zmieniła żadnych współrzędnych. Sprawdź zakres Z, niezerowy procent i gęstość siatki; strefa może przecinać ściany bez wierzchołków. Model i historia pozostały bez zmian.",
    );
  assertMesh(result);
  return result;
}

/** Unit, area-weighted vertex normals; isolated or cancelling normals stay zero. */
export function vertexNormals(mesh: MeshData): Float64Array {
  const normals = new Float64Array(mesh.positions.length);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t],
      b = mesh.indices[t + 1],
      c = mesh.indices[t + 2],
      n = cross(
        sub(vertex(mesh, b), vertex(mesh, a)),
        sub(vertex(mesh, c), vertex(mesh, a)),
      );
    for (const i of [a, b, c])
      for (let k = 0; k < 3; k++) normals[i * 3 + k] += n[k];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const d = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (d > 1e-20) {
      normals[i] /= d;
      normals[i + 1] /= d;
      normals[i + 2] /= d;
    }
  }
  return normals;
}
/** Signed baseline-normal displacement: green 0, blue relief +8 mm, red compression -10 mm. Display limits, not clinical tolerances. */
export function deformationColors(
  mesh: MeshData,
  originalPositions: Float32Array,
): Float32Array {
  assertMesh(mesh);
  if (
    !(originalPositions instanceof Float32Array) ||
    originalPositions.length !== mesh.positions.length
  )
    throw new Error("Heatmap baseline must have matching vertices");
  for (const x of originalPositions)
    if (!Number.isFinite(x)) throw new Error("Non-finite heatmap baseline");
  const normals = vertexNormals({ ...mesh, positions: originalPositions }),
    colors = new Float32Array(mesh.positions.length),
    neutral = [0.12, 0.75, 0.12];
  for (let i = 0; i < colors.length; i += 3) {
    let signed = 0;
    for (let k = 0; k < 3; k++)
      signed +=
        (mesh.positions[i + k] - originalPositions[i + k]) * normals[i + k];
    const weight = Math.min(1, Math.abs(signed) / (signed >= 0 ? 8 : 10)),
      target = signed >= 0 ? [0.1, 0.35, 1] : [1, 0.15, 0.12];
    for (let k = 0; k < 3; k++)
      colors[i + k] = neutral[k] + (target[k] - neutral[k]) * weight;
  }
  return colors;
}

export function applyBrush(mesh: MeshData, options: BrushOptions): MeshData {
  assertMesh(mesh);
  const { center, radius, strength, mode } = options;
  if (
    center.length !== 3 ||
    center.some((x) => !Number.isFinite(x)) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 1000 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 50
  )
    throw new Error(
      "Invalid brush: finite center, radius (0,1000], strength [0,50] required",
    );
  if (mode !== "relief" && mode !== "compress" && mode !== "smooth")
    throw new Error("Unknown brush mode");
  const result = copyMesh(mesh),
    normals = mode === "smooth" ? undefined : vertexNormals(mesh);
  const neighbours =
    mode === "smooth"
      ? Array.from(
          { length: mesh.positions.length / 3 },
          () => new Set<number>(),
        )
      : undefined;
  if (neighbours)
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ids = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
      for (const a of ids)
        for (const b of ids) if (a !== b) neighbours[a].add(b);
    }
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const d = Math.hypot(
      mesh.positions[i] - center[0],
      mesh.positions[i + 1] - center[1],
      mesh.positions[i + 2] - center[2],
    );
    if (d >= radius) continue;
    const t = d / radius,
      w = 1 - 3 * t * t + 2 * t * t * t,
      amount = strength * w * (mode === "compress" ? -1 : 1);
    if (neighbours) {
      const ring = neighbours[i / 3];
      if (!ring.size) continue;
      const alpha = Math.min(1, strength) * w;
      for (let k = 0; k < 3; k++) {
        let average = 0;
        for (const j of ring) average += mesh.positions[j * 3 + k] / ring.size;
        result.positions[i + k] =
          mesh.positions[i + k] + alpha * (average - mesh.positions[i + k]);
      }
    } else
      for (let k = 0; k < 3; k++)
        result.positions[i + k] += normals![i + k] * amount;
  }
  assertMesh(result);
  return result;
}
