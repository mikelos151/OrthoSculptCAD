import { describe, it, expect } from "vitest";
import {
  SliceIndex,
  validateMesh,
  repairMesh,
  measureMesh,
} from "../src/geometry";
import type { MeshData, Vec2 } from "../src/types";

function prism(points: Vec2[], levels = [0, 100]): MeshData {
  const n = points.length,
    positions: number[] = [],
    indices: number[] = [];
  for (const z of levels) for (const p of points) positions.push(...p, z);
  for (let l = 0; l < levels.length - 1; l++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        a = l * n,
        b = (l + 1) * n;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  return {
    name: "test prism",
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
function circle(n = 128, r = 10): Vec2[] {
  return Array.from({ length: n }, (_, i) => [
    r * Math.cos((2 * Math.PI * i) / n),
    r * Math.sin((2 * Math.PI * i) / n),
  ]);
}
function merge(a: MeshData, b: MeshData): MeshData {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions);
  positions.set(b.positions, a.positions.length);
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  indices.set(
    b.indices.map((i) => i + a.positions.length / 3),
    a.indices.length,
  );
  return { name: "disconnected", positions, indices };
}
describe("contour ambiguity and exact plane cases", () => {
  it("rejects duplicated crossing faces instead of silently deduplicating ambiguous surface intersections", () => {
    const mesh = prism(circle(16));
    mesh.indices = new Uint32Array([
      ...mesh.indices,
      ...mesh.indices.slice(0, 3),
    ]);
    const s = new SliceIndex(mesh).slice(50);
    expect(s.valid).toBe(false);
    expect(s.warnings.join()).toMatch(/duplicate|ambiguous/i);
  });
  it("rejects a self-intersecting ordered contour rather than reporting its shoelace area", () => {
    const bow = prism([
      [0, 0],
      [5, 0],
      [0, 4],
      [4, 4],
      [1, 1],
    ]);
    const result = new SliceIndex(bow).slice(50);
    expect(result.valid).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/intersect|ambiguous/i);
    expect(result.perimeter).toBe(0);
  });
  it("keeps concavity, not a convex hull", () => {
    const concave = prism([
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ]);
    const result = new SliceIndex(concave).slice(50);
    expect(result.valid).toBe(true);
    expect(result.area).toBeCloseTo(7);
    expect(result.perimeter).toBeCloseTo(16);
  });
  it("handles plane through a vertex ring and horizontal boundary edges without duplicate segments", () => {
    const mesh = prism(circle(), [0, 50, 100]);
    for (const z of [0, 50, 100]) {
      const s = new SliceIndex(mesh).slice(z);
      expect(s.valid).toBe(true);
      expect(s.loops[0].points).toHaveLength(128);
      expect(s.perimeter).toBeCloseTo(20 * Math.PI, 1);
    }
    const capped = repairMesh(mesh).mesh;
    for (const z of [0, 50, 100])
      expect(new SliceIndex(capped).slice(z).valid).toBe(true);
  });
  it("rejects separated closed loops and never bridges them", () => {
    const a = prism(circle()),
      b = prism(circle());
    for (let i = 0; i < b.positions.length; i += 3) b.positions[i] += 40;
    const mesh = merge(a, b),
      s = new SliceIndex(mesh).slice(50);
    expect(s.valid).toBe(false);
    expect(s.loops).toHaveLength(2);
    expect(s.loops.every((l) => l.closed)).toBe(true);
    expect(s.perimeter).toBe(0);
    expect(
      measureMesh(mesh, 50).every((r) => !r.valid && r.segmentVolume === null),
    ).toBe(true);
  });
  it("rejects an open chain and a branched triangle fan", () => {
    const mesh = prism(circle());
    mesh.indices = mesh.indices.slice(6);
    const s = new SliceIndex(mesh).slice(50);
    expect(s.valid).toBe(false);
    expect(s.loops[0].closed).toBe(false);
    const fan: MeshData = {
      name: "branch",
      positions: new Float32Array([
        0, 0, -1, 0, 0, 1, 2, 0, 1, -2, 0, 1, 0, 2, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 1, 3, 0, 1, 4]),
    };
    const b = new SliceIndex(fan).slice(0);
    expect(b.valid).toBe(false);
    expect(b.warnings.join()).toMatch(/branch/i);
  });
  it("measures translated/tilted cylinders in the actual horizontal plane", () => {
    const mesh = prism(circle(256), [0, 200]),
      a = 0.4;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i],
        z = mesh.positions[i + 2];
      mesh.positions[i] = x * Math.cos(a) + z * Math.sin(a) + 300;
      mesh.positions[i + 1] -= 80;
      mesh.positions[i + 2] = -x * Math.sin(a) + z * Math.cos(a) + 70;
    }
    const s = new SliceIndex(mesh).slice(100 * Math.cos(a) + 70);
    expect(s.valid).toBe(true);
    expect(s.area).toBeCloseTo((Math.PI * 100) / Math.cos(a), 0);
    expect(s.ml).toBeCloseTo(20 / Math.cos(a), 3);
    expect(s.ap).toBeCloseTo(20, 3);
  });
  it("snapshots coordinates and indices so later input mutation cannot stale the interval tree", () => {
    const mesh = prism(circle()),
      index = new SliceIndex(mesh),
      before = index.slice(50);
    mesh.positions.fill(0);
    mesh.indices.fill(0);
    expect(index.slice(50).perimeter).toBe(before.perimeter);
    expect(index.slice(101).valid).toBe(false);
  });
});

describe("topology diagnostics and conservative caps", () => {
  it("counts winding, degeneracies and non-manifold edge uses", () => {
    const mesh = repairMesh(prism(circle(16))).mesh;
    const reversed = { ...mesh, indices: mesh.indices.slice() };
    [reversed.indices[0], reversed.indices[1]] = [
      reversed.indices[1],
      reversed.indices[0],
    ];
    expect(validateMesh(reversed).inconsistentEdges).toBe(3);
    expect(validateMesh(reversed).watertight).toBe(false);
    const duplicate = {
      ...mesh,
      indices: new Uint32Array([...mesh.indices, ...mesh.indices.slice(0, 3)]),
    };
    expect(validateMesh(duplicate).nonManifoldEdges).toBe(3);
    const degenerate = {
      ...mesh,
      indices: new Uint32Array([...mesh.indices, 0, 0, 1]),
    };
    expect(validateMesh(degenerate).degenerateTriangles).toBe(1);
    expect(repairMesh(degenerate).report.degenerateTriangles).toBe(0);
  });
  it("earcuts a concave planar cap, but refuses non-planar and self-crossing boundaries", () => {
    const concave = prism([
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ]),
      fixed = repairMesh(concave);
    expect(fixed.report.watertight).toBe(true);
    expect(fixed.report.signedVolume).toBeCloseTo(700);
    const bent = prism(circle(16));
    bent.positions[2] = 3;
    const result = repairMesh(bent);
    expect(result.report.boundaryLoops).toHaveLength(1);
    expect(result.warnings.join()).toMatch(/non.planar/i);
    const crossing = repairMesh(
      prism([
        [0, 0],
        [5, 0],
        [0, 4],
        [4, 4],
        [1, 1],
      ]),
    );
    expect(crossing.report.watertight).toBe(false);
    expect(crossing.warnings.join()).toMatch(/intersect|degenerate/i);
  });
});
