import type { Bounds, MeshData, TopologyReport, Vec3 } from "../types";

export const MAX_VERTICES = 2_000_000;
export const MAX_TRIANGLES = 4_000_000;
export function assertMesh(mesh: MeshData): void {
  if (
    !(mesh.positions instanceof Float32Array) ||
    !(mesh.indices instanceof Uint32Array)
  )
    throw new Error("Expected Float32 positions and Uint32 indices");
  const n = mesh.positions.length / 3;
  if (
    n < 3 ||
    !Number.isInteger(n) ||
    mesh.indices.length === 0 ||
    mesh.indices.length % 3 !== 0
  )
    throw new Error("Mesh needs nonempty xyz/triangle triples");
  if (n > MAX_VERTICES || mesh.indices.length / 3 > MAX_TRIANGLES)
    throw new Error("Mesh exceeds vertex/triangle limits");
  for (const x of mesh.positions)
    if (!Number.isFinite(x)) throw new Error("Non-finite mesh coordinate");
  for (const i of mesh.indices)
    if (i >= n) throw new Error("Triangle index out of bounds");
  for (const [array, stride, label] of [
    [mesh.colors, 3, "RGB"],
    [mesh.uvs, 2, "UV"],
  ] as const) {
    if (array) {
      if (!(array instanceof Float32Array) || array.length !== n * stride)
        throw new Error(`Invalid ${label} attribute length`);
      for (const x of array)
        if (!Number.isFinite(x)) throw new Error(`Non-finite ${label}`);
    }
  }
}
export function copyMesh(mesh: MeshData): MeshData {
  return {
    ...mesh,
    positions: mesh.positions.slice(),
    indices: mesh.indices.slice(),
    ...(mesh.colors ? { colors: mesh.colors.slice() } : {}),
    ...(mesh.uvs ? { uvs: mesh.uvs.slice() } : {}),
  };
}
export function vertex(mesh: MeshData, i: number): Vec3 {
  return [
    mesh.positions[i * 3],
    mesh.positions[i * 3 + 1],
    mesh.positions[i * 3 + 2],
  ];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function unit(a: Vec3): Vec3 {
  const d = Math.hypot(...a);
  if (d < 1e-12) throw new Error("Degenerate direction");
  return [a[0] / d, a[1] / d, a[2] / d];
}
export function getBounds(mesh: MeshData): Bounds {
  assertMesh(mesh);
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k], mesh.positions[i]);
    max[k] = Math.max(max[k], mesh.positions[i]);
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: Vec3 = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
  return { min, max, size, center };
}
export type EdgeUse = { a: number; b: number; face: number };
export function topology(mesh: MeshData) {
  const edges = new Map<string, EdgeUse[]>();
  const neighbours = Array.from(
    { length: mesh.positions.length / 3 },
    () => new Set<number>(),
  );
  let degenerateTriangles = 0,
    signedVolume = 0;
  const degenerate = new Set<number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ids = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const [a, b, c] = ids.map((i) => vertex(mesh, i));
    const normal = cross(sub(b, a), sub(c, a));
    const edgeScale = Math.max(
      dot(sub(b, a), sub(b, a)),
      dot(sub(c, a), sub(c, a)),
      dot(sub(c, b), sub(c, b)),
    );
    if (
      new Set(ids).size < 3 ||
      Math.hypot(...normal) <= Math.max(1e-20, edgeScale * 1e-12)
    ) {
      degenerateTriangles++;
      degenerate.add(t);
    }
    signedVolume += dot(a, cross(b, c)) / 6;
    for (let k = 0; k < 3; k++) {
      const u = ids[k],
        v = ids[(k + 1) % 3];
      const key = `${Math.min(u, v)}:${Math.max(u, v)}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key)!.push({ a: u, b: v, face: t });
      if (u !== v) {
        neighbours[u].add(v);
        neighbours[v].add(u);
      }
    }
  }
  return { edges, neighbours, degenerateTriangles, degenerate, signedVolume };
}
export function validateMesh(mesh: MeshData): TopologyReport {
  assertMesh(mesh);
  const data = topology(mesh);
  let boundaryEdges = 0,
    nonManifoldEdges = 0,
    inconsistentEdges = 0;
  const boundary = new Map<number, Set<number>>();
  for (const uses of data.edges.values()) {
    if (uses.length === 1) {
      boundaryEdges++;
      const { a, b } = uses[0];
      if (!boundary.has(a)) boundary.set(a, new Set());
      if (!boundary.has(b)) boundary.set(b, new Set());
      boundary.get(a)!.add(b);
      boundary.get(b)!.add(a);
    } else if (uses.length > 2) nonManifoldEdges++;
    else if (uses[0].a === uses[1].a && uses[0].b === uses[1].b)
      inconsistentEdges++;
  }
  const boundaryLoops: number[][] = [];
  const visited = new Set<number>();
  let branching = false;
  for (const seed of boundary.keys()) {
    if (visited.has(seed)) continue;
    const component: number[] = [];
    const stack = [seed];
    visited.add(seed);
    while (stack.length) {
      const a = stack.pop()!;
      component.push(a);
      for (const b of boundary.get(a)!) {
        if (!visited.has(b)) {
          visited.add(b);
          stack.push(b);
        }
      }
    }
    if (
      component.length < 3 ||
      component.some((i) => boundary.get(i)!.size !== 2)
    ) {
      branching = true;
      continue;
    }
    const loop: number[] = [];
    let prev = -1,
      cur = seed;
    do {
      loop.push(cur);
      const next = [...boundary.get(cur)!].find((i) => i !== prev)!;
      prev = cur;
      cur = next;
    } while (cur !== seed && loop.length <= component.length);
    if (cur === seed && loop.length === component.length)
      boundaryLoops.push(loop);
    else branching = true;
  }
  const warnings: string[] = [];
  if (boundaryEdges) warnings.push("Open boundary edges");
  if (nonManifoldEdges) warnings.push("Non-manifold edges");
  if (inconsistentEdges) warnings.push("Inconsistent winding");
  if (data.degenerateTriangles) warnings.push("Degenerate triangles");
  if (branching) warnings.push("Branched/open boundary chains");
  if (data.signedVolume < 0)
    warnings.push(
      "Negative signed volume: globally inverted orientation possible",
    );
  return {
    vertices: mesh.positions.length / 3,
    triangles: mesh.indices.length / 3,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentEdges,
    boundaryLoops,
    degenerateTriangles: data.degenerateTriangles,
    signedVolume: data.signedVolume,
    watertight:
      boundaryEdges === 0 &&
      nonManifoldEdges === 0 &&
      inconsistentEdges === 0 &&
      data.degenerateTriangles === 0,
    warnings,
  };
}
