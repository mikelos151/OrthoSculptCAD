/** Exact hull containment in ONE supplied closed triangle; not source provenance or cut validity.
 * Nonzero 2x2 minor proves a noncollinear triangle. Nonnegative unit-sum
 * barycentrics put each mapped control in its closed convex hull. Bernstein
 * weights are themselves nonnegative and unit-sum over [0,1], so the WHOLE
 * cubic lies there, not merely sampled points. Chords between exact samples
 * also stay in that convex set; approximation bounds belong to sampleCubic.
 * Every numeric operation shares the caller's ctx; refusals never publish a
 * partial certificate. No floating geometry, projection, epsilon or coercion.
 */
import type { Rational, ArithmeticContext } from './numerics';
import { add, subtract, multiply, compare, rational } from './numerics';
import type { ExactPoint3, CubicControls } from './bezier';

export type ExactTriangle3 = readonly [ExactPoint3, ExactPoint3, ExactPoint3];
export type ExactBarycentric3 = readonly [Rational, Rational, Rational];
export type CubicBarycentricControls = readonly [
  ExactBarycentric3, ExactBarycentric3, ExactBarycentric3, ExactBarycentric3
];
export interface FaceCubicContainment {
  readonly kind: 'supplied-face-cubic-hull-v1';
  readonly triangle: ExactTriangle3;
  readonly barycentricControls: CubicBarycentricControls;
  readonly controls: CubicControls;
}
export class FaceCubicError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'DEGENERATE_TRIANGLE' | 'INVALID_BARYCENTRIC') {
    super(code);
    this.name = 'FaceCubicError';
  }
}
function ownData(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !('value' in descriptor)) throw new FaceCubicError('INVALID_INPUT');
  return descriptor.value;
}

// Only fixed dimensions are traversed. Irrelevant caller properties/methods are ignored.
function snapshotArray(input: unknown, length: number): unknown[] {
  if (!Array.isArray(input) || ownData(input, 'length') !== length) throw new FaceCubicError('INVALID_INPUT');
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) result.push(ownData(input, String(i)));
  return result;
}
function snapshotMatrix(input: unknown, rows: number): readonly ExactPoint3[] {
  const root = snapshotArray(input, rows);
  const result: ExactPoint3[] = [];
  for (let i = 0; i < rows; i++) result.push(Object.freeze(snapshotArray(root[i], 3)) as unknown as ExactPoint3);
  return Object.freeze(result);
}

export function certifyFaceCubic(
  triangle: ExactTriangle3,
  barycentricControls: CubicBarycentricControls,
  ctx: ArithmeticContext
): FaceCubicContainment {
  triangle = snapshotMatrix(triangle, 3) as unknown as ExactTriangle3;
  barycentricControls = snapshotMatrix(barycentricControls, 4) as unknown as CubicBarycentricControls;
  const zero = rational(0n, 1n, ctx);
  const one = rational(1n, 1n, ctx);
  // Authenticate ALL 21 scalars before any geometric decision or scalar property read.
  for (let i = 0; i < 3; i++) for (let axis = 0; axis < 3; axis++) compare(triangle[i][axis], zero, ctx);
  for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) compare(barycentricControls[i][axis], zero, ctx);
  const e: Rational[] = [], g: Rational[] = [];
  for (let axis = 0; axis < 3; axis++) {
    e.push(subtract(triangle[1][axis], triangle[0][axis], ctx));
    g.push(subtract(triangle[2][axis], triangle[0][axis], ctx));
  }
  let noncollinear = false;
  for (const [r, s] of [[0, 1], [0, 2], [1, 2]]) {
    const minor = subtract(multiply(e[r], g[s], ctx), multiply(e[s], g[r], ctx), ctx);
    if (compare(minor, zero, ctx) !== 0) { noncollinear = true; break; }
  }
  if (!noncollinear) throw new FaceCubicError('DEGENERATE_TRIANGLE');
  for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) {
    if (compare(barycentricControls[i][axis], zero, ctx) < 0) throw new FaceCubicError('INVALID_BARYCENTRIC');
  }
  for (let i = 0; i < 4; i++) {
    if (compare(add(add(barycentricControls[i][0], barycentricControls[i][1], ctx), barycentricControls[i][2], ctx), one, ctx) !== 0) {
      throw new FaceCubicError('INVALID_BARYCENTRIC');
    }
  }
  const controls: ExactPoint3[] = [];
  for (let i = 0; i < 4; i++) {
    const point: Rational[] = [];
    for (let axis = 0; axis < 3; axis++) {
      point.push(add(add(multiply(barycentricControls[i][0], triangle[0][axis], ctx),
        multiply(barycentricControls[i][1], triangle[1][axis], ctx), ctx),
      multiply(barycentricControls[i][2], triangle[2][axis], ctx), ctx));
    }
    controls.push(Object.freeze(point) as unknown as ExactPoint3);
  }
  return Object.freeze({ kind: 'supplied-face-cubic-hull-v1', triangle, barycentricControls,
    controls: Object.freeze(controls) as unknown as CubicControls });
}
