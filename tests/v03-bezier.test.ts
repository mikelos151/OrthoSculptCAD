import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import * as bezier from '../src/trimline/bezier';
import { add, subtract, multiply, divide, compare, createArithmeticContext, NumericsError, rational } from '../src/trimline/numerics';
import type { Rational } from '../src/trimline/numerics';
import type { CubicApproximation, CubicControls, ExactPoint3 } from '../src/trimline/bezier';

const context = () => createArithmeticContext({ maxBits: 4096, maxOperations: 2000000 });
const limits = { maxDepth: 32, maxSegments: 20000, maxNodes: 40000 };
const fixture = (coordinates: readonly (readonly [number, number, number])[]) => {
  const ctx = context();
  const controls = coordinates.map(p => p.map(n => rational(BigInt(n), 1n, ctx)) as unknown as ExactPoint3) as unknown as CubicControls;
  return { controls, tolerance: rational(1n, 200n, ctx) };
};
const linear = () => fixture([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]]);
const curved = () => {
  const ctx = context();
  const controls = [[0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]]
    .map(p => p.map(n => rational(BigInt(n), 100n, ctx)) as unknown as ExactPoint3) as unknown as CubicControls;
  return { controls, tolerance: rational(1n, 200n, ctx) };
};

const successfulInputs = () => [
  { id: 'linear', ...linear() }, { id: 'curved', ...curved() },
  { id: 'nonplanar', ...fixture([[0, 0, 0], [1, 2, 0], [2, -1, 1], [3, 0, 0]]) },
  { id: 'zerochord', ...fixture([[0, 0, 0], [1, 2, 3], [-1, 1, 2], [0, 0, 0]]) },
  { id: 'constant', ...fixture([[2, -3, 4], [2, -3, 4], [2, -3, 4], [2, -3, 4]]) },
  { id: 'negative', ...fixture([[-4, -1, -2], [-3, -3, -1], [-2, -2, -4], [-1, -4, -3]]) },
];

// Exact polynomial evaluation, not production de Casteljau. Equality at four
// distinct u values proves equality of two degree-at-most-three polynomials.
function checkCertificate(controls: CubicControls, tolerance: Rational, result: CubicApproximation) {
  const ctx = context();
  const zero = rational(0n, 1n, ctx);
  const one = rational(1n, 1n, ctx);
  const three = rational(3n, 1n, ctx);
  const evaluate = (p: CubicControls, t: Rational): ExactPoint3 => {
    const s = subtract(one, t, ctx);
    const weights = [multiply(multiply(s, s, ctx), s, ctx),
      multiply(three, multiply(multiply(s, s, ctx), t, ctx), ctx),
      multiply(three, multiply(multiply(s, t, ctx), t, ctx), ctx),
      multiply(multiply(t, t, ctx), t, ctx)];
    return [0, 1, 2].map(axis => weights.reduce((sum, w, i) =>
      add(sum, multiply(w, p[i][axis], ctx), ctx), zero)) as unknown as ExactPoint3;
  };
  expect(result.leaves.length).toBeGreaterThan(0);
  expect(result.samples).toHaveLength(result.leaves.length + 1);
  let end = zero;
  let maximum = zero;
  result.leaves.forEach((leaf, index) => {
    expect(leaf.t0).toEqual(end);
    expect(compare(leaf.t0, leaf.t1, ctx)).toBe(-1);
    end = leaf.t1;
    expect(result.samples[index].t).toEqual(leaf.t0);
    expect(result.samples[index].point).toBe(leaf.controls[0]);
    expect(result.samples[index + 1].point).toBe(leaf.controls[3]);
    if (index) expect(result.leaves[index - 1].controls[3]).toBe(leaf.controls[0]);
    const span = subtract(leaf.t1, leaf.t0, ctx);
    for (const n of [0n, 1n, 2n, 3n]) {
      const u = rational(n, 3n, ctx);
      const t = add(leaf.t0, multiply(span, u, ctx), ctx);
      expect(evaluate(leaf.controls, u)).toEqual(evaluate(controls, t));
    }
    const norms = [1, 2].map(i => [0, 1, 2].reduce((sum, axis) => {
      const chord = divide(add(multiply(rational(BigInt(3 - i), 1n, ctx), leaf.controls[0][axis], ctx),
        multiply(rational(BigInt(i), 1n, ctx), leaf.controls[3][axis], ctx), ctx), three, ctx);
      const d = subtract(leaf.controls[i][axis], chord, ctx);
      return add(sum, multiply(d, d, ctx), ctx);
    }, zero));
    expect(leaf.upperSquared).toEqual(compare(norms[0], norms[1], ctx) >= 0 ? norms[0] : norms[1]);
    expect(compare(leaf.upperSquared, zero, ctx)).toBeGreaterThanOrEqual(0);
    expect(compare(leaf.upperSquared, multiply(tolerance, tolerance, ctx), ctx)).toBeLessThanOrEqual(0);
    if (compare(leaf.upperSquared, maximum, ctx) > 0) maximum = leaf.upperSquared;
  });
  expect(end).toEqual(one);
  expect(result.samples.at(-1)?.t).toEqual(one);
  expect(result.maxUpperSquared).toEqual(maximum);
}

describe('v03 certified cubic approximation', () => {
  // Additional exact-boundary coverage of the existing comparison behavior.
  it('accepts U equal to tolerance squared but rejects an arbitrarily small excess', () => {
    const ctx = context();
    const tolerance = rational(1n, 200n, ctx);
    const z = rational(0n, 1n, ctx);
    const controls: CubicControls = [[z, z, z], [rational(1n, 1n, ctx), tolerance, z],
      [rational(2n, 1n, ctx), tolerance, z], [rational(3n, 1n, ctx), z, z]];
    const cap = { maxDepth: 0, maxSegments: 1, maxNodes: 1 };
    const result = bezier.sampleCubic(controls, tolerance, cap, context());
    expect(result.leaves).toHaveLength(1);
    expect(result.maxUpperSquared).toEqual(multiply(tolerance, tolerance, ctx));
    const excess = controls.map(point => [...point]);
    excess[1][1] = add(tolerance, rational(1n, 1n << 300n, ctx), ctx);
    expect(() => bezier.sampleCubic(excess as unknown as CubicControls, tolerance, cap, context())).toThrowError(
      expect.objectContaining({ name: 'BezierError', code: 'BUDGET_EXCEEDED' }));
  });
  it('exports real synthetic sampleCubic results only to an explicitly requested scratch file', () => {
    const cases = successfulInputs().map(({ id, controls, tolerance }) => {
      const result = bezier.sampleCubic(controls, tolerance, limits, context());
      checkCertificate(controls, tolerance, result);
      return { id, input: { controls, tolerance }, result };
    });
    const bundle = { format: 'OrthoSculptBezierProof', version: 1, cases };
    const output = process.env.ORTHO_BEZIER_EVIDENCE_OUT;
    if (output === undefined) return; // Default test execution performs no file writes.
    expect(isAbsolute(output)).toBe(true);
    const scratch = realpathSync(resolve(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'hermes', 'cache', 'scratch'));
    const targetParent = realpathSync(dirname(output));
    const inside = relative(scratch, targetParent);
    expect(isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)).toBe(false);
    // Exclusive creation preserves earlier evidence and refuses existing links/files.
    writeFileSync(output, JSON.stringify(bundle, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2),
      { encoding: 'utf8', flag: 'wx' });
    expect(existsSync(output)).toBe(true);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(bundle, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)));
  });
  it('refuses pending-node leaf deficits before doing any extra split arithmetic', () => {
    const { controls } = curved();
    const tolerance = rational(1n, 1000n, context());
    const refusalCost = (cap: bezier.BezierLimits) => {
      let low = 1, high = 2000000;
      while (low < high) {
        const operations = Math.floor((low + high) / 2);
        try {
          bezier.sampleCubic(controls, tolerance, cap, createArithmeticContext({ maxBits: 4096, maxOperations: operations }));
          throw new Error('expected refusal');
        } catch (error) {
          if (error instanceof bezier.BezierError) { expect(error.code).toBe('BUDGET_EXCEEDED'); high = operations; }
          else { expect(error).toBeInstanceOf(NumericsError); expect(error).toMatchObject({ code: 'BUDGET_EXCEEDED' }); low = operations + 1; }
        }
      }
      return low;
    };
    const atDepth = refusalCost({ ...limits, maxDepth: 1 });
    expect(refusalCost({ ...limits, maxSegments: 2 })).toBe(atDepth);
    expect(refusalCost({ ...limits, maxNodes: 3 })).toBe(atDepth);
    expect(bezier.sampleCubic(controls, tolerance, { maxDepth: 2, maxSegments: 4, maxNodes: 7 }, context()).leaves).toHaveLength(4);
  });
  it('honors exact adaptive tree limits and refuses each one-short boundary', () => {
    const { controls, tolerance } = successfulInputs().find(c => c.id === 'nonplanar')!;
    const reference = bezier.sampleCubic(controls, tolerance, limits, context());
    const ctx = context();
    const depth = Math.max(...reference.leaves.map(leaf => {
      const span = subtract(leaf.t1, leaf.t0, ctx);
      expect(span.n).toBe(1n);
      return span.d.toString(2).length - 1;
    }));
    const cap = { maxDepth: depth, maxSegments: reference.leaves.length, maxNodes: 2 * reference.leaves.length - 1 };
    expect(bezier.sampleCubic(controls, tolerance, cap, context())).toEqual(reference);
    for (const key of ['maxDepth', 'maxSegments', 'maxNodes'] as const) {
      expect(() => bezier.sampleCubic(controls, tolerance, { ...cap, [key]: cap[key] - 1 }, context())).toThrowError(
        expect.objectContaining({ name: 'BezierError', code: 'BUDGET_EXCEEDED' }));
    }
  });
  it('decides subdivision below Float64 underflow using exact rational comparisons', () => {
    const ctx = context();
    const tiny = rational(1n, 1n << 600n, ctx);
    const y = multiply(rational(2n, 1n, ctx), tiny, ctx);
    const z = rational(0n, 1n, ctx);
    const controls: CubicControls = [[z, z, z], [rational(1n, 1n, ctx), y, z],
      [rational(2n, 1n, ctx), y, z], [rational(3n, 1n, ctx), z, z]];
    const result = bezier.sampleCubic(controls, tiny, limits, context());
    expect(result.leaves).toHaveLength(2);
    checkCertificate(controls, tiny, result);
  });
  it('preserves authentic NumericsError for forged values and contexts without reading accessors', () => {
    const { controls, tolerance } = linear();
    const invalid = expect.objectContaining({ name: 'NumericsError', code: 'INVALID_INPUT' });
    let touched = 0;
    const getter = { get n() { touched++; throw new Error('n'); }, get d() { touched++; throw new Error('d'); } };
    const forgeries = [undefined, null, 1, 1n, { n: 0n, d: 1n }, { ...controls[0][0] },
      Object.create(controls[0][0]), Object.freeze({ n: 0n, d: 1n }), getter];
    for (const fake of forgeries) {
      expect(() => bezier.sampleCubic(controls, fake as Rational, limits, context())).toThrowError(invalid);
      for (let p = 0; p < 4; p++) for (let axis = 0; axis < 3; axis++) {
        const malformed = controls.map(point => [...point]);
        malformed[p][axis] = fake as Rational;
        expect(() => bezier.sampleCubic(malformed as unknown as CubicControls, tolerance, limits, context())).toThrowError(invalid);
      }
    }
    for (const fake of [{}, Object.freeze(Object.create(null)), undefined, null]) {
      expect(() => bezier.sampleCubic(controls, tolerance, limits, fake as ReturnType<typeof context>)).toThrowError(invalid);
    }
    expect(touched).toBe(0);
    expect(() => bezier.sampleCubic(controls, getter as unknown as Rational, limits, context())).toThrowError(NumericsError);
  });
  it('uses one cumulative arithmetic context and never publishes a partial certificate on exhaustion', () => {
    const { controls, tolerance } = curved();
    const attempt = (operations: number) => {
      const ctx = createArithmeticContext({ maxBits: 4096, maxOperations: operations });
      return bezier.sampleCubic(controls, tolerance, limits, ctx);
    };
    let low = 1, high = 2000000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      try { attempt(middle); high = middle; }
      catch (error) { expect(error).toBeInstanceOf(NumericsError); expect(error).toMatchObject({ code: 'BUDGET_EXCEEDED' }); low = middle + 1; }
    }
    expect(attempt(low).leaves).toHaveLength(2);
    expect(() => attempt(low - 1)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
    const ctx = createArithmeticContext({ maxBits: 4096, maxOperations: low });
    const completed = bezier.sampleCubic(controls, tolerance, limits, ctx);
    expect(() => bezier.sampleCubic(controls, tolerance, limits, ctx)).toThrowError(NumericsError);
    expect(completed.leaves).toHaveLength(2);
    let result: CubicApproximation | undefined;
    expect(() => { result = attempt(low - 1); }).toThrowError(NumericsError);
    expect(result).toBeUndefined();
    const wide = fixture([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]]);
    const mutable = wide.controls.map(point => [...point]);
    mutable[3][2] = rational(1n << 100n, 1n, context());
    expect(() => bezier.sampleCubic(mutable as unknown as CubicControls, wide.tolerance, limits,
      createArithmeticContext({ maxBits: 64, maxOperations: 2000000 }))).toThrowError(
      expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
  });
  it('returns a deeply immutable certificate without freezing or changing caller arrays', () => {
    for (const { controls, tolerance } of [linear(), curved()]) {
      const before = structuredClone(controls);
      const result = bezier.sampleCubic(controls, tolerance, limits, context());
      const visit = (value: unknown): void => {
        if (typeof value !== 'object' || value === null) return;
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) visit(child);
      };
      visit(result);
      expect(controls).toEqual(before);
      expect(Object.isFrozen(controls)).toBe(false);
      for (const point of controls) expect(Object.isFrozen(point)).toBe(false);
      expect(Reflect.set(result, 'kind', 'tampered')).toBe(false);
      expect(Reflect.set(result.leaves[0].controls[0], '0', controls[3][0])).toBe(false);
    }
  });
  it('snapshots only dense owned coordinate arrays without invoking getters or custom maps', () => {
    const { controls, tolerance } = linear();
    const call = (input: unknown) => bezier.sampleCubic(input as CubicControls, tolerance, limits, context());
    const invalid = expect.objectContaining({ name: 'BezierError', code: 'INVALID_INPUT' });
    for (const input of [null, {}, { ...controls, length: 4 }, [], [...controls, controls[0]],
      new Array(4), [controls[0], controls[1], controls[2]],
      [[], controls[1], controls[2], controls[3]],
      [[...controls[0], controls[0][0]], controls[1], controls[2], controls[3]],
      [new Array(3), controls[1], controls[2], controls[3]],
    ]) expect(() => call(input)).toThrowError(invalid);
    let touched = 0;
    const getterRoot = [...controls];
    Object.defineProperty(getterRoot, '0', { get() { touched++; throw new Error('getter'); } });
    const getterPoint = [...controls[0]];
    Object.defineProperty(getterPoint, '2', { get() { touched++; throw new Error('getter'); } });
    expect(() => call(getterRoot)).toThrowError(invalid);
    expect(() => call([getterPoint, ...controls.slice(1)])).toThrowError(invalid);
    const inherited = [...controls];
    delete inherited[0];
    Object.setPrototypeOf(inherited, { 0: controls[0] });
    expect(() => call(inherited)).toThrowError(invalid);
    const input = controls.map(p => [...p]);
    for (const array of [input, ...input]) {
      Object.defineProperty(array, 'map', { get() { touched++; throw new Error('map'); } });
      Object.defineProperty(array, Symbol.iterator, { get() { touched++; throw new Error('iterator'); } });
    }
    const result = call(input);
    expect(touched).toBe(0);
    expect(result.leaves[0].controls).not.toBe(input);
    expect(result.leaves[0].controls[0]).not.toBe(input[0]);
    const saved = result.samples[0].point[0];
    input[0][0] = controls[3][0];
    expect(result.samples[0].point[0]).toBe(saved);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input[0])).toBe(false);
  });
  it('accepts only positive computational tolerance at most 1/200 mm', () => {
    const { controls } = linear();
    const ctx = context();
    for (const tolerance of [rational(0n, 1n, ctx), rational(-1n, 200n, ctx), rational(1n, 199n, ctx)]) {
      expect(() => bezier.sampleCubic(controls, tolerance, limits, context())).toThrowError(
        expect.objectContaining({ name: 'BezierError', code: 'INVALID_INPUT' }));
    }
    for (const tolerance of [rational(1n, 200n, ctx), rational(1n, 201n, ctx), rational(1n, 1n << 300n, ctx)]) {
      expect(bezier.sampleCubic(controls, tolerance, limits, context()).leaves).toHaveLength(1);
    }
  });
  it('validates owned finite integer subdivision limits without getters or coercion', () => {
    const { controls, tolerance } = linear();
    const invalid = expect.objectContaining({ name: 'BezierError', code: 'INVALID_INPUT', message: 'INVALID_INPUT' });
    const call = (cap: unknown) => bezier.sampleCubic(controls, tolerance, cap as bezier.BezierLimits, context());
    for (const cap of [null, undefined, {}, Object.create(limits),
      ...(['maxDepth', 'maxSegments', 'maxNodes'] as const).flatMap(key =>
        [NaN, Infinity, 1.5, '1', 1n, null, {}, -1,
          key === 'maxDepth' ? 33 : key === 'maxSegments' ? 20001 : 40001,
          ...(key === 'maxDepth' ? [] : [0])].map(value => ({ ...limits, [key]: value }))),
    ]) expect(() => call(cap)).toThrowError(invalid);
    let touched = 0;
    const cap = { ...limits };
    Object.defineProperty(cap, 'maxDepth', { get() { touched++; throw new Error('getter'); } });
    expect(() => call(cap)).toThrowError(invalid);
    const coercible = { valueOf() { touched++; return 1; } };
    expect(() => call({ ...limits, maxDepth: coercible })).toThrowError(invalid);
    expect(touched).toBe(0);
    expect(call(limits).leaves).toHaveLength(1);
  });
  it('accounts root depth and both children before allocating a required split', () => {
    const { controls, tolerance } = curved();
    expect(bezier.sampleCubic(controls, tolerance, { maxDepth: 1, maxSegments: 2, maxNodes: 3 }, context()).leaves).toHaveLength(2);
    const flat = linear();
    expect(bezier.sampleCubic(flat.controls, flat.tolerance, { maxDepth: 0, maxSegments: 1, maxNodes: 1 }, context()).leaves).toHaveLength(1);
    for (const cap of [
      { maxDepth: 0, maxSegments: 2, maxNodes: 3 },
      { maxDepth: 1, maxSegments: 1, maxNodes: 3 },
      { maxDepth: 1, maxSegments: 2, maxNodes: 2 },
      { maxDepth: 1, maxSegments: 2, maxNodes: 1 },
    ]) {
      expect(() => bezier.sampleCubic(controls, tolerance, cap, context())).toThrowError(
        expect.objectContaining({ name: 'BezierError', code: 'BUDGET_EXCEEDED', message: 'BUDGET_EXCEEDED' }));
    }
  });
  // Coverage of behavior already implemented by the adaptive slice; no invented RED.
  it.each(successfulInputs())('certifies $id synthetic geometry without claiming cut validity', ({ controls, tolerance }) => {
    const result = bezier.sampleCubic(controls, tolerance, limits, context());
    checkCertificate(controls, tolerance, result);
  });
  it('does not mistake collinearity for matched-parameter linearity', () => {
    const { controls, tolerance } = fixture([[0, 0, 0], [0, 0, 0], [0, 0, 0], [3, 0, 0]]);
    const result = bezier.sampleCubic(controls, tolerance, limits, context());
    expect(result.leaves.length).toBeGreaterThan(1);
    checkCertificate(controls, tolerance, result);
  });
  it('certifies a parametrically linear 3D cubic with one zero-bound leaf', () => {
    expect(bezier.sampleCubic).toBeTypeOf('function');
    const { controls, tolerance } = linear();
    const result = bezier.sampleCubic(controls, tolerance, limits, context());
    expect(result.kind).toBe('cubic-parametric-bound-v1');
    expect(result.leaves).toEqual([{ t0: { n: 0n, d: 1n }, t1: { n: 1n, d: 1n }, controls, upperSquared: { n: 0n, d: 1n } }]);
    expect(result.samples).toEqual([{ t: { n: 0n, d: 1n }, point: controls[0] }, { t: { n: 1n, d: 1n }, point: controls[3] }]);
    expect(result.maxUpperSquared).toEqual({ n: 0n, d: 1n });
  });
  it('splits a curved cubic exactly at a single shared de Casteljau midpoint', () => {
    const { controls, tolerance } = curved();
    const result = bezier.sampleCubic(controls, tolerance, limits, context());
    expect(result.leaves).toHaveLength(2);
    const [left, right] = result.leaves;
    const ctx = context();
    const p = (x: bigint, y: bigint) => [rational(x, 400n, ctx), rational(y, 400n, ctx), rational(0n, 1n, ctx)];
    expect(left.controls).toEqual([p(0n, 0n), p(2n, 2n), p(4n, 3n), p(6n, 3n)]);
    expect(right.controls).toEqual([p(6n, 3n), p(8n, 3n), p(10n, 2n), p(12n, 0n)]);
    expect(left.controls[3]).toBe(right.controls[0]);
    expect(left.t1).toBe(right.t0);
    expect(result.samples).toEqual([
      { t: { n: 0n, d: 1n }, point: controls[0] },
      { t: { n: 1n, d: 2n }, point: p(6n, 3n) },
      { t: { n: 1n, d: 1n }, point: controls[3] },
    ]);
    expect(result.samples[1].point).toBe(left.controls[3]);
    expect(left.upperSquared).toEqual({ n: 1n, d: 160000n });
    expect(right.upperSquared).toEqual(left.upperSquared);
    expect(result.maxUpperSquared).toEqual(left.upperSquared);
  });
});
