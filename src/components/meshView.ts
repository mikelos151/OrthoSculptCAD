import * as THREE from "three/webgpu";
import type { MeshData } from "../types";
export function withMeshSource(mesh: MeshData, synthetic = false): MeshData {
  return {
    ...mesh,
    source: synthetic || mesh.source === "synthetic" ? "synthetic" : "imported",
  };
}
export function cloneMesh(mesh: MeshData): MeshData {
  return {
    ...mesh,
    positions: mesh.positions.slice(),
    indices: mesh.indices.slice(),
    colors: mesh.colors?.slice(),
    uvs: mesh.uvs?.slice(),
  };
}
export function scaledMesh(mesh: MeshData, scale: number): MeshData {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error("Skala jednostek musi być dodatnią, skończoną liczbą.");
  // Check the storage representation before allocating or publishing a new mesh.
  for (const value of mesh.positions)
    if (!Number.isFinite(Math.fround(value * scale)))
      throw new Error(
        "Konwersja jednostek przekracza zakres Float32. Zachowano model źródłowy; sprawdź jednostki i współrzędne.",
      );
  const copy = cloneMesh(mesh);
  copy.positions = copy.positions.map((value) => value * scale);
  return copy;
}
export function buildDisplayGeometry(
  mesh: MeshData,
  overrideColors?: Float32Array,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(mesh.positions.slice(), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(), 1));
  const colors = overrideColors ?? mesh.colors;
  if (colors)
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors.slice(), 3),
    );
  if (mesh.uvs)
    geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs.slice(), 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
