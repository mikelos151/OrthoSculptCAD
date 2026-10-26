import type { MeshData, Vec3 } from "../types";
import {
  assertMesh,
  copyMesh,
  cross,
  dot,
  getBounds,
  sub,
  unit,
  vertex,
} from "./core";

export function registerLandmarks(
  mesh: MeshData,
  points: { anterior: Vec3; lateral: Vec3; distal: Vec3 },
  flexionDegrees = 0,
  side: 'left' | 'right' = 'right',
): MeshData {
  return registerLandmarksDetailed(mesh, points, flexionDegrees, side).mesh;
}

/** Proper rigid transform, column-major, mapping the input mesh into patient coordinates. */
export function registerLandmarksDetailed(
  mesh: MeshData,
  points: { anterior: Vec3; lateral: Vec3; distal: Vec3 },
  flexionDegrees = 0,
  side: 'left' | 'right' = 'right',
): { mesh: MeshData; matrix: number[] } {
  assertMesh(mesh);
  if (side !== 'left' && side !== 'right') throw new Error('Explicit left/right side required for laterality');
  for (const p of Object.values(points))
    if (p.length !== 3 || p.some((x) => !Number.isFinite(x)))
      throw new Error("Landmarks must be finite 3D points");
  if (!Number.isFinite(flexionDegrees) || Math.abs(flexionDegrees) > 30)
    throw new Error("Flexion must be finite within ±30 degrees");
  const frame = principalFrame(mesh);
  if (frame.eigenvalues[0] <= frame.eigenvalues[1] * 1.05)
    throw new Error(
      "Principal axis is ambiguous: insufficient elongation for proximal-axis inference",
    );
  let z = frame.z;
  const toward = dot(sub(frame.center, points.distal), z);
  if (Math.abs(toward) < 1e-8)
    throw new Error(
      "Distal pick does not resolve the principal proximal direction",
    );
  if (toward < 0) z = [-z[0], -z[1], -z[2]];
  const transverse = (d: Vec3): Vec3 => {
    const axial = dot(d, z);
    return [d[0] - axial * z[0], d[1] - axial * z[1], d[2] - axial * z[2]];
  };
  const lateral = transverse(sub(points.lateral, points.distal)),
    anterior = transverse(sub(points.anterior, points.distal));
  if (Math.hypot(...lateral) < 1e-6 || Math.hypot(...anterior) < 1e-6)
    throw new Error("Coincident/collinear projected landmarks");
  const lateralDirection = unit(lateral);
  const x: Vec3 = side === 'left' ? [-lateralDirection[0], -lateralDirection[1], -lateralDirection[2]] : lateralDirection,
    projection = dot(anterior, x),
    orthogonal: Vec3 = [
      anterior[0] - projection * x[0],
      anterior[1] - projection * x[1],
      anterior[2] - projection * x[2],
    ];
  if (Math.hypot(...orthogonal) < Math.hypot(...anterior) * 1e-6)
    throw new Error("Collinear transverse landmarks");
  const y = unit(orthogonal);
  if (dot(cross(x, y), z) < 0.999)
    throw new Error(
      "Incompatible landmark chirality/laterality: right-handed X lateral / Y anterior / Z proximal required; no automatic reflection",
    );
  const r = (flexionDegrees * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const result = copyMesh(mesh);
  const rowY: Vec3 = y.map((v, k) => c * v - s * z[k]) as Vec3;
  const rowZ: Vec3 = y.map((v, k) => s * v + c * z[k]) as Vec3;
  const matrix = [x[0], rowY[0], rowZ[0], 0, x[1], rowY[1], rowZ[1], 0, x[2], rowY[2], rowZ[2], 0,
    -dot(points.distal, x), -dot(points.distal, rowY), -dot(points.distal, rowZ), 1];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const d = sub(vertex(mesh, i), points.distal),
      dy = dot(d, y),
      dz = dot(d, z);
    result.positions.set([dot(d, x), c * dy - s * dz, s * dy + c * dz], i * 3);
  }
  assertMesh(result);
  return { mesh: result, matrix };
}

function orient(axis: Vec3): Vec3 {
  let k = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(axis[i]) > Math.abs(axis[k])) k = i;
  return axis[k] < 0 ? [-axis[0], -axis[1], -axis[2]] : axis;
}
/** Exact area-integrated triangle moments: invariant to subdivision of the same surface. */
function principalFrame(mesh: MeshData) {
  assertMesh(mesh);
  // Relative coordinates avoid cancellation on translated scans.
  const origin = vertex(mesh, mesh.indices[0]);
  const center: Vec3 = [0, 0, 0];
  let area = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const points = [0, 1, 2].map(k => sub(vertex(mesh, mesh.indices[t + k]), origin));
    const weight = Math.hypot(...cross(sub(points[1], points[0]), sub(points[2], points[0]))) / 2;
    area += weight;
    for (let k = 0; k < 3; k++) center[k] += weight * (points[0][k] + points[1][k] + points[2][k]) / 3;
  }
  if (!Number.isFinite(area) || area <= 1e-20) throw new Error('PCA needs non-degenerate surface area');
  for (let k = 0; k < 3; k++) center[k] = center[k] / area + origin[k];
  const a = Array.from({ length: 3 }, () => [0, 0, 0]),
    v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const d = [0, 1, 2].map(k => sub(vertex(mesh, mesh.indices[t + k]), center));
    const weight = Math.hypot(...cross(sub(d[1], d[0]), sub(d[2], d[0]))) / (2 * area);
    const sum = [0, 1, 2].map(k => d[0][k] + d[1][k] + d[2][k]);
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        a[j][k] += weight * (sum[j] * sum[k] + d.reduce((s, p) => s + p[j] * p[k], 0)) / 12;
  }
  for (let iteration = 0; iteration < 64; iteration++) {
    let p = 0,
      q = 1;
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        if (Math.abs(a[i][j]) > Math.abs(a[p][q])) {
          p = i;
          q = j;
        }
    if (
      Math.abs(a[p][q]) <
      1e-12 *
        Math.max(1, Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]))
    )
      break;
    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
      c = Math.cos(phi),
      s = Math.sin(phi),
      app = a[p][p],
      aqq = a[q][q],
      apq = a[p][q];
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const akp = a[k][p],
          akq = a[k][q];
        a[k][p] = a[p][k] = c * akp - s * akq;
        a[k][q] = a[q][k] = s * akp + c * akq;
      }
      const vkp = v[k][p],
        vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  if (a[order[0]][order[0]] < 1e-16 || a[order[1]][order[1]] < 1e-16)
    throw new Error("PCA needs a non-collinear mesh");
  const z = orient(unit([v[0][order[0]], v[1][order[0]], v[2][order[0]]])),
    x = orient(unit([v[0][order[1]], v[1][order[1]], v[2][order[1]]])),
    y = unit(cross(z, x));
  return { x, y, z, center, eigenvalues: order.map((i) => a[i][i]) };
}
export function alignPCA(mesh: MeshData): MeshData {
  const frame = principalFrame(mesh);
  if (frame.eigenvalues[0] <= frame.eigenvalues[1] * 1.05)
    throw new Error('Principal axis is ambiguous: insufficient elongation for proximal-axis inference');
  const { x, y, z, center } = frame;
  const n = mesh.positions.length / 3;
  const result = copyMesh(mesh);
  for (let i = 0; i < n; i++) {
    const d = sub(vertex(mesh, i), center);
    result.positions.set([dot(d, x), dot(d, y), dot(d, z)], i * 3);
  }
  const min = getBounds(result).min[2];
  for (let i = 2; i < result.positions.length; i += 3)
    result.positions[i] -= min;
  assertMesh(result);
  return result;
}
