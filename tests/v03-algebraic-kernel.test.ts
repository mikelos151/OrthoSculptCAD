import { expect, it } from 'vitest';
import { createArithmeticContext } from '../src/trimline/numerics';
import { createAlgebraicKernel } from '../src/trimline/algebraic-kernel';
it('exact field identities and spike conormal literals without approximate equality', () => {
 const k = createAlgebraicKernel(createArithmeticContext({maxBits:512,maxOperations:2000000}));
 const a=k.parse(['0','1','0','0']), b=k.parse(['0','0','1','0']);
 expect(k.equal(k.multiply(a,a),k.parse(['2','0','0','0']))).toBe(true);
 expect(k.equal(k.multiply(b,b),k.parse(['3','0','0','0']))).toBe(true);
 expect(k.equal(k.multiply(a,b),k.multiply(b,a))).toBe(true);
 const c=k.parse(['0','1/2','0','0']);
 expect(k.equal(k.multiply(c,c),k.parse(['1/2','0','0','0']))).toBe(true);
 expect(k.sign(k.subtract(a,a),0).sign).toBe(0);
 expect(k.sign(k.subtract(b,a),0).sign).toBe('UNKNOWN');
 expect(k.sign(k.subtract(b,a),8).sign).toBe(1);
 const near=k.parse(['-282842712474619/200000000000000','1','0','0']);
 expect(k.sign(near,8).sign).toBe('UNKNOWN');
 expect(k.sign(near,60).sign).toBe(1);
 expect(k.equal(a,k.parse(['0','0','1','0']))).toBe(false);
});
