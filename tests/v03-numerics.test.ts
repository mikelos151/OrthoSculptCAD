import { describe, expect, it } from 'vitest';
import * as numerics from '../src/trimline/numerics';

describe('v03 bounded exact numerics', () => {
  it('constructs a normalized rational', () => {
    const api = numerics;
    expect(api.createArithmeticContext).toBeTypeOf('function');
    expect(api.rational).toBeTypeOf('function');
    const ctx = api.createArithmeticContext({ maxBits: 256, maxOperations: 10000 });
    expect(api.rational(-6n, -8n, ctx)).toEqual({ n: 3n, d: 4n });
  });
  it('rejects malformed fractions and canonicalizes zero without coercion', () => {
    const ctx = numerics.createArithmeticContext({ maxBits: 256, maxOperations: 10000 });
    expect(numerics.rational(0n, -8n, ctx)).toEqual({ n: 0n, d: 1n });
    expect(numerics.rational(-6n, 8n, ctx)).toEqual({ n: -3n, d: 4n });
    for (const [n, d] of [[1n, 0n], [1, 2n], ['1', 2n], [1n, 2], [Object(1n), 2n], [null, 2n]]) {
      expect(() => numerics.rational(n as bigint, d as bigint, ctx)).toThrowError(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
    }
  });
  it('performs the four exact operations and comparison on normalized rationals', () => {
    const api = numerics;
    for (const name of ['add', 'subtract', 'multiply', 'divide', 'compare'] as const) {
      expect(api[name]).toBeTypeOf('function');
    }
    const ctx = numerics.createArithmeticContext({ maxBits: 256, maxOperations: 10000 });
    const a = numerics.rational(-2n, 3n, ctx);
    const b = numerics.rational(5n, 7n, ctx);
    expect(api.add(a, b, ctx)).toEqual({ n: 1n, d: 21n });
    expect(api.subtract(a, b, ctx)).toEqual({ n: -29n, d: 21n });
    expect(api.multiply(a, b, ctx)).toEqual({ n: -10n, d: 21n });
    expect(api.divide(a, b, ctx)).toEqual({ n: -14n, d: 15n });
    expect(api.compare(a, b, ctx)).toBe(-1);
    expect(api.compare(b, a, ctx)).toBe(1);
    expect(api.compare(a, numerics.rational(-4n, 6n, ctx), ctx)).toBe(0);
    expect(api.subtract(a, a, ctx)).toEqual({ n: 0n, d: 1n });
    expect(() => api.divide(a, numerics.rational(0n, 1n, ctx), ctx)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
  it('owns immutable limits and charges cumulative primitive work before arithmetic', () => {
    const invalid = expect.objectContaining({ code: 'INVALID_INPUT' });
    const budget = expect.objectContaining({ code: 'BUDGET_EXCEEDED' });
    for (const limits of [null, {}, { maxBits: 0, maxOperations: 1 },
      { maxBits: 4097, maxOperations: 1 }, { maxBits: 1.5, maxOperations: 1 },
      { maxBits: 32, maxOperations: 2000001 }, { maxBits: 32, maxOperations: NaN },
      { maxBits: 32, maxOperations: '100' }, { maxBits: 32, maxOperations: 0 }]) {
      expect(() => numerics.createArithmeticContext(limits as numerics.ArithmeticLimits)).toThrowError(invalid);
    }
    const limits = { maxBits: 8, maxOperations: 10000 };
    const ctx = numerics.createArithmeticContext(limits);
    limits.maxBits = 4096;
    expect(numerics.rational(255n, 1n, ctx).n).toBe(255n);
    expect(() => numerics.rational(256n, 1n, ctx)).toThrowError(budget);
    expect(() => numerics.rational(-(1n << 100000n), 1n, ctx)).toThrowError(budget);
    const a = numerics.rational(128n, 1n, ctx);
    const two = numerics.rational(2n, 1n, ctx);
    expect(() => numerics.multiply(a, two, ctx)).toThrowError(budget);
    expect(() => numerics.add(a, a, ctx)).toThrowError(budget);
    expect(() => numerics.rational(1n, 1n,
      numerics.createArithmeticContext({ maxBits: 8, maxOperations: 1 }))).toThrowError(budget);
    let firstSuccess = 0;
    for (let operations = 1; operations < 256; operations++) {
      const trial = numerics.createArithmeticContext({ maxBits: 8, maxOperations: operations });
      try { numerics.rational(3n, 5n, trial); firstSuccess = operations; break; }
      catch (error) { expect(error).toMatchObject({ code: 'BUDGET_EXCEEDED' }); }
    }
    expect(firstSuccess).toBeGreaterThan(1);
    expect(firstSuccess).toBeLessThan(256);
    const exact = numerics.createArithmeticContext({ maxBits: 8, maxOperations: firstSuccess });
    expect(numerics.rational(3n, 5n, exact)).toEqual({ n: 3n, d: 5n });
    expect(() => numerics.rational(0n, 1n, exact)).toThrowError(budget);
    expect(numerics.rational(1n, 1n,
      numerics.createArithmeticContext({ maxBits: 4096, maxOperations: 2000000 }))).toEqual({ n: 1n, d: 1n });
  });
  it('rejects forged contexts/fractions without invoking accessors and freezes owned values', () => {
    const invalid = expect.objectContaining({ code: 'INVALID_INPUT' });
    const ctx = numerics.createArithmeticContext({ maxBits: 256, maxOperations: 10000 });
    const value = numerics.rational(3n, 5n, ctx);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Reflect.set(value, 'n', 9n)).toBe(false);
    expect(Reflect.set(value, 'd', 0n)).toBe(false);
    expect(Reflect.set(ctx, 'remaining', 2000000)).toBe(false);
    let reads = 0;
    const accessor = { get n() { reads++; return 1n; }, get d() { reads++; return 1n; } };
    const fakeValues = [null, {}, { n: 1n, d: 1n }, { n: 2n, d: 0n },
      { n: 1, d: 1n }, { ...value }, Object.create(value), new Proxy(value, {}), accessor];
    for (const operation of [numerics.add, numerics.subtract, numerics.multiply, numerics.divide, numerics.compare]) {
      for (const fake of fakeValues) {
        expect(() => operation(fake as numerics.Rational, value, ctx)).toThrowError(invalid);
        expect(() => operation(value, fake as numerics.Rational, ctx)).toThrowError(invalid);
      }
    }
    for (const fake of [null, {}, { ...ctx }, Object.create(ctx), new Proxy(ctx, {})]) {
      expect(() => numerics.rational(1n, 1n, fake as numerics.ArithmeticContext)).toThrowError(invalid);
      expect(() => numerics.compare(value, value, fake as numerics.ArithmeticContext)).toThrowError(invalid);
    }
    const changingLimits = { get maxBits() { reads++; return 4096; }, maxOperations: 10000 };
    expect(() => numerics.createArithmeticContext(changingLimits)).toThrowError(invalid);
    expect(reads).toBe(0);
    const small = numerics.createArithmeticContext({ maxBits: 2, maxOperations: 10000 });
    expect(() => numerics.compare(value, value, small)).toThrowError(
      expect.objectContaining({ code: 'BUDGET_EXCEEDED' }),
    );
    expect(numerics.add(value, value, ctx)).toEqual({ n: 6n, d: 5n });
  });
  it('decodes finite Float32 bits exactly and rejects malformed/nonfinite inputs before coercion', () => {
    const api = numerics;
    expect(api.fromFloat32Bits).toBeTypeOf('function');
    const ctx = numerics.createArithmeticContext({ maxBits: 256, maxOperations: 10000 });
    const cases: [number, bigint, bigint][] = [
      [0, 0n, 1n], [0x80000000, 0n, 1n], [0x3f800000, 1n, 1n],
      [0xbf800000, -1n, 1n], [0x3fc00000, 3n, 2n],
      [1, 1n, 1n << 149n], [0x80000001, -1n, 1n << 149n],
      [0x007fffff, (1n << 23n) - 1n, 1n << 149n],
      [0x00800000, 1n, 1n << 126n], [0x80800000, -1n, 1n << 126n],
      [0x7f7fffff, ((1n << 24n) - 1n) << 104n, 1n],
      [0xff7fffff, -(((1n << 24n) - 1n) << 104n), 1n],
    ];
    for (const [bits, n, d] of cases) {
      const value = api.fromFloat32Bits!(bits, ctx);
      expect(value).toEqual({ n, d });
      expect(Object.isFrozen(value)).toBe(true);
    }
    let coercions = 0;
    const coercible = { valueOf() { coercions++; return 1; } };
    for (const bits of [-1, 0x100000000, 0.5, NaN, Infinity, '1', 1n, null,
      coercible, 0x7f800000, 0xff800000, 0x7fc00001, 0xff800001]) {
      expect(() => api.fromFloat32Bits!(bits as number, ctx)).toThrowError(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
    }
    expect(coercions).toBe(0);
    expect(() => api.fromFloat32Bits!(1,
      numerics.createArithmeticContext({ maxBits: 149, maxOperations: 10000 }))).toThrowError(
      expect.objectContaining({ code: 'BUDGET_EXCEEDED' }),
    );
    expect(() => api.fromFloat32Bits!(1,
      numerics.createArithmeticContext({ maxBits: 256, maxOperations: 1 }))).toThrowError(
      expect.objectContaining({ code: 'BUDGET_EXCEEDED' }),
    );
    expect(() => api.fromFloat32Bits!(1, {} as numerics.ArithmeticContext)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
  it('rounds directly once: 1 + 2^-24 + 2^-200 is above the Float32 midpoint', () => {
    const api = numerics;
    expect(api.toFloat32Bits).toBeTypeOf('function');
    const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
    const n = (1n << 200n) + (1n << 176n) + 1n;
    const d = 1n << 200n;
    const value = numerics.rational(n, d, ctx);
    expect(api.toFloat32Bits!(value, ctx)).toBe(0x3f800001);
    const viaFloat64 = new DataView(new ArrayBuffer(4));
    viaFloat64.setFloat32(0, Number(n) / Number(d), false);
    expect(viaFloat64.getUint32(0, false)).toBe(0x3f800000);
  });
  it('rounds zero/subnormal/min-normal boundaries with ties-even and preserves negative underflow zero', () => {
    const cases: [bigint, bigint, number][] = [
      [0n, 1n, 0], [1n, 1n << 151n, 0], [1n, 1n << 150n, 0],
      [1n, 1n << 149n, 1], [3n, 1n << 150n, 2], [5n, 1n << 150n, 2],
      [(1n << 24n) - 2n, 1n << 150n, 0x007fffff],
      [(1n << 24n) - 1n, 1n << 150n, 0x00800000],
      [1n, 1n << 126n, 0x00800000],
      // Values on either side of the two transition midpoints, not Float64 approximations.
      [(1n << 50n) - 1n, 1n << 200n, 0],
      [(1n << 50n) + 1n, 1n << 200n, 1],
      [((1n << 24n) - 1n) * (1n << 50n) - 1n, 1n << 200n, 0x007fffff],
      [((1n << 24n) - 1n) * (1n << 50n) + 1n, 1n << 200n, 0x00800000],
    ];
    for (const [n, d, bits] of cases) {
      for (const sign of [1n, -1n]) {
        const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
        const result = numerics.toFloat32Bits(numerics.rational(sign * n, d, ctx), ctx);
        expect(result).toBe(bits + (sign < 0n && n !== 0n ? 0x80000000 : 0));
        expect(Number.isInteger(result) && result >= 0 && result <= 0xffffffff).toBe(true);
        expect((result >>> 23) & 0xff).not.toBe(255);
      }
    }
  });
  it('uses even mantissas at normal binades and rejects the exact overflow threshold', () => {
    const threshold = ((1n << 25n) - 1n) << 103n;
    const maxFinite = ((1n << 24n) - 1n) << 104n;
    const cases: [bigint, bigint, number][] = [
      [(1n << 24n) + 1n, 1n << 24n, 0x3f800000],
      [(1n << 24n) + 3n, 1n << 24n, 0x3f800002],
      [(1n << 25n) - 1n, 1n << 24n, 0x40000000],
      [1n, 3n, 0x3eaaaaab], [2n, 3n, 0x3f2aaaab],
      [maxFinite, 1n, 0x7f7fffff], [maxFinite + (1n << 102n), 1n, 0x7f7fffff],
      [threshold - 1n, 1n, 0x7f7fffff],
    ];
    for (const sign of [1n, -1n]) {
      for (const [n, d, expected] of cases) {
        const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
        expect(numerics.toFloat32Bits(numerics.rational(sign * n, d, ctx), ctx))
          .toBe(expected + (sign < 0n ? 0x80000000 : 0));
      }
      for (const n of [threshold, threshold + 1n, 1n << 128n, 1n << 1000n]) {
        const ctx = numerics.createArithmeticContext({ maxBits: 2048, maxOperations: 10000 });
        expect(() => numerics.toFloat32Bits(numerics.rational(sign * n, 1n, ctx), ctx)).toThrowError(
          expect.objectContaining({ code: 'FLOAT32_OVERFLOW' }),
        );
      }
    }
  });
  it('covers cumulative rounding budgets, hostile values and hard raw/intermediate size boundaries', () => {
    const budgetError = expect.objectContaining({ code: 'BUDGET_EXCEEDED' });
    const invalid = expect.objectContaining({ code: 'INVALID_INPUT' });
    const large = numerics.createArithmeticContext({ maxBits: 4096, maxOperations: 10000 });
    expect(numerics.rational((1n << 4096n) - 1n, 1n, large).n).toBe((1n << 4096n) - 1n);
    expect(() => numerics.rational(1n << 4096n, 1n << 4096n, large)).toThrowError(budgetError);
    expect(numerics.toFloat32Bits(numerics.rational(-1n, 1n << 4095n, large), large)).toBe(0x80000000);
    // Refuse before a 4096-bit value is shifted by a mantissa's worth of bits.
    const nearOne = numerics.rational((1n << 4095n) + 1n, 1n << 4095n, large);
    expect(() => numerics.toFloat32Bits(nearOne, large)).toThrowError(budgetError);
    const fibCtx = numerics.createArithmeticContext({ maxBits: 1024, maxOperations: 40 });
    let f = 1n; let g = 1n;
    for (let i = 0; i < 100; i++) [f, g] = [g, f + g];
    expect(() => numerics.rational(f, g, fibCtx)).toThrowError(budgetError);
    expect(() => numerics.rational(0n, 1n, fibCtx)).toThrowError(budgetError);
    const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
    const value = numerics.rational(1n, 3n, ctx);
    let reads = 0;
    const accessor = { get n() { reads++; return 1n; }, d: 1n };
    for (const fake of [null, { n: 1n, d: 1n }, { ...value }, accessor, new Proxy(value, {})]) {
      expect(() => numerics.toFloat32Bits(fake as numerics.Rational, ctx)).toThrowError(invalid);
    }
    expect(reads).toBe(0);
    expect(() => numerics.toFloat32Bits(value, {} as numerics.ArithmeticContext)).toThrowError(invalid);
    let firstSuccess = 0;
    for (let maxOperations = 1; maxOperations < 256; maxOperations++) {
      const trial = numerics.createArithmeticContext({ maxBits: 512, maxOperations });
      try { numerics.toFloat32Bits(value, trial); firstSuccess = maxOperations; break; }
      catch (error) { expect(error).toMatchObject({ code: 'BUDGET_EXCEEDED' }); }
    }
    expect(firstSuccess).toBeGreaterThan(1);
    expect(firstSuccess).toBeLessThan(256);
    const exact = numerics.createArithmeticContext({ maxBits: 512, maxOperations: firstSuccess });
    expect(numerics.toFloat32Bits(value, exact)).toBe(0x3eaaaaab);
    expect(() => numerics.toFloat32Bits(value, exact)).toThrowError(budgetError);
  });
  it('satisfies deterministic exact arithmetic identities without a floating-point oracle', () => {
    let state = 0x5eeda11;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
    for (let i = 0; i < 128; i++) {
      const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
      const n = BigInt(next() % 2001) - 1000n;
      const d = BigInt(next() % 1000 + 1);
      const m = BigInt(next() % 2000 + 1);
      const e = BigInt(next() % 1000 + 1);
      const a = numerics.rational(n, d, ctx);
      const b = numerics.rational(m, e, ctx);
      expect(numerics.subtract(numerics.add(a, b, ctx), b, ctx)).toEqual(a);
      expect(numerics.divide(numerics.multiply(a, b, ctx), b, ctx)).toEqual(a);
      const expectedSign = n * e < m * d ? -1 : n * e > m * d ? 1 : 0;
      expect(numerics.compare(a, b, ctx)).toBe(expectedSign);
      expect(numerics.add(a, b, ctx)).toEqual(numerics.add(b, a, ctx));
    }
  });
  it('checks nearest-even by independent exact local-distance witnesses on deterministic rational inputs', () => {
    let state = 0xa61e7;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
    const abs = (n: bigint) => n < 0n ? -n : n;
    const threshold = ((1n << 25n) - 1n) << 103n;
    for (let i = 0; i < 512; i++) {
      const ctx = numerics.createArithmeticContext({ maxBits: 1024, maxOperations: 10000 });
      let n = (BigInt(next()) << 32n) + BigInt(next()) + 1n;
      let d = (BigInt(next()) << 32n) + BigInt(next()) + 1n;
      const power = next() % 360 - 180;
      if (power >= 0) n <<= BigInt(power); else d <<= BigInt(-power);
      const sign = i % 2 === 0 ? 1n : -1n;
      const value = numerics.rational(sign * n, d, ctx);
      if (n >= threshold * d) {
        expect(() => numerics.toFloat32Bits(value, ctx)).toThrowError(
          expect.objectContaining({ code: 'FLOAT32_OVERFLOW' }),
        );
        continue;
      }
      const bits = numerics.toFloat32Bits(value, ctx);
      expect(bits >= 0 && bits <= 0xffffffff && Number.isInteger(bits)).toBe(true);
      expect(bits >>> 31).toBe(sign < 0n ? 1 : 0);
      const magnitudeBits = bits % 0x80000000;
      expect(magnitudeBits).toBeLessThanOrEqual(0x7f7fffff);
      const chosen = numerics.fromFloat32Bits(magnitudeBits, ctx);
      const chosenDistanceNumerator = abs(n * chosen.d - chosen.n * d);
      for (const neighborBits of [magnitudeBits - 1, magnitudeBits + 1]) {
        if (neighborBits < 0 || neighborBits > 0x7f7fffff) continue;
        const neighbor = numerics.fromFloat32Bits(neighborBits, ctx);
        const chosenDistance = chosenDistanceNumerator * neighbor.d;
        const neighborDistance = abs(n * neighbor.d - neighbor.n * d) * chosen.d;
        expect(chosenDistance <= neighborDistance).toBe(true);
        if (chosenDistance === neighborDistance) expect(magnitudeBits % 2).toBe(0);
      }
    }
    // Both components exceed Float64's finite range, but the exact result is just above a midpoint.
    const ctx = numerics.createArithmeticContext({ maxBits: 4096, maxOperations: 10000 });
    const n = (1n << 2000n) + (1n << 1976n) + 1n;
    expect(numerics.toFloat32Bits(numerics.rational(n, 1n << 2000n, ctx), ctx)).toBe(0x3f800001);
  });
  it('roundtrips finite bit patterns and resolves exact adjacent midpoints across binades', () => {
    let state = 0x71a53;
    const patterns = [0, 0x80000000, 1, 0x80000001, 0x007fffff, 0x00800000,
      0x3f800000, 0x7f7fffff, 0xff7fffff];
    for (let exponent = 0; exponent < 255; exponent++) {
      for (const fraction of [0, 1, 0x3fffff, 0x7ffffe, 0x7fffff]) {
        patterns.push(exponent * 0x800000 + fraction);
        patterns.push(0x80000000 + exponent * 0x800000 + fraction);
      }
    }
    for (let i = 0; i < 512; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      if (((state >>> 23) & 0xff) !== 255) patterns.push(state);
    }
    for (const bits of patterns) {
      const ctx = numerics.createArithmeticContext({ maxBits: 512, maxOperations: 10000 });
      const value = numerics.fromFloat32Bits(bits, ctx);
      expect(numerics.toFloat32Bits(value, ctx)).toBe(bits === 0x80000000 ? 0 : bits);
    }
    for (let exponent = 0; exponent < 255; exponent++) {
      for (const fraction of [0, 1, 0x7ffffe, 0x7fffff]) {
        const lowerBits = exponent * 0x800000 + fraction;
        if (lowerBits === 0x7f7fffff) continue;
        for (const sign of [1n, -1n]) {
          const ctx = numerics.createArithmeticContext({ maxBits: 1024, maxOperations: 10000 });
          const lo = numerics.fromFloat32Bits(lowerBits, ctx);
          const hi = numerics.fromFloat32Bits(lowerBits + 1, ctx);
          const two = numerics.rational(2n, 1n, ctx);
          const midpoint = numerics.divide(numerics.add(lo, hi, ctx), two, ctx);
          const value = numerics.rational(sign * midpoint.n, midpoint.d, ctx);
          const expected = lowerBits + (lowerBits % 2);
          expect(numerics.toFloat32Bits(value, ctx)).toBe(expected + (sign < 0n ? 0x80000000 : 0));
        }
      }
    }
  });
});
