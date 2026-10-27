import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import * as faceCubic from '../src/trimline/face-cubic';
import { createArithmeticContext, rational, NumericsError, add, subtract, multiply, compare } from '../src/trimline/numerics';
import { sampleCubic, BezierError } from '../src/trimline/bezier';
import type { CubicApproximation, CubicControls, ExactPoint3 } from '../src/trimline/bezier';
import type { Rational } from '../src/trimline/numerics';

const context = (maxOperations = 2000000, maxBits = 4096) => createArithmeticContext({ maxBits, maxOperations });
const fixture = () => {
  const ctx = context();
  const q = (n: bigint, d = 1n) => rational(n, d, ctx);
  const triangle = [[1n, 2n, 3n], [4n, 4n, 4n], [2n, 6n, 5n]]
    .map(p => p.map(n => q(n)) as unknown as ExactPoint3) as unknown as faceCubic.ExactTriangle3;
  const weights: faceCubic.CubicBarycentricControls = [[q(1n), q(0n), q(0n)],
    [q(1n, 2n), q(1n, 3n), q(1n, 6n)], [q(1n, 6n), q(1n, 3n), q(1n, 2n)], [q(0n), q(0n), q(1n)]];
  return { ctx, q, triangle, weights };
};

// A2: coverage of forward mapping already delivered by A1 (no invented RED).
it('accepts exact edge and vertex controls', () => {
  const { ctx, q, triangle } = fixture();
  const edge: faceCubic.CubicBarycentricControls = [[q(1n), q(0n), q(0n)], [q(2n, 3n), q(1n, 3n), q(0n)],
    [q(1n, 3n), q(2n, 3n), q(0n)], [q(0n), q(1n), q(0n)]];
  expect(faceCubic.certifyFaceCubic(triangle, edge, ctx).controls).toEqual([
    triangle[0], [q(2n), q(8n, 3n), q(10n, 3n)], [q(3n), q(10n, 3n), q(11n, 3n)], triangle[1]]);
  const vertex = [edge[3], edge[3], edge[3], edge[3]] as const;
  expect(faceCubic.certifyFaceCubic(triangle, vertex, ctx).controls).toEqual([triangle[1], triangle[1], triangle[1], triangle[1]]);
});

it('rejects an exactly degenerate triangle', () => {
  const { ctx, q, triangle, weights } = fixture();
  const collinear: faceCubic.ExactTriangle3 = [[q(0n), q(0n), q(0n)], [q(1n), q(2n), q(3n)], [q(2n), q(4n), q(6n)]];
  for (const t of [[triangle[0], triangle[0], triangle[2]] as const, collinear]) {
    expect(() => faceCubic.certifyFaceCubic(t, weights, ctx)).toThrowError(
      expect.objectContaining({ name: 'FaceCubicError', code: 'DEGENERATE_TRIANGLE', message: 'DEGENERATE_TRIANGLE' }));
  }
});

// A3: exact determinant coverage of the preceding degeneracy slice.
it('accepts an exactly nondegenerate thin triangle', () => {
  const { q } = fixture();
  const t: faceCubic.ExactTriangle3 = [[q(0n), q(0n), q(0n)], [q(1n), q(0n), q(0n)], [q(1n), q(1n, 1n << 600n), q(0n)]];
  const w = Array.from({ length: 4 }, () => [q(1n), q(0n), q(0n)]) as unknown as faceCubic.CubicBarycentricControls;
  expect(faceCubic.certifyFaceCubic(t, w, context()).controls).toEqual([t[0], t[0], t[0], t[0]]);
  expect(() => faceCubic.certifyFaceCubic(t, w, context(2000000, 128))).toThrowError(
    expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
});
it('accepts XZ and YZ charts without an XY minor', () => {
  const { q, weights } = fixture();
  for (const middle of [[q(1n), q(0n), q(0n)], [q(0n), q(1n), q(0n)]] as const) {
    const t: faceCubic.ExactTriangle3 = [[q(0n), q(0n), q(0n)], middle, [q(0n), q(0n), q(1n)]];
    const result = faceCubic.certifyFaceCubic(t, weights, context());
    expect(result.controls[0]).toEqual(t[0]);
    expect(result.controls[3]).toEqual(t[2]);
    expect(result.controls[1]).toEqual(middle[0].n ? [q(1n, 3n), q(0n), q(1n, 6n)] : [q(0n), q(1n, 3n), q(1n, 6n)]);
  }
});
it('preserves world controls when B and C and their weights are swapped', () => {
  const { triangle, weights } = fixture();
  const swapped = weights.map(w => [w[0], w[2], w[1]]) as unknown as faceCubic.CubicBarycentricControls;
  expect(faceCubic.certifyFaceCubic([triangle[0], triangle[2], triangle[1]], swapped, context()).controls)
    .toEqual(faceCubic.certifyFaceCubic(triangle, weights, context()).controls);
});

it('rejects a tiny negative exact weight', () => {
  const { q, triangle, weights } = fixture();
  const denominator = 1n << 1100n;
  for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) {
    const w = weights.map(row => [...row]);
    w[i] = [q(0n), q(0n), q(0n)];
    w[i][axis] = q(-1n, denominator);
    w[i][(axis + 1) % 3] = q(denominator + 1n, denominator);
    expect(() => faceCubic.certifyFaceCubic(triangle, w as unknown as faceCubic.CubicBarycentricControls, context())).toThrowError(
      expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_BARYCENTRIC', message: 'INVALID_BARYCENTRIC' }));
  }
});

it('rejects a nonunit exact sum', () => {
  const { q, triangle, weights } = fixture();
  for (const row of [[q(1n), q(1n, 1n << 1100n), q(0n)], [q(1n, 2n), q(1n, 3n), q(1n, 7n)],
    [q(0n), q(0n), q(0n)], [q(1n), q(1n), q(0n)], [q(-1n), q(1n), q(1n)]]) {
    for (let i = 0; i < 4; i++) {
      const w = weights.map(r => [...r]);
      w[i] = row;
      expect(() => faceCubic.certifyFaceCubic(triangle, w as unknown as faceCubic.CubicBarycentricControls, context())).toThrowError(
        expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_BARYCENTRIC' }));
    }
  }
});

// A4: scalar rejection is already provided by public numeric operations; coverage.
it('does not coerce rational lookalikes', () => {
  const { triangle, weights } = fixture();
  let touched = 0;
  const fakeGetters = { get n() { touched++; throw new Error('n'); }, get d() { touched++; throw new Error('d'); },
    valueOf() { touched++; throw new Error('valueOf'); }, toString() { touched++; throw new Error('toString'); } };
  const forgeries = [undefined, null, 0, '0', 0n, { n: 0n, d: 1n }, Object.create(triangle[0][0]), fakeGetters];
  const invalid = expect.objectContaining({ name: 'NumericsError', code: 'INVALID_INPUT', message: 'INVALID_INPUT' });
  for (const fake of forgeries) for (const which of ['triangle', 'weights'] as const) {
    const source = which === 'triangle' ? triangle : weights;
    for (let row = 0; row < source.length; row++) for (let axis = 0; axis < 3; axis++) {
      const input: unknown[][] = source.map(p => [...p]);
      input[row][axis] = fake;
      expect(() => faceCubic.certifyFaceCubic(
        (which === 'triangle' ? input : triangle) as faceCubic.ExactTriangle3,
        (which === 'weights' ? input : weights) as faceCubic.CubicBarycentricControls, context())).toThrowError(invalid);
    }
  }
  expect(touched).toBe(0);
});

it('snapshots owned dense tuples without getters', () => {
  const { triangle, weights } = fixture();
  const invalid = expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_INPUT', message: 'INVALID_INPUT' });
  let touched = 0;
  const getter = () => { touched++; throw new Error('accessor'); };
  for (const which of ['triangle', 'weights'] as const) {
    const source = which === 'triangle' ? triangle : weights;
    const call = (input: unknown) => faceCubic.certifyFaceCubic(
      (which === 'triangle' ? input : triangle) as faceCubic.ExactTriangle3,
      (which === 'weights' ? input : weights) as faceCubic.CubicBarycentricControls, context());
    for (const input of [null, undefined, {}, { length: source.length }, new Float64Array(source.length), [],
      [...source, source[0]], source.slice(1), new Array(source.length)]) expect(() => call(input)).toThrowError(invalid);
    for (let row = 0; row < source.length; row++) {
      for (const bad of [null, {}, [], new Array(3), [source[0][0]], [...source[0], source[0][0]], new Float32Array(3)]) {
        const input: unknown[] = source.map(p => [...p]); input[row] = bad;
        expect(() => call(input)).toThrowError(invalid);
      }
      for (const mode of ['sparse', 'inherited', 'accessor']) {
        const root = source.map(p => [...p]);
        if (mode === 'accessor') Object.defineProperty(root, row, { get: getter });
        else { delete root[row]; if (mode === 'inherited') Object.setPrototypeOf(root, { [row]: source[row] }); }
        expect(() => call(root)).toThrowError(invalid);
        for (let axis = 0; axis < 3; axis++) {
          const input = source.map(p => [...p]);
          if (mode === 'accessor') Object.defineProperty(input[row], axis, { get: getter });
          else { delete input[row][axis]; if (mode === 'inherited') Object.setPrototypeOf(input[row], { [axis]: source[row][axis] }); }
          expect(() => call(input)).toThrowError(invalid);
        }
      }
    }
    const input = source.map(p => [...p]);
    for (const array of [input, ...input]) for (const key of ['map', 'slice', 'valueOf', 'toString', 'ignored', Symbol.iterator]) {
      Object.defineProperty(array, key, { get: getter });
    }
    expect(call(input).kind).toBe('supplied-face-cubic-hull-v1');
  }
  expect(touched).toBe(0);
});

it('returns a deeply immutable owned certificate', () => {
  const { triangle, weights } = fixture();
  const beforeT = structuredClone(triangle), beforeW = structuredClone(weights);
  const result = faceCubic.certifyFaceCubic(triangle, weights, context());
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(result);
  for (const [input, snapshot] of [[triangle, result.triangle], [weights, result.barycentricControls]] as const) {
    expect(snapshot).not.toBe(input);
    expect(Object.isFrozen(input)).toBe(false);
    input.forEach((row, i) => {
      expect(snapshot[i]).not.toBe(row);
      expect(Object.isFrozen(row)).toBe(false);
    });
  }
  expect(triangle).toEqual(beforeT); expect(weights).toEqual(beforeW);
  expect(Reflect.set(result, 'kind', 'tampered')).toBe(false);
  expect(Reflect.set(result.controls[0], '0', weights[0][0])).toBe(false);
  expect(Reflect.set(triangle[0], '0', weights[0][0])).toBe(true);
  expect(Reflect.set(weights[0], '0', triangle[1][0])).toBe(true);
  expect(result.triangle).toEqual(beforeT); expect(result.barycentricControls).toEqual(beforeW);
  expect(result.controls[0]).toEqual(beforeT[0]);
});

it('preserves phase error ownership', () => {
  const { triangle, weights, q } = fixture();
  const forged = {} as ReturnType<typeof context>;
  const invalidShape = expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_INPUT' });
  const invalidNumeric = expect.objectContaining({ name: 'NumericsError', code: 'INVALID_INPUT' });
  const degenerate: faceCubic.ExactTriangle3 = [triangle[0], triangle[0], triangle[0]];
  expect(() => faceCubic.certifyFaceCubic([] as unknown as faceCubic.ExactTriangle3, weights, forged)).toThrowError(invalidShape);
  const fakeT = triangle.map(p => [...p]); fakeT[0][0] = {} as typeof triangle[0][0];
  expect(() => faceCubic.certifyFaceCubic(fakeT as unknown as faceCubic.ExactTriangle3,
    [] as unknown as faceCubic.CubicBarycentricControls, forged)).toThrowError(invalidShape);
  for (const fakeCtx of [{}, null, undefined, Object.freeze(Object.create(null))]) {
    expect(() => faceCubic.certifyFaceCubic(triangle, weights, fakeCtx as ReturnType<typeof context>)).toThrowError(invalidNumeric);
  }
  // Every scalar, even one not needed to discover degeneracy, authenticates first.
  for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) {
    const w = weights.map(p => [...p]); w[i][axis] = { n: 0n, d: 1n };
    expect(() => faceCubic.certifyFaceCubic(degenerate, w as unknown as faceCubic.CubicBarycentricControls, context())).toThrowError(invalidNumeric);
  }
  const invalidW: faceCubic.CubicBarycentricControls = [[q(-1n), q(2n), q(0n)], weights[1], weights[2], weights[3]];
  expect(() => faceCubic.certifyFaceCubic(degenerate, invalidW, context())).toThrowError(
    expect.objectContaining({ name: 'FaceCubicError', code: 'DEGENERATE_TRIANGLE' }));
  expect(() => faceCubic.certifyFaceCubic(degenerate, invalidW, context(1))).toThrowError(
    expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
  // A later forgery must beat an earlier geometric weight violation.
  const w = invalidW.map(p => [...p]); w[3][2] = {} as typeof weights[0][0];
  expect(() => faceCubic.certifyFaceCubic(triangle, w as unknown as faceCubic.CubicBarycentricControls, context())).toThrowError(invalidNumeric);
});

// Bounded discovery, not an implementation-dependent hardcoded operation count.
const minimumOperations = (attempt: (operations: number) => unknown) => {
  let low = 1, high = 2000000;
  expect(attempt(high)).toBeDefined();
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    try { attempt(middle); high = middle; }
    catch (error) {
      expect(error).toBeInstanceOf(NumericsError);
      expect(error).toMatchObject({ code: 'BUDGET_EXCEEDED' });
      low = middle + 1;
    }
  }
  return low;
};

// A5: budget/atomic return coverage inherited from using public operations throughout.
it('shares arithmetic budget and publishes no partial result', () => {
  const { triangle, weights, q } = fixture();
  const attempt = (operations: number) => faceCubic.certifyFaceCubic(triangle, weights, context(operations));
  const minimum = minimumOperations(attempt);
  expect(attempt(minimum).controls).toHaveLength(4);
  let result: faceCubic.FaceCubicContainment | undefined;
  expect(() => { result = attempt(minimum - 1); }).toThrowError(
    expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
  expect(result).toBeUndefined();
  const ctx = context(minimum);
  const complete = faceCubic.certifyFaceCubic(triangle, weights, ctx);
  expect(() => faceCubic.certifyFaceCubic(triangle, weights, ctx)).toThrowError(NumericsError);
  expect(complete).toEqual(attempt(minimum));
  const wideT = triangle.map(p => [...p]); wideT[2][2] = q(1n << 200n);
  expect(() => faceCubic.certifyFaceCubic(wideT as unknown as faceCubic.ExactTriangle3, weights, context(2000000, 128))).toThrowError(
    expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
});

const limits = { maxDepth: 32, maxSegments: 20000, maxNodes: 40000 };
// Independent direct Bernstein polynomial evaluation, NOT another sampler.
function checkApproximation(controls: CubicControls, tolerance: Rational, result: CubicApproximation) {
  const ctx = context(), zero = rational(0n, 1n, ctx), one = rational(1n, 1n, ctx), three = rational(3n, 1n, ctx);
  const evaluate = (p: CubicControls, t: Rational) => {
    const s = subtract(one, t, ctx);
    const w = [multiply(multiply(s, s, ctx), s, ctx), multiply(three, multiply(multiply(s, s, ctx), t, ctx), ctx),
      multiply(three, multiply(multiply(s, t, ctx), t, ctx), ctx), multiply(multiply(t, t, ctx), t, ctx)];
    return [0, 1, 2].map(axis => w.reduce((sum, weight, i) => add(sum, multiply(weight, p[i][axis], ctx), ctx), zero));
  };
  expect(result.kind).toBe('cubic-parametric-bound-v1');
  expect(result.leaves.length).toBeGreaterThan(0);
  expect(result.samples).toHaveLength(result.leaves.length + 1);
  expect(result.samples[0]).toEqual({ t: zero, point: controls[0] });
  expect(result.samples.at(-1)).toEqual({ t: one, point: controls[3] });
  let end = zero, maximum = zero;
  for (const [i, leaf] of result.leaves.entries()) {
    expect(leaf.t0).toEqual(end);
    expect(compare(leaf.t0, leaf.t1, ctx)).toBe(-1);
    end = leaf.t1;
    expect(result.samples[i]).toEqual({ t: leaf.t0, point: leaf.controls[0] });
    expect(result.samples[i + 1]).toEqual({ t: leaf.t1, point: leaf.controls[3] });
    const span = subtract(leaf.t1, leaf.t0, ctx);
    // Four exact values establish identity of the cubic polynomials on each leaf.
    for (const n of [0n, 1n, 2n, 3n]) {
      const u = rational(n, 3n, ctx), t = add(leaf.t0, multiply(span, u, ctx), ctx);
      expect(evaluate(leaf.controls, u)).toEqual(evaluate(controls, t));
    }
    expect(compare(leaf.upperSquared, zero, ctx)).toBeGreaterThanOrEqual(0);
    expect(compare(leaf.upperSquared, multiply(tolerance, tolerance, ctx), ctx)).toBeLessThanOrEqual(0);
    if (compare(leaf.upperSquared, maximum, ctx) > 0) maximum = leaf.upperSquared;
  }
  for (const sample of result.samples) expect(sample.point).toEqual(evaluate(controls, sample.t));
  expect(end).toEqual(one);
  expect(compare(multiply(tolerance, tolerance, ctx), rational(1n, 40000n, ctx), ctx)).toBeLessThanOrEqual(0);
  expect(result.maxUpperSquared).toEqual(maximum);
}

// A6: integration coverage of the real existing sampler and delivered map, no fake RED.
it('composes mapped world controls with sampleCubic', () => {
  const { ctx, triangle, weights } = fixture();
  const containment = faceCubic.certifyFaceCubic(triangle, weights, ctx);
  const before = structuredClone(containment.controls);
  const tolerance = rational(1n, 200n, ctx);
  const approximation = sampleCubic(containment.controls, tolerance, limits, ctx);
  expect(containment.controls).toEqual(before);
  expect(approximation.leaves.length).toBeGreaterThan(1);
  checkApproximation(containment.controls, tolerance, approximation);
});

it('uses world metric rather than chart tolerance', () => {
  const { q, triangle } = fixture();
  const ctx = context(), h = q(1n, 1000n);
  const w: faceCubic.CubicBarycentricControls = [[q(1n), q(0n), q(0n)],
    [subtract(q(2n, 3n), h, ctx), q(1n, 3n), h], [subtract(q(1n, 3n), h, ctx), q(2n, 3n), h], [q(0n), q(1n), q(0n)]];
  const tolerance = rational(1n, 200n, ctx), cap = { maxDepth: 0, maxSegments: 1, maxNodes: 1 };
  const small = faceCubic.certifyFaceCubic(triangle, w, ctx);
  const smallResult = sampleCubic(small.controls, tolerance, cap, ctx);
  expect(smallResult.leaves).toHaveLength(1);
  expect(smallResult.maxUpperSquared).toEqual(q(21n, 1000000n));
  // Sampling the chart would incorrectly admit both scales with identical U.
  const chart = sampleCubic(w, tolerance, cap, ctx);
  expect(chart.maxUpperSquared).toEqual(q(1n, 500000n));
  const scaledT = triangle.map(p => p.map(n => multiply(n, q(1000n), ctx))) as unknown as faceCubic.ExactTriangle3;
  const large = faceCubic.certifyFaceCubic(scaledT, w, ctx);
  expect(() => sampleCubic(large.controls, tolerance, cap, ctx)).toThrowError(
    expect.objectContaining({ name: 'BezierError', code: 'BUDGET_EXCEEDED' }));
  // Exact root deviations are (1,4,2), norm-squared 21, not chart U.
  expect(subtract(large.controls[1][0], q(2000n), ctx)).toEqual(q(1n));
  expect(subtract(large.controls[1][1], q(8000n, 3n), ctx)).toEqual(q(4n));
  expect(subtract(large.controls[1][2], q(10000n, 3n), ctx)).toEqual(q(2n));
});

it('does not reset context between containment and sampling', () => {
  const { triangle, weights } = fixture();
  const attempt = (operations: number) => {
    const ctx = context(operations);
    const containment = faceCubic.certifyFaceCubic(triangle, weights, ctx);
    const tolerance = rational(1n, 200n, ctx);
    const approximation = sampleCubic(containment.controls, tolerance, limits, ctx);
    return { containment, approximation, tolerance };
  };
  const threshold = minimumOperations(attempt);
  const complete = attempt(threshold);
  expect(complete.approximation.leaves.length).toBeGreaterThan(1);
  let published: ReturnType<typeof attempt> | undefined;
  expect(() => { published = attempt(threshold - 1); }).toThrowError(
    expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
  expect(published).toBeUndefined();
  // Each component separately fits the same ceiling; cumulative work does not.
  expect(faceCubic.certifyFaceCubic(triangle, weights, context(threshold - 1))).toEqual(complete.containment);
  const fresh = context(threshold - 1);
  const tolerance = rational(1n, 200n, fresh);
  expect(sampleCubic(complete.containment.controls, tolerance, limits, fresh)).toEqual(complete.approximation);
});

it('propagates sampler refusal without partial composition', () => {
  const { triangle, weights } = fixture();
  for (const mode of ['depth', 'tolerance'] as const) {
    const ctx = context();
    let published: { containment: faceCubic.FaceCubicContainment; approximation: CubicApproximation } | undefined;
    let local: faceCubic.FaceCubicContainment | undefined;
    let caught: unknown;
    try {
      const containment = faceCubic.certifyFaceCubic(triangle, weights, ctx);
      local = containment;
      const tolerance = rational(mode === 'tolerance' ? 0n : 1n, 200n, ctx);
      const approximation = sampleCubic(containment.controls, tolerance,
        mode === 'depth' ? { maxDepth: 0, maxSegments: 1, maxNodes: 1 } : limits, ctx);
      published = { containment, approximation };
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(BezierError);
    expect(caught).toMatchObject({ name: 'BezierError', code: mode === 'depth' ? 'BUDGET_EXCEEDED' : 'INVALID_INPUT' });
    expect(local).toBeDefined();
    expect(published).toBeUndefined();
  }
});

function produceProofBundle(): { format: 'OrthoSculptFaceCubicProof'; version: 1;
  cases: { id: string; tolerance: Rational; containment: faceCubic.FaceCubicContainment; approximation: CubicApproximation }[] } {
  const { ctx, q, triangle, weights } = fixture();
  const edge: faceCubic.CubicBarycentricControls = [[q(1n), q(0n), q(0n)], [q(2n, 3n), q(1n, 3n), q(0n)],
    [q(1n, 3n), q(2n, 3n), q(0n)], [q(0n), q(1n), q(0n)]];
  const vertex = [edge[3], edge[3], edge[3], edge[3]] as const;
  const origin = [q(0n), q(0n), q(0n)] as const;
  const xz: faceCubic.ExactTriangle3 = [origin, [q(1n), q(0n), q(0n)], [q(0n), q(0n), q(1n)]];
  const yz: faceCubic.ExactTriangle3 = [origin, [q(0n), q(1n), q(0n)], [q(0n), q(0n), q(1n)]];
  const thin: faceCubic.ExactTriangle3 = [origin, [q(1n), q(0n), q(0n)], [q(1n), q(1n, 1n << 600n), q(0n)]];
  const atOrigin = [edge[0], edge[0], edge[0], edge[0]] as const;
  const inputs: { id: string; triangle: faceCubic.ExactTriangle3; weights: faceCubic.CubicBarycentricControls }[] = [
    { id: 'nonaxis-curved', triangle, weights }, { id: 'edge-linear', triangle, weights: edge },
    { id: 'vertex-constant', triangle, weights: vertex }, { id: 'xz-chart', triangle: xz, weights: edge },
    { id: 'yz-chart', triangle: yz, weights: edge }, { id: 'thin-constant', triangle: thin, weights: atOrigin }];
  // One real context throughout the complete producer; no copying/renaming results.
  const cases = inputs.map(input => {
    const containment = faceCubic.certifyFaceCubic(input.triangle, input.weights, ctx);
    const tolerance = rational(1n, 200n, ctx);
    const approximation = sampleCubic(containment.controls, tolerance, limits, ctx);
    return { id: input.id, tolerance, containment, approximation };
  });
  return { format: 'OrthoSculptFaceCubicProof', version: 1, cases };
}

function writeProofEvidence(output: string, bundle: ReturnType<typeof produceProofBundle>): void {
  expect(isAbsolute(output)).toBe(true);
  const scratch = realpathSync(resolve(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'hermes', 'cache', 'scratch'));
  const targetParent = realpathSync(dirname(output));
  const inside = relative(scratch, targetParent);
  expect(isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)).toBe(false);
  // Use the resolved parent for creation too; wx refuses existing files and links.
  const target = join(targetParent, basename(output));
  writeFileSync(target, JSON.stringify(bundle,
    (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2), { encoding: 'utf8', flag: 'wx' });
}

it('exports untouched real face cubic proofs', () => {
  let produced: ReturnType<typeof produceProofBundle> | undefined;
  expect(() => { produced = produceProofBundle(); }).not.toThrow();
  const bundle = produced!;
  expect(bundle.format).toBe('OrthoSculptFaceCubicProof');
  expect(bundle.version).toBe(1);
  expect(bundle.cases.map(c => c.id)).toEqual(['nonaxis-curved', 'edge-linear', 'vertex-constant', 'xz-chart', 'yz-chart', 'thin-constant']);
  for (const c of bundle.cases) {
    expect(Object.keys(c).sort()).toEqual(['approximation', 'containment', 'id', 'tolerance']);
    expect(Object.keys(c.containment).sort()).toEqual(['barycentricControls', 'controls', 'kind', 'triangle']);
    checkApproximation(c.containment.controls, c.tolerance, c.approximation);
  }
  const output = process.env.ORTHO_FACE_CUBIC_EVIDENCE_OUT;
  if (output === undefined) return; // No default file writes.
  writeProofEvidence(output, bundle);
  expect(existsSync(output)).toBe(true);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(JSON.parse(JSON.stringify(bundle,
    (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)));
});

it('exposes only the frozen runtime API and literal diagnostics', () => {
  expect(Object.keys(faceCubic).sort()).toEqual(['FaceCubicError', 'certifyFaceCubic']);
  for (const code of ['INVALID_INPUT', 'DEGENERATE_TRIANGLE', 'INVALID_BARYCENTRIC'] as const) {
    const error = new faceCubic.FaceCubicError(code);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FaceCubicError'); expect(error.message).toBe(code); expect(error.code).toBe(code);
  }
});

describe('v03 supplied-face cubic containment', () => {
  it('maps a non-axis triangle exactly', () => {
    expect(faceCubic.certifyFaceCubic).toBeTypeOf('function');
    const { ctx, q, triangle, weights } = fixture();
    const result = faceCubic.certifyFaceCubic(triangle, weights, ctx);
    expect(result.kind).toBe('supplied-face-cubic-hull-v1');
    expect(result.controls).toEqual([[q(1n), q(2n), q(3n)],
      [q(13n, 6n), q(10n, 3n), q(11n, 3n)], [q(5n, 2n), q(14n, 3n), q(13n, 3n)], [q(2n), q(6n), q(5n)]]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
