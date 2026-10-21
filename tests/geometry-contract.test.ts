import { it, expect } from "vitest";
import {
  alignPCA,
  applyBrush,
  calibrateMesh,
  deformationColors,
  getBounds,
  registerLandmarks,
  repairMesh,
  scaleZone,
  SliceIndex,
  validateMesh,
} from "../src/geometry";
import type { MeshData } from "../src/types";

function fixture(): MeshData {
  const positions = new Float32Array([
    -10, -10, 0, 10, -10, 0, 10, 10, 0, -10, 10, 0, -10, -10, 100, 10, -10, 100,
    10, 10, 100, -10, 10, 100,
  ]);
  return {
    name: "attribute fixture",
    source: "imported",
    positions,
    indices: new Uint32Array([
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
    colors: Float32Array.from(positions, (_, i) => (i % 7) / 7),
    uvs: Float32Array.from({ length: 16 }, (_, i) => (i % 3) / 3),
    textureUrl: "blob:offline-owned-asset",
  };
}
it("every mesh transformation preserves provenance, RGB, UV, texture and owns all returned arrays", () => {
  const mesh = fixture(),
    snapshot = {
      positions: mesh.positions.slice(),
      indices: mesh.indices.slice(),
      colors: mesh.colors!.slice(),
      uvs: mesh.uvs!.slice(),
    };
  const transforms = [
    () => alignPCA(mesh),
    () =>
      registerLandmarks(mesh, {
        distal: [0, 0, 0],
        lateral: [10, 0, 90],
        anterior: [0, 10, 80],
      }),
    () => repairMesh(mesh).mesh,
    () => calibrateMesh(mesh, [{ z: 50, circumference: 88 }]),
    () =>
      applyBrush(mesh, {
        center: [10, 10, 0],
        radius: 10,
        strength: 1,
        mode: "relief",
      }),
    () =>
      applyBrush(mesh, {
        center: [10, 10, 0],
        radius: 10,
        strength: 0.4,
        mode: "smooth",
      }),
    () => scaleZone(mesh, -5, 0, 100),
  ];
  for (const transform of transforms) {
    const result = transform();
    expect(result.source).toBe("imported");
    expect(result.name).toBe(mesh.name);
    expect(result.textureUrl).toBe(mesh.textureUrl);
    expect(result.colors).toEqual(snapshot.colors);
    expect(result.uvs).toEqual(snapshot.uvs);
    for (const key of ["positions", "indices", "colors", "uvs"] as const)
      expect(result[key]).not.toBe(mesh[key]);
    expect(mesh.positions).toEqual(snapshot.positions);
    expect(mesh.indices).toEqual(snapshot.indices);
    expect(mesh.colors).toEqual(snapshot.colors);
    expect(mesh.uvs).toEqual(snapshot.uvs);
  }
  const colors = deformationColors(mesh, snapshot.positions);
  expect(colors).toHaveLength(mesh.positions.length);
  expect(mesh.colors).toEqual(snapshot.colors);
});
it("enforces allocation limits and validates all channels without lossy repair", () => {
  const mesh = fixture();
  expect(() =>
    validateMesh({ ...mesh, positions: new Float32Array(2_000_001 * 3) }),
  ).toThrow(/limit/i);
  expect(
    () => new SliceIndex({ ...mesh, indices: new Uint32Array(4_000_001 * 3) }),
  ).toThrow(/limit/i);
  const colors = mesh.colors!.slice();
  colors[0] = NaN;
  expect(() => getBounds({ ...mesh, colors })).toThrow(/finite/i);
  const uvs = mesh.uvs!.slice();
  uvs[0] = Infinity;
  expect(() => repairMesh({ ...mesh, uvs })).toThrow(/finite/i);
});
it("uses an actual rotated plane normal, not radial vectors from the origin", () => {
  const mesh: MeshData = {
    name: "vertical plane",
    positions: new Float32Array([50, 0, 0, 50, 1, 0, 50, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const result = applyBrush(mesh, {
    center: [50, 0, 0],
    radius: 2,
    strength: 2,
    mode: "relief",
  });
  expect(result.positions[0]).toBeCloseTo(52);
  expect(result.positions[2]).toBe(0);
  const outside = applyBrush(mesh, {
    center: [0, 0, 0],
    radius: 1,
    strength: 2,
    mode: "compress",
  });
  expect(outside.positions).toEqual(mesh.positions);
});
