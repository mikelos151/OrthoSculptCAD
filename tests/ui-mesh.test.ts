import { expect, it } from "vitest";
import {
  buildDisplayGeometry,
  cloneMesh,
  scaledMesh,
  withMeshSource,
} from "../src/components/meshView";
it("keeps synthetic provenance when loading a saved project", () => {
  const synthetic = withMeshSource({ ...mesh, source: "synthetic" });
  expect(synthetic.source).toBe("synthetic");
  expect(withMeshSource(mesh, true).source).toBe("synthetic");
  expect(withMeshSource(mesh).source).toBe("imported");
  expect(mesh.source).toBeUndefined();
});
import type { MeshData } from "../src/types";
const mesh: MeshData = {
  name: "synthetic",
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
};
it("keeps raw vertex RGB and texture coordinates in displayed geometry", () => {
  const geometry = buildDisplayGeometry(mesh);
  expect(Array.from(geometry.getAttribute("color").array)).toEqual(
    Array.from(mesh.colors!),
  );
  expect(Array.from(geometry.getAttribute("uv").array)).toEqual(
    Array.from(mesh.uvs!),
  );
  expect(Array.from(geometry.index!.array)).toEqual([0, 1, 2]);
  geometry.dispose();
});
it("scales explicit units without mutating import and snapshots own coordinates", () => {
  const scaled = scaledMesh(mesh, 10);
  expect(scaled.positions[3]).toBe(10);
  expect(mesh.positions[3]).toBe(1);
  const snapshot = cloneMesh(scaled);
  scaled.positions[3] = 100;
  expect(snapshot.positions[3]).toBe(10);
});
