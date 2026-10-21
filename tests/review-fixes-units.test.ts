import { expect, it } from "vitest";
import { scaledMesh } from "../src/components/meshView";
import { parsePLY } from "../src/io/ply";

const hugePLY = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
1e36 0 0
0 1e36 0
0 0 1e36
3 0 1 2
`;

it("rejects Float32 overflow during unit conversion without changing the imported mesh", () => {
  const mesh = parsePLY(new TextEncoder().encode(hugePLY));
  const original = mesh.positions.slice();
  expect(() => scaledMesh(mesh, 1000)).toThrow(/Float32/);
  expect(mesh.positions).toEqual(original);
  expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
});

it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid unit scale %s", (scale) => {
  const mesh = parsePLY(new TextEncoder().encode(hugePLY));
  expect(() => scaledMesh(mesh, scale)).toThrow(/Skala/);
});

it("keeps representable conversions finite and preserves source attributes", () => {
  const mesh = parsePLY(new TextEncoder().encode(hugePLY.replaceAll("1e36", "1.25")));
  const scaled = scaledMesh(mesh, 1000);
  expect(Array.from(scaled.positions)).toEqual([1250, 0, 0, 0, 1250, 0, 0, 0, 1250]);
  expect(scaled.indices).toEqual(mesh.indices);
  expect(mesh.positions[0]).toBe(1.25);
});
