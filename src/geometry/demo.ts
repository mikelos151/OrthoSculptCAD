import type { MeshData } from "../types";

/** Procedural teaching geometry. Not a patient scan or an anatomical/clinical reference. */
export function createDemoMesh(): MeshData {
  const n = 96,
    levels = 61,
    height = 240;
  const positions: number[] = [0, 0, 0],
    colors: number[] = [0.78, 0.63, 0.51],
    indices: number[] = [];
  for (let l = 0; l < levels; l++) {
    const z = 2 + ((height - 2) * l) / (levels - 1),
      tip = z < 32 ? Math.sqrt(1 - ((32 - z) / 32) ** 2) : 1;
    const radius =
      (35 + 22 * (z / height) + 3 * Math.exp(-(((z - 100) / 50) ** 2))) * tip;
    for (let j = 0; j < n; j++) {
      const a = (j * 2 * Math.PI) / n,
        ca = Math.cos(a),
        sa = Math.sin(a),
        asymmetry =
          1 + 0.025 * Math.cos(3 * a) * Math.sin((Math.PI * z) / height);
      const x = radius * ca * asymmetry + 2 * Math.sin((z / height) * Math.PI),
        y =
          radius * 0.86 * sa * asymmetry -
          2 * Math.exp(-(((z - 95) / 30) ** 2)) * Math.max(0, sa) ** 6;
      positions.push(x, y, z);
      // Blue longitudinal line + cross marks, purple circumferential guide, red educational patch.
      let color = [0.78 + 0.025 * ca, 0.63 + 0.02 * sa, 0.51 + 0.015 * ca];
      if (
        sa > 0.75 &&
        (Math.abs(ca) < 0.045 ||
          (Math.abs(z - 94) < 2.5 && Math.abs(ca) < 0.32))
      )
        color = [0.08, 0.2, 0.55];
      if (Math.abs(z - 161) < 2.5 && j % 12 < 8) color = [0.35, 0.12, 0.48];
      if (ca > 0.94 && Math.abs(z - 115) < 11) color = [0.65, 0.16, 0.12];
      colors.push(...color);
    }
  }
  for (let j = 0; j < n; j++) indices.push(0, 1 + ((j + 1) % n), 1 + j);
  for (let l = 0; l < levels - 1; l++)
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n,
        a = 1 + l * n,
        b = a + n;
      indices.push(a + j, a + k, b + k, a + j, b + k, b + j);
    }
  return {
    name: "SYNTETYCZNY DEMONSTRATOR — geometria edukacyjna, nie skan pacjenta",
    source: "synthetic",
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
  };
}
