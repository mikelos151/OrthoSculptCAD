import earcut from "earcut";
import type { MeshData, Vec2, Vec3 } from "../types";
import {
  assertMesh,
  copyMesh,
  cross,
  dot,
  sub,
  topology,
  unit,
  validateMesh,
  vertex,
} from "./core";

import { orientMesh } from "./orientation";
import { orientation, simplePolygon } from "./planar";
/** Conservative earcut planar caps, not Liepa/Delaunay or general mesh healing. */
export function repairMesh(input: MeshData) {
  assertMesh(input);
  const mesh = copyMesh(input);
  const original = topology(mesh);
  const kept: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3)
    if (!original.degenerate.has(t))
      kept.push(mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
  if (!kept.length) throw new Error("Repair would leave no triangles");
  mesh.indices = new Uint32Array(kept);
  const warnings: string[] = [];
  if (original.degenerate.size)
    warnings.push(`Removed ${original.degenerate.size} degenerate triangle(s)`);
  const report = validateMesh(mesh),
    data = topology(mesh);
  if (report.nonManifoldEdges || report.inconsistentEdges) {
    warnings.push(
      "Unsafe topology: caps skipped; winding/non-manifold repair requires operator review",
    );
    return { mesh, report, warnings };
  }
  type Cap = {
    loop: number[];
    points: Vec2[];
    origin: Vec3;
    normal: Vec3;
    scale: number;
    triangles: number[];
  };
  const caps: Cap[] = [];
  for (const loop of report.boundaryLoops) {
    let normal: Vec3 = [0, 0, 0];
    const origin = vertex(mesh, loop[0]);
    let scale = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = sub(vertex(mesh, loop[i]), origin),
        b = sub(vertex(mesh, loop[(i + 1) % loop.length]), origin),
        c = cross(a, b);
      normal = [normal[0] + c[0], normal[1] + c[1], normal[2] + c[2]];
      scale = Math.max(scale, Math.hypot(...a));
    }
    if (Math.hypot(...normal) < scale * scale * 1e-10) {
      warnings.push("Degenerate boundary skipped");
      continue;
    }
    normal = unit(normal);
    if (
      loop.some(
        (i) =>
          Math.abs(dot(sub(vertex(mesh, i), origin), normal)) >
          Math.max(1e-6, scale * 1e-5),
      )
    ) {
      warnings.push("Non-planar boundary skipped");
      continue;
    }
    const u = unit(sub(vertex(mesh, loop[1]), origin)),
      v = unit(cross(normal, u));
    const points: Vec2[] = loop.map((i) => {
      const d = sub(vertex(mesh, i), origin);
      return [dot(d, u), dot(d, v)];
    });
    if (!simplePolygon(points)) {
      warnings.push("Self-intersecting boundary skipped");
      continue;
    }
    const triangles = earcut(points.flat());
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    let triArea = 0;
    for (let t = 0; t < triangles.length; t += 3)
      triArea += Math.abs(
        orientation(
          points[triangles[t]],
          points[triangles[t + 1]],
          points[triangles[t + 2]],
        ),
      );
    if (
      triangles.length !== 3 * (loop.length - 2) ||
      Math.abs(triArea - Math.abs(area)) > Math.max(1e-6, Math.abs(area) * 1e-6)
    ) {
      warnings.push("Cap triangulation incomplete; boundary skipped");
      continue;
    }
    caps.push({ loop, points, origin, normal, scale, triangles });
  }
  for (const cap of caps) {
    // Separate coplanar loops could encode a hole or intersecting components; do not bridge/fill them independently.
    if (
      caps.some(
        (other) =>
          other !== cap &&
          Math.abs(dot(cap.normal, other.normal)) > 0.99999 &&
          Math.abs(dot(sub(other.origin, cap.origin), cap.normal)) <
            Math.max(cap.scale, other.scale) * 1e-5,
      )
    ) {
      warnings.push("Multiple coplanar boundaries skipped (possible holes)");
      continue;
    }
    const { loop, triangles } = cap;
    const uses = data.edges.get(
      `${Math.min(loop[0], loop[1])}:${Math.max(loop[0], loop[1])}`,
    )!;
    const boundary = uses[0];
    // Earcut is CCW in the projected basis. Choose the opposite directed boundary edge.
    const desiredReverse = boundary.a === loop[0];
    for (let t = 0; t < triangles.length; t += 3) {
      let [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
      const ccw = orientation(cap.points[a], cap.points[b], cap.points[c]) > 0;
      if (ccw === desiredReverse) [b, c] = [c, b];
      kept.push(loop[a], loop[b], loop[c]);
    }
  }
  mesh.indices = new Uint32Array(kept);
  const oriented = orientMesh(mesh);
  const result = validateMesh(oriented.mesh);
  warnings.push(...oriented.warnings, ...result.warnings);
  return { mesh: oriented.mesh, report: result, warnings };
}
