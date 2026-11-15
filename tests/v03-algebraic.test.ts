import { expect, it } from 'vitest';
import { createArithmeticContext, rational } from '../src/trimline/numerics';
import { algebraic } from '../src/trimline/algebraic';
it('owns canonical authenticated coefficients in fixed [1,sqrt2,sqrt3,sqrt6] order', () => {
 const ctx = createArithmeticContext({maxBits:256,maxOperations:10000});
 const c = [rational(0n,1n,ctx),rational(2n,4n,ctx),rational(0n,1n,ctx),rational(0n,1n,ctx)];
 const a = algebraic(c,ctx);
 expect(a.coefficients).toEqual([{n:0n,d:1n},{n:1n,d:2n},{n:0n,d:1n},{n:0n,d:1n}]);
 expect(Object.isFrozen(a.coefficients)).toBe(true);
 c.reverse(); expect(a.coefficients[1].n).toBe(1n);
 expect(() => algebraic([{n:0n,d:1n},...c.slice(1)],ctx)).toThrow();
});
