import { expect, it } from 'vitest';
import { simplePolygon } from '../src/geometry/planar';
import { SliceIndex } from '../src/geometry/slicing';
import type { MeshData, Vec2 } from '../src/types';

// Same serpentine boundary as Rust geometry.rs: simple, Y-disjoint segments
// with overlapping X extents force active-set work even without intersections.
function serpentine(rows: number): Vec2[] {
  const points: Vec2[] = [];
  for (let row = 0; row < rows; row++) {
    if (row % 2 === 0) points.push([0, row], [10, row]);
    else points.push([10, row], [0, row]);
  }
  points.push([-1, rows - 1], [-1, -1], [0, -1]);
  return points;
}
function prism(points: Vec2[]): MeshData {
  const n = points.length;
  const positions = new Float32Array(n * 6);
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    positions.set([...points[i], 0], i * 3);
    positions.set([...points[i], 100], (n + i) * 3);
    const j = (i + 1) % n;
    indices.set([i, j, n + j, i, n + j, n + i], i * 6);
  }
  return { name: 'Rust contour parity', positions, indices };
}

it('fails closed on the production 4M active-visit budget for a pathological simple contour', () => {
  expect(simplePolygon(serpentine(30))).toBe(true);
  expect(simplePolygon(serpentine(3000))).toBe(false);
});

it('propagates exhausted validation to an invalid diagnostic slice, not accepted metrics', () => {
  const result = new SliceIndex(prism(serpentine(3000))).slice(50);
  expect(result.valid).toBe(false);
  expect(result.warnings.join(' ')).toMatch(/ambiguous|limit/i);
  expect([result.perimeter, result.area, result.ap, result.ml]).toEqual([0, 0, 0, 0]);
  expect(result.loops).toHaveLength(1);
  expect(result.loops[0].closed).toBe(true);
  expect(result.loops[0].area).toBeGreaterThan(0);
});

it('rejects more than 250000 contour segments before mapping or sorting them', () => {
  const points = new Proxy([] as Vec2[], {
    get(target, key, receiver) {
      if (key === 'length') return 250_001;
      if (key === 'map') throw new Error('must reject before allocation');
      return Reflect.get(target, key, receiver);
    },
  });
  expect(simplePolygon(points)).toBe(false);
});

it.each([NaN, Infinity, -Infinity])('fails closed on a non-finite contour coordinate %s', value => {
  expect(simplePolygon([[0, 0], [1, 0], [0, value]])).toBe(false);
});

it('accepts a regular finite contour exactly at the 250000 segment boundary', () => {
  const points = Array.from({ length: 250_000 }, (_, i): Vec2 => {
    const angle = 2 * Math.PI * i / 250_000;
    return [100 * Math.cos(angle), 100 * Math.sin(angle)];
  });
  expect(simplePolygon(points)).toBe(true);
});

it('charges adjacent edges too and permits only a finite lower test budget', () => {
  const triangle: Vec2[] = [[0, 0], [1, 0], [0, 1]];
  expect(simplePolygon(triangle, 2)).toBe(false);
  expect(simplePolygon(triangle, 3)).toBe(true);
  for (const budget of [NaN, Infinity, -1, 0.5, 4_000_001]) {
    expect(simplePolygon(triangle, budget)).toBe(false);
  }
});

const validContours: Vec2[][] = [
  [[0, 0], [8, 0], [8, 6], [4, 2], [0, 6]],
  [[0, 0], [5, 0.00001], [10, 0], [10, 8], [0, 8]],
  [[900000, 900000], [900005, 900000.0625], [900010, 900000], [900010, 900008], [900000, 900008]],
  [[0, 0], [10, 0], [10, 8], [5, 8], [5, 0.00001], [4, 0.00001], [4, 8], [0, 8]],
  serpentine(30),
];
it.each(validContours.map((points, i) => ({ points, i })))('keeps Rust valid contour $i, including planes through shared boundary edges', ({ points }) => {
  expect(simplePolygon(points)).toBe(true);
  const index = new SliceIndex(prism(points));
  for (const z of [0, 50, 100]) {
    const result = index.slice(z);
    expect(result.valid).toBe(true);
    expect(result.loops).toHaveLength(1);
    expect(result.area).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  }
});

const invalidContours: Vec2[][] = [
  [[0, 0], [6, 0], [2, 0], [2, 4], [0, 4]],
  [[0, 0], [8, 0], [8, 4], [2, 4], [2, 0], [6, 0], [6, 6], [0, 6]],
  [[0, 0], [8, 0], [8, 6], [2, 6], [2, 0], [0, 6]],
  [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4], [2, 2]],
];
it.each(invalidContours.map((points, i) => ({ points, i })))('rejects Rust overlap/touch fixture $i without accepted measurements', ({ points }) => {
  expect(simplePolygon(points)).toBe(false);
  const result = new SliceIndex(prism(points)).slice(50);
  expect(result.valid).toBe(false);
  expect([result.perimeter, result.area, result.ap, result.ml]).toEqual([0, 0, 0, 0]);
  expect(result.loops.length).toBeGreaterThan(0);
});


