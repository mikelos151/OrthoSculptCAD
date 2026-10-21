import { describe, it, expect } from "vitest";
import * as geo from "../src/geometry";
import type { MeshData } from "../src/types";

function cylinder(
  radius = 20,
  height = 100,
  n = 128,
  capped = true,
  levels = 1,
): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let l = 0; l <= levels; l++)
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      positions.push(
        radius * Math.cos(a),
        radius * Math.sin(a),
        (height * l) / levels,
      );
    }
  for (let l = 0; l < levels; l++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        a = l * n,
        b = (l + 1) * n;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  if (capped) {
    const end = (levels + 1) * n;
    positions.push(0, 0, 0, 0, 0, height);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(end, j, i, end + 1, levels * n + i, levels * n + j);
    }
  }
  return {
    name: "analytic cylinder",
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

describe("validation and topology", () => {
  it("rejects malformed triples, non-finite coordinates, invalid indices and attributes before indexing", () => {
    const bad: MeshData[] = [];
    const base = cylinder();
    bad.push({ ...base, positions: new Float32Array([0, 0, 0, 1]) });
    const nan = base.positions.slice();
    nan[0] = NaN;
    bad.push({ ...base, positions: nan });
    bad.push({ ...base, indices: new Uint32Array([0, 1, 999999]) });
    bad.push({ ...base, indices: new Uint32Array([0, 1]) });
    bad.push({ ...base, colors: new Float32Array(1) });
    bad.push({ ...base, uvs: new Float32Array([Infinity]) });
    for (const mesh of bad) {
      expect(() => geo.validateMesh(mesh)).toThrow();
      expect(() => new geo.SliceIndex(mesh)).toThrow();
    }
    expect(() => new geo.SliceIndex(base).slice(NaN)).toThrow();
  });
  it("reports closed cylinder topology, signed volume and open boundary loops", () => {
    const mesh = cylinder(20, 100, 32);
    const report = geo.validateMesh(mesh);
    expect(report.watertight).toBe(true);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.inconsistentEdges).toBe(0);
    expect(report.signedVolume).toBeCloseTo(
      ((32 * 400 * Math.sin((2 * Math.PI) / 32)) / 2) * 100,
      0,
    );
    const open = geo.validateMesh(cylinder(20, 100, 32, false));
    expect(open.watertight).toBe(false);
    expect(open.boundaryLoops.map((l) => l.length)).toEqual([32, 32]);
    const bounds = geo.getBounds(mesh);
    expect(bounds.min).toEqual([-20, -20, 0]);
    expect(bounds.size).toEqual([40, 40, 100]);
  });
});

describe("safe planar repair", () => {
  it("caps planar boundaries with existing vertices, correct winding and copied RGB/UV", () => {
    const mesh = cylinder(20, 100, 24, false);
    mesh.colors = new Float32Array(mesh.positions.length).fill(0.3);
    mesh.uvs = new Float32Array((mesh.positions.length / 3) * 2).fill(0.2);
    mesh.textureUrl = "blob:local-texture";
    const original = mesh.indices.slice();
    const result = geo.repairMesh(mesh);
    expect(result.report.watertight).toBe(true);
    expect(result.report.signedVolume).toBeGreaterThan(0);
    expect(result.report.inconsistentEdges).toBe(0);
    expect(mesh.indices).toEqual(original);
    expect(result.mesh.positions).not.toBe(mesh.positions);
    expect(result.mesh.colors).toEqual(mesh.colors);
    expect(result.mesh.colors).not.toBe(mesh.colors);
    expect(result.mesh.uvs).toEqual(mesh.uvs);
    expect(result.mesh.textureUrl).toBe(mesh.textureUrl);
  });
});

describe("alignment", () => {
  it("rejects an ambiguous principal proximal axis rather than guessing anatomical orientation", () => {
    const mesh: MeshData = {
      name: "isotropic octahedron",
      positions: new Float32Array([
        20, 0, 0, -20, 0, 0, 0, 20, 0, 0, -20, 0, 0, 0, 20, 0, 0, -20,
      ]),
      indices: new Uint32Array([
        0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5,
      ]),
    };
    expect(() =>
      geo.registerLandmarks(mesh, {
        distal: [-20, -20, -20],
        anterior: [0, 20, 0],
        lateral: [20, 0, 0],
      }),
    ).toThrow(/principal axis.*ambiguous/i);
  });
  it("preserves principal axial height when landmarks lie high above the distal point", () => {
    const mesh = cylinder(20, 240, 128, true, 12);
    const result = geo.registerLandmarks(mesh, {
      distal: [0, 0, 0],
      anterior: [0, 20, 200],
      lateral: [20, 0, 190],
    });
    const axisVertex = mesh.positions.length - 3;
    expect(result.positions[axisVertex + 2]).toBeCloseTo(240, 3);
    expect(geo.getBounds(result).size[2]).toBeCloseTo(240, 3);
    expect(result.positions[3 * 32 + 1]).toBeGreaterThan(19);
    expect(() =>
      geo.registerLandmarks(mesh, {
        distal: [0, 0, 0],
        anterior: [0, 20, 200],
        lateral: [-20, 0, 190],
      }),
    ).toThrow(/chirality|right.handed|laterality/i);
  });
  it("registers an orthonormal landmark frame with zero default flexion and rejects collinear picks", () => {
    const mesh = cylinder();
    const picks = {
      anterior: [1, 1, 0] as [number, number, number],
      lateral: [1, 0, 0] as [number, number, number],
      distal: [0, 0, 0] as [number, number, number],
    };
    expect(geo.registerLandmarks(mesh, picks).positions).toEqual(
      mesh.positions,
    );
    const five = geo.registerLandmarks(mesh, picks, 5);
    const i = 128 * 3;
    expect(five.positions[i + 1]).toBeCloseTo(
      -100 * Math.sin((5 * Math.PI) / 180),
      4,
    );
    expect(five.positions[i + 2]).toBeCloseTo(
      100 * Math.cos((5 * Math.PI) / 180),
      4,
    );
    expect(() =>
      geo.registerLandmarks(mesh, { ...picks, anterior: [2, 0, 0] }),
    ).toThrow(/collinear/i);
    expect(() =>
      geo.registerLandmarks(mesh, { ...picks, anterior: [NaN, 0, 0] }),
    ).toThrow();
  });
  it("uses covariance eigenvectors to align a translated oblique long axis to proximal Z", () => {
    const mesh = cylinder(20, 100, 64);
    const a = 0.63;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i],
        z = mesh.positions[i + 2];
      mesh.positions[i] = x * Math.cos(a) + z * Math.sin(a) + 120;
      mesh.positions[i + 1] -= 70;
      mesh.positions[i + 2] = -x * Math.sin(a) + z * Math.cos(a) + 30;
    }
    const before = mesh.positions.slice();
    const aligned = geo.alignPCA(mesh),
      bounds = geo.getBounds(aligned);
    expect(bounds.min[2]).toBeCloseTo(0, 4);
    expect(bounds.size[2]).toBeCloseTo(100, 3);
    expect(bounds.size[0]).toBeCloseTo(40, 1);
    expect(bounds.size[1]).toBeCloseTo(40, 1);
    expect(geo.validateMesh(aligned).signedVolume).toBeCloseTo(
      geo.validateMesh(mesh).signedVolume,
      0,
    );
    expect(mesh.positions).toEqual(before);
  });
});

describe("measurement rows", () => {
  it("samples requested heights and computes explicit trapezoid segment volume", () => {
    const mesh = cylinder();
    const rows = geo.measureMesh(mesh, 25);
    expect(rows.map((r) => r.z)).toEqual([0, 25, 50, 75, 100]);
    expect(rows.every((r) => r.valid)).toBe(true);
    expect(rows[0].segmentVolume).toBeNull();
    expect(rows[1].segmentVolume).toBeCloseTo(rows[1].area * 25, 5);
    expect(rows[1].circumference).toBeCloseTo(2 * Math.PI * 20, 1);
    expect(() => geo.measureMesh(mesh, 0)).toThrow();
    expect(() => geo.measureMesh(mesh, NaN)).toThrow();
    expect(() => geo.measureMesh(mesh, 1e-8)).toThrow();
  });
});

describe("radial tape calibration", () => {
  it("interpolates circumference factors by Z, clamps beyond tapes and preserves every Z", () => {
    const mesh = cylinder(20, 100, 64, true, 4);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      mesh.positions[i] += 80;
      mesh.positions[i + 1] -= 45;
    }
    const index = new geo.SliceIndex(mesh),
      base = index.slice(25).perimeter;
    const calibrated = geo.calibrateMesh(mesh, [
      { z: 75, circumference: base * 1.5 },
      { z: 25, circumference: base },
    ]);
    expect(new geo.SliceIndex(calibrated).slice(25).perimeter).toBeCloseTo(
      base,
      3,
    );
    expect(new geo.SliceIndex(calibrated).slice(75).perimeter).toBeCloseTo(
      base * 1.5,
      3,
    );
    for (let i = 2; i < mesh.positions.length; i += 3)
      expect(calibrated.positions[i]).toBe(mesh.positions[i]);
    expect(calibrated.positions[0]).toBeCloseTo(100, 4);
    expect(calibrated.positions[4 * 64 * 3]).toBeCloseTo(110, 4);
    expect(calibrated.positions[2 * 64 * 3]).toBeCloseTo(105, 4);
    expect(() =>
      geo.calibrateMesh(mesh, [{ z: 25, circumference: base * 10 }]),
    ).toThrow();
    expect(() =>
      geo.calibrateMesh(mesh, [{ z: 25, circumference: 0 }]),
    ).toThrow();
    expect(() =>
      geo.calibrateMesh(mesh, [
        { z: 25, circumference: base },
        { z: 25, circumference: base },
      ]),
    ).toThrow();
  });
});

describe("Hermite surface brush", () => {
  it("smooths from actual one-ring neighbours simultaneously, never array order or disconnected points", () => {
    const mesh: MeshData = {
      name: "spike",
      positions: new Float32Array([
        0, 0, 1, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, 1.1,
      ]),
      indices: new Uint32Array([0, 1, 3, 0, 3, 2]),
    };
    const smoothed = geo.applyBrush(mesh, {
      center: [0, 0, 1],
      radius: 1,
      strength: 1,
      mode: "smooth",
    });
    expect(smoothed.positions[0]).toBeCloseTo(0);
    expect(smoothed.positions[1]).toBeCloseTo(1 / 3);
    expect(smoothed.positions[2]).toBeCloseTo(0);
    expect(smoothed.positions[14]).toBe(mesh.positions[14]);
    expect(smoothed.positions[3]).toBe(mesh.positions[3]);
    expect(mesh.positions[2]).toBe(1);
  });
  it("applies compact Hermite relief/compression along area-weighted mesh normals", () => {
    const mesh: MeshData = {
      name: "plane",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const options = {
      center: [0, 0, 0] as [number, number, number],
      radius: 2,
      strength: 2,
    };
    const relief = geo.applyBrush(mesh, { ...options, mode: "relief" }),
      compress = geo.applyBrush(mesh, { ...options, mode: "compress" });
    expect(relief.positions[2]).toBeCloseTo(2);
    expect(relief.positions[5]).toBeCloseTo(1);
    expect(compress.positions[2]).toBeCloseTo(-2);
    expect(mesh.positions[2]).toBe(0);
    expect(() =>
      geo.applyBrush(mesh, { ...options, radius: 0, mode: "relief" }),
    ).toThrow();
  });
});

describe("zonal circumference scaling", () => {
  it("changes circumference by the requested percent, not volume percent, only inside the Z zone", () => {
    const mesh = cylinder(20, 100, 64, true, 4);
    const scaled = geo.scaleZone(mesh, 10, 25, 75);
    const before = new geo.SliceIndex(mesh).slice(50),
      after = new geo.SliceIndex(scaled).slice(50);
    expect(after.perimeter / before.perimeter).toBeCloseTo(1.1, 5);
    expect(after.area / before.area).toBeCloseTo(1.21, 5);
    expect(scaled.positions[0]).toBe(mesh.positions[0]);
    expect(scaled.positions[4 * 64 * 3]).toBe(mesh.positions[4 * 64 * 3]);
    for (let i = 2; i < mesh.positions.length; i += 3)
      expect(scaled.positions[i]).toBe(mesh.positions[i]);
    expect(() => geo.scaleZone(mesh, -100, 0, 100)).toThrow();
    expect(() => geo.scaleZone(mesh, 10, 100, 0)).toThrow();
  });
});

describe("signed reference-normal heatmap", () => {
  it("separates outward/inward displacement and leaves tangential movement neutral", () => {
    const mesh: MeshData = {
      name: "reference plane",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const reference = mesh.positions.slice();
    const neutral = geo.deformationColors(mesh, reference);
    mesh.positions[2] = 2;
    mesh.positions[5] = -2;
    mesh.positions[6] += 3;
    const colors = geo.deformationColors(mesh, reference);
    // Brief convention: outward relief is BLUE; inward compression is RED.
    expect(colors[0]).toBeLessThan(colors[2]);
    expect(colors[3]).toBeGreaterThan(colors[5]);
    expect(colors.slice(6, 9)).toEqual(neutral.slice(6, 9));
    expect(reference[2]).toBe(0);
    expect(() => geo.deformationColors(mesh, new Float32Array(1))).toThrow();
  });
});

describe("educational synthetic demo", () => {
  it("has one OPEN proximal boundary, closed rounded distal end and dermographic-like vertex RGB", () => {
    const mesh = geo.createDemoMesh(),
      report = geo.validateMesh(mesh);
    expect(mesh.name).toMatch(/synt/i);
    expect(mesh.source).toBe("synthetic");
    expect(report.boundaryLoops).toHaveLength(1);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.inconsistentEdges).toBe(0);
    expect(report.degenerateTriangles).toBe(0);
    expect(report.signedVolume).toBeGreaterThan(0);
    const bounds = geo.getBounds(mesh);
    for (const i of report.boundaryLoops[0])
      expect(mesh.positions[i * 3 + 2]).toBe(bounds.max[2]);
    expect(mesh.colors?.length).toBe(mesh.positions.length);
    const unique = new Set<string>();
    for (let i = 0; i < mesh.colors!.length; i += 3)
      unique.add(
        Array.from(mesh.colors!.slice(i, i + 3))
          .map((x) => x.toFixed(2))
          .join(","),
      );
    expect(unique.size).toBeGreaterThan(3);
    const index = new geo.SliceIndex(mesh);
    for (const z of [5, 80, 150, bounds.max[2]])
      expect(index.slice(z).valid).toBe(true);
    expect(geo.createDemoMesh().positions).not.toBe(mesh.positions);
    expect(geo.scaleZone(mesh, 1, 0, 240).source).toBe("synthetic");
  });
});

describe("ordered interval slices", () => {
  it("measures a real polygonal cylinder to analytical tolerance without mutating it", () => {
    const mesh = cylinder();
    const before = mesh.positions.slice();
    const s = new geo.SliceIndex(mesh).slice(43);
    expect(s.valid).toBe(true);
    expect(s.loops).toHaveLength(1);
    expect(s.loops[0].closed).toBe(true);
    expect(s.perimeter).toBeCloseTo(2 * Math.PI * 20, 1);
    expect(Math.abs(s.area - Math.PI * 400) / (Math.PI * 400)).toBeLessThan(
      0.001,
    );
    expect(s.area).toBeCloseTo(
      (128 * 400 * Math.sin((2 * Math.PI) / 128)) / 2,
      3,
    );
    expect(s.ml).toBeCloseTo(40, 4);
    expect(s.ap).toBeCloseTo(40, 4);
    expect(mesh.positions).toEqual(before);
    const points = s.loops[0].points;
    let p = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      p += Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    expect(p).toBeCloseTo(s.perimeter, 6);
  });
});
