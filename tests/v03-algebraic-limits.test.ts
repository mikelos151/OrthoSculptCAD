import { expect, it } from 'vitest';
import { createArithmeticContext, rational } from '../src/trimline/numerics';
import { createAlgebraicKernel } from '../src/trimline/algebraic-kernel';
const budget=expect.objectContaining({code:'BUDGET_EXCEEDED'}),invalid=expect.objectContaining({code:'INVALID_INPUT'});
const ctx=(maxBits=256,maxOperations=200000)=>createArithmeticContext({maxBits,maxOperations});
it('rejects shape, forged authority and noncanonical encodings without getters',()=>{
 const k=createAlgebraicKernel(ctx());
 for(const s of ['-0','2/4','1/1','01','1/0',' 1'])expect(()=>k.parse([s,'0','0','0'])).toThrowError(invalid);
 expect(()=>k.parse(['9'.repeat(2470),'0','0','0'])).toThrowError(budget);
 const sparse=new Array<string>(4);expect(()=>k.parse(sparse)).toThrowError(invalid);
 const a=['0','0','0','0'];Object.defineProperty(a,0,{get(){throw Error('getter ran');}});expect(()=>k.parse(a)).toThrowError(invalid);
 expect(()=>k.sign({coefficients:[]})).toThrowError(invalid);
 expect(()=>k.parse(['0','0','0','0','0'])).toThrowError(invalid);
});
it('checks fixed degree/rank, cancellation, deadlines, cumulative work and bit preflights',()=>{
 expect(()=>createAlgebraicKernel(ctx(),{maxRank:1})).toThrowError(budget);
 expect(()=>createAlgebraicKernel(ctx(),{maxDegree:3})).toThrowError(budget);
 const ac=new AbortController();const k=createAlgebraicKernel(ctx(),{signal:ac.signal});ac.abort();expect(()=>k.parse(['0','0','0','0'])).toThrowError(budget);
 expect(()=>createAlgebraicKernel(ctx(),{deadline:0})).toThrowError(budget);
 const c=ctx(8);const small=createAlgebraicKernel(c);expect(()=>small.parse(['256','0','0','0'])).toThrowError(budget);
 const b=small.parse(['32','0','0','0']);expect(()=>small.multiply(b,b)).toThrowError(budget);
 const shared=ctx(256,2000),limited=createAlgebraicKernel(shared);let successes=0;
 for(let i=0;i<100;i++){try{limited.parse(['0','0','0','0']);successes++;}catch(e){expect(e).toMatchObject({code:'BUDGET_EXCEEDED'});break;}}
 expect(successes).toBeGreaterThan(0);expect(successes).toBeLessThan(100);
 expect(()=>rational(0n,1n,shared)).toThrowError(budget);
});
it('literal independent expansion, distributivity, permutations and directed enclosure',()=>{
 const k=createAlgebraicKernel(ctx(512,2000000));const a=k.parse(['1','1','1','1']);
 expect(k.equal(k.multiply(a,a),k.parse(['12','8','6','4']))).toBe(true);
 const x=k.parse(['0','1','0','0']),y=k.parse(['0','0','1','0']);
 expect(k.equal(k.multiply(a,k.add(x,y)),k.add(k.multiply(a,x),k.multiply(a,y)))).toBe(true);
 const neg=k.sign(k.parse(['0','-1','0','0']),4);expect(neg.sign).toBe(-1);
 // dyadic 4-step sqrt2 enclosure [22/16,23/16], independently squared integers: 484<512<529.
 expect(neg.lower).toEqual({n:-23n,d:16n});expect(neg.upper).toEqual({n:-11n,d:8n});
 expect(()=>k.sign(x,-1)).toThrowError(invalid);expect(()=>k.sign(x,4097)).toThrowError(invalid);
});
