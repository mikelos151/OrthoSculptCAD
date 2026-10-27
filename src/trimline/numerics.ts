/** Standalone exact arithmetic. No mesh/application integration and no wall-time/RSS guarantee.
 * maxBits bounds raw inputs and arithmetic intermediates, not only normalized results.
 * Preflight width bounds intentionally permit conservative BUDGET_EXCEEDED refusals:
 * cancellation/reduction is never used to excuse first allocating an oversized intermediate.
 */
export interface Rational { readonly n: bigint; readonly d: bigint }
export interface ArithmeticLimits { maxBits: number; maxOperations: number }
declare const contextBrand: unique symbol;
export interface ArithmeticContext { readonly [contextBrand]: true }

export class NumericsError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'BUDGET_EXCEEDED' | 'FLOAT32_OVERFLOW') {
    super(code);
    this.name = 'NumericsError';
  }
}

interface Budget {
  readonly maxBits: number;
  readonly ceiling: bigint;
  readonly floor: bigint;
  remaining: number;
}
const contexts = new WeakMap<ArithmeticContext, Budget>();
const rationals = new WeakSet<Rational>();

export function createArithmeticContext(limits: ArithmeticLimits): ArithmeticContext {
  if (typeof limits !== 'object' || limits === null) throw new NumericsError('INVALID_INPUT');
  // Read data descriptors once, never getters or coercion hooks. Only owned fields count.
  const bitsDescriptor = Object.getOwnPropertyDescriptor(limits, 'maxBits');
  const opsDescriptor = Object.getOwnPropertyDescriptor(limits, 'maxOperations');
  if (!bitsDescriptor || !opsDescriptor || !('value' in bitsDescriptor) || !('value' in opsDescriptor)) {
    throw new NumericsError('INVALID_INPUT');
  }
  const maxBits: unknown = bitsDescriptor.value;
  const maxOperations: unknown = opsDescriptor.value;
  if (typeof maxBits !== 'number' || !Number.isInteger(maxBits) || maxBits < 1 || maxBits > 4096 ||
      typeof maxOperations !== 'number' || !Number.isInteger(maxOperations) ||
      maxOperations < 1 || maxOperations > 2000000) throw new NumericsError('INVALID_INPUT');
  const ctx = Object.freeze(Object.create(null)) as ArithmeticContext;
  // The guard is the sole maxBits+1-bit constant; context setup is capped at 4097 bits.
  const ceiling = 1n << BigInt(maxBits);
  contexts.set(ctx, { maxBits, ceiling, floor: -ceiling, remaining: maxOperations });
  return ctx;
}

function enter(ctx: ArithmeticContext): Budget {
  const budget = contexts.get(ctx);
  if (!budget) throw new NumericsError('INVALID_INPUT');
  charge(budget);
  return budget;
}

// Units conservatively cover BigInt primitives and loop/branch checks, not wall time/RSS.
// Every charge precedes its work; failed work never restores spent units.
function charge(budget: Budget, units = 1): void {
  if (budget.remaining < units) {
    budget.remaining = 0;
    throw new NumericsError('BUDGET_EXCEEDED');
  }
  budget.remaining -= units;
}

function size(value: bigint, budget: Budget): void {
  charge(budget, 2);
  // Compare before abs/toString/gcd, including on already enormous caller-owned BigInts.
  if (value >= budget.ceiling || value <= budget.floor) throw new NumericsError('BUDGET_EXCEEDED');
}

function width(value: bigint, budget: Budget): number {
  size(value, budget);
  charge(budget, 4);
  return value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length;
}

function product(a: bigint, b: bigint, budget: Budget): bigint {
  const bits = width(a, budget) + width(b, budget);
  if (bits > budget.maxBits) throw new NumericsError('BUDGET_EXCEEDED');
  charge(budget);
  return a * b;
}

function sum(a: bigint, b: bigint, subtract: boolean, budget: Budget): bigint {
  const bits = Math.max(width(a, budget), width(b, budget)) + 1;
  if (bits > budget.maxBits) throw new NumericsError('BUDGET_EXCEEDED');
  charge(budget);
  return subtract ? a - b : a + b;
}

function normalize(n: bigint, d: bigint, budget: Budget): Rational {
  size(n, budget);
  size(d, budget);
  charge(budget, 5);
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n;
  let b = d;
  while (true) {
    charge(budget); // loop condition, including final iteration
    if (b === 0n) break;
    charge(budget);
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  charge(budget, 2);
  const value: Rational = Object.freeze({ n: n / a, d: d / a });
  rationals.add(value);
  return value;
}

export function rational(n: bigint, d: bigint, ctx: ArithmeticContext): Rational {
  const budget = enter(ctx);
  if (typeof n !== 'bigint' || typeof d !== 'bigint' || d === 0n) throw new NumericsError('INVALID_INPUT');
  return normalize(n, d, budget);
}

function operands(a: Rational, b: Rational, ctx: ArithmeticContext): Budget {
  const budget = enter(ctx);
  validateValue(a, budget);
  validateValue(b, budget);
  return budget;
}

function validateValue(value: Rational, budget: Budget): void {
  if (!rationals.has(value)) throw new NumericsError('INVALID_INPUT');
  size(value.n, budget);
  size(value.d, budget);
}

export function add(a: Rational, b: Rational, ctx: ArithmeticContext): Rational {
  const budget = operands(a, b, ctx);
  return normalize(sum(product(a.n, b.d, budget), product(b.n, a.d, budget), false, budget),
    product(a.d, b.d, budget), budget);
}
export function subtract(a: Rational, b: Rational, ctx: ArithmeticContext): Rational {
  const budget = operands(a, b, ctx);
  return normalize(sum(product(a.n, b.d, budget), product(b.n, a.d, budget), true, budget),
    product(a.d, b.d, budget), budget);
}
export function multiply(a: Rational, b: Rational, ctx: ArithmeticContext): Rational {
  const budget = operands(a, b, ctx);
  return normalize(product(a.n, b.n, budget), product(a.d, b.d, budget), budget);
}
export function divide(a: Rational, b: Rational, ctx: ArithmeticContext): Rational {
  const budget = operands(a, b, ctx);
  charge(budget);
  if (b.n === 0n) throw new NumericsError('INVALID_INPUT');
  return normalize(product(a.n, b.d, budget), product(a.d, b.n, budget), budget);
}
export function compare(a: Rational, b: Rational, ctx: ArithmeticContext): -1 | 0 | 1 {
  const budget = operands(a, b, ctx);
  const left = product(a.n, b.d, budget);
  const right = product(b.n, a.d, budget);
  charge(budget, 2);
  return left < right ? -1 : left > right ? 1 : 0;
}

function shiftLeft(value: bigint, places: number, budget: Budget): bigint {
  const bits = width(value, budget);
  if (places < 0 || !Number.isInteger(places) || bits + places > budget.maxBits) {
    throw new NumericsError('BUDGET_EXCEEDED');
  }
  charge(budget, 2); // bounded integer -> BigInt, then shift
  return value << BigInt(places);
}

export function fromFloat32Bits(bits: number, ctx: ArithmeticContext): Rational {
  const budget = enter(ctx);
  if (typeof bits !== 'number' || !Number.isInteger(bits) || bits < 0 || bits > 0xffffffff) {
    throw new NumericsError('INVALID_INPUT');
  }
  const exponent = (bits >>> 23) & 0xff;
  if (exponent === 0xff) throw new NumericsError('INVALID_INPUT');
  const fraction = bits & 0x7fffff;
  const significand = exponent === 0 ? fraction : fraction + 0x800000;
  // Even this fixed-width conversion respects a caller's smaller bit limit.
  if (budget.maxBits < 24 && significand >= 2 ** budget.maxBits) {
    throw new NumericsError('BUDGET_EXCEEDED');
  }
  charge(budget);
  let n = BigInt(significand);
  let d = 1n;
  charge(budget);
  if (n === 0n) return normalize(0n, 1n, budget);
  const power = exponent === 0 ? -149 : exponent - 150;
  if (power < 0) d = shiftLeft(d, -power, budget);
  else n = shiftLeft(n, power, budget);
  if ((bits >>> 31) !== 0) { charge(budget); n = -n; }
  return normalize(n, d, budget);
}

function nearestInteger(n: bigint, d: bigint, budget: Budget): bigint {
  charge(budget, 3);
  let q = n / d;
  const remainder = n % d;
  // Compare r with d-r instead of allocating a possibly over-limit 2*r.
  const complement = d - remainder;
  charge(budget, 4);
  if (remainder > complement || (remainder === complement && (q & 1n) !== 0n)) {
    q = sum(q, 1n, false, budget);
  }
  return q;
}

export function toFloat32Bits(value: Rational, ctx: ArithmeticContext): number {
  const budget = enter(ctx);
  validateValue(value, budget);
  charge(budget, 3);
  const negative = value.n < 0n;
  const n = negative ? -value.n : value.n;
  if (n === 0n) return 0;
  const sign = negative ? 0x80000000 : 0;
  const d = value.d;
  let exponent = width(n, budget) - width(d, budget);
  // A width difference bounds floor(log2(n/d)) to {difference-1,difference}.
  // Below -150 it is strictly below half the smallest subnormal.
  if (exponent < -150) return sign;
  if (exponent > 128) throw new NumericsError('FLOAT32_OVERFLOW');
  charge(budget);
  const below = exponent >= 0
    ? n < shiftLeft(d, exponent, budget)
    : shiftLeft(n, -exponent, budget) < d;
  if (below) exponent--;
  if (exponent > 127) throw new NumericsError('FLOAT32_OVERFLOW');
  const subnormal = exponent < -126;
  const scale = subnormal ? 149 : 23 - exponent;
  const scaledN = scale >= 0 ? shiftLeft(n, scale, budget) : n;
  const scaledD = scale < 0 ? shiftLeft(d, -scale, budget) : d;
  let q = nearestInteger(scaledN, scaledD, budget);
  if (subnormal) {
    charge(budget); // q is in [0,2^23]; convert only that bounded integer
    return sign + Number(q); // includes a carry into min-normal
  }
  charge(budget);
  if (q === 0x1000000n) { charge(budget); q >>= 1n; exponent++; }
  if (exponent > 127) throw new NumericsError('FLOAT32_OVERFLOW');
  // q is now a bounded 24-bit integer; only this integer is converted to Number.
  charge(budget);
  return sign + (exponent + 126) * 0x800000 + Number(q);
}
