/** Fixed Q(sqrt2,sqrt3), basis [1,sqrt2,sqrt3,sqrt6], positive embedding.
 * Independence: 2,3,6 are nonsquares in Q by odd prime valuations.
 * No arbitrary generator closure; all arithmetic uses bounded numerics. */
import { rational, compare, type ArithmeticContext, type Rational, NumericsError } from './numerics';
export interface Algebraic { readonly coefficients: readonly Rational[] }
export function authenticatedCoefficients(a: Algebraic, ctx: ArithmeticContext): readonly Rational[] {
 if(!values.has(a)) throw new NumericsError('INVALID_INPUT');
 return algebraic(a.coefficients,ctx).coefficients;
}
const values = new WeakSet<Algebraic>();
export function algebraic(c: readonly Rational[], ctx: ArithmeticContext): Algebraic {
 const zero = rational(0n,1n,ctx);
 if (!Array.isArray(c) || Object.getOwnPropertyDescriptor(c,'length')?.value !== 4) throw new NumericsError('INVALID_INPUT');
 const out: Rational[] = [];
 for(let i=0;i<4;i++) {
  const d = Object.getOwnPropertyDescriptor(c,String(i));
  if(!d || !('value' in d)) throw new NumericsError('INVALID_INPUT');
  const v = d.value as Rational;
  compare(v,zero,ctx);
  out.push(v);
 }
 const a = Object.freeze({coefficients:Object.freeze(out)}); values.add(a); return a;
}
