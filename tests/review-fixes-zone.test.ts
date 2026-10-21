import { expect, it } from "vitest";
import { scaleZone } from "../src/geometry/deformation";
import { SliceIndex } from "../src/geometry/slicing";
import type { MeshData } from "../src/types";

function cylinder(levels = 1): MeshData {
  const positions: number[] = [], indices: number[] = [], n = 32;
  for (let l = 0; l <= levels; l++)
    for (let i = 0; i < n; i++) {
      const a = i * 2 * Math.PI / n;
      positions.push(20 * Math.cos(a), 20 * Math.sin(a), 100 * l / levels);
    }
  for (let l = 0; l < levels; l++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = l * n, b = (l + 1) * n;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  return { name: "SYNTHETIC radius20 height100", positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

it("rejects a coarse cylinder zone crossing faces but containing no vertices", () => {
  const mesh = cylinder();
  const before = mesh.positions.slice();
  expect(() => scaleZone(mesh, -10, 25, 75)).toThrow(/nie zmieniła.*współrzędnych/i);
  expect(mesh.positions).toEqual(before);
});

it.each([0, 1e-10])("rejects a zone that changes no stored Float32 coordinates at %s percent", percent => {
  const mesh = cylinder();
  const before = mesh.positions.slice();
  expect(() => scaleZone(mesh, percent, 0, 100)).toThrow(/nie zmieniła.*współrzędnych/i);
  expect(mesh.positions).toEqual(before);
});

it("still changes a dense zone circumference and leaves source, Z and out-of-zone vertices intact", () => {
  const mesh = cylinder(4), before = mesh.positions.slice();
  const result = scaleZone(mesh, -10, 25, 75);
  expect(new SliceIndex(result).slice(50).perimeter / new SliceIndex(mesh).slice(50).perimeter).toBeCloseTo(0.9, 6);
  expect(mesh.positions).toEqual(before);
  for (let i = 0; i < before.length; i += 3) {
    expect(result.positions[i + 2]).toBe(before[i + 2]);
    if (before[i + 2] < 25 || before[i + 2] > 75)
      expect(result.positions.slice(i, i + 3)).toEqual(before.slice(i, i + 3));
  }
});
