import { algebraic, type Algebraic } from './algebraic';
import { add, subtract, multiply, divide, rational, compare, NumericsError, type ArithmeticContext, type Rational } from './numerics';
export interface AlgebraicOptions { readonly maxRank?: number; readonly maxDegree?: number; readonly signal?: AbortSignal; readonly deadline?: number }
export interface AlgebraicSign { readonly sign: -1 | 0 | 1 | 'UNKNOWN'; readonly lower: Rational; readonly upper: Rational }
/** Cooperative checkpoints, not preemption or RSS guarantees. All work shares ctx.
 * Bit/intermediate refusals propagate as NumericsError, meaning UNKNOWN, not FAIL. */
export function createAlgebraicKernel(ctx: ArithmeticContext, options: AlgebraicOptions = {}) {
 if(typeof options!=='object' || options===null) throw new NumericsError('INVALID_INPUT');
 const field=(key: keyof AlgebraicOptions): unknown => { const d=Object.getOwnPropertyDescriptor(options,key); if(d && !('value' in d)) throw new NumericsError('INVALID_INPUT'); return d?.value; };
 const rank=field('maxRank')??2,degree=field('maxDegree')??4,deadline=field('deadline'),signal=field('signal') as AbortSignal|undefined;
 if(!Number.isSafeInteger(rank) || !Number.isSafeInteger(degree) || (rank as number)<0 || (degree as number)<1 || (deadline!==undefined && (typeof deadline!=='number' || !Number.isFinite(deadline)))) throw new NumericsError('INVALID_INPUT');
 if((rank as number)<2 || (degree as number)<4) throw new NumericsError('BUDGET_EXCEEDED');
 const tick=()=>{ if(signal?.aborted || (typeof deadline==='number' && Date.now()>=deadline)) throw new NumericsError('BUDGET_EXCEEDED'); rational(0n,1n,ctx); };
 tick();
 const q=(n:bigint)=>rational(n,1n,ctx),zero=q(0n),one=q(1n),two=q(2n);
 const check=(a:Algebraic)=>{tick();return authenticatedCoefficients(a,ctx);};
 const parseQ=(s:unknown):Rational=>{
  tick(); if(typeof s!=='string') throw new NumericsError('INVALID_INPUT');
  // fixed 4096-bit numerics ceiling implies at most 1234 decimal digits per integer.
  // Reject text before regex/split/BigInt conversion. Digits accumulate via bounded arithmetic.
  if(s.length>2469) throw new NumericsError('BUDGET_EXCEEDED');
  if(!/^-?(0|[1-9][0-9]*)(\/[1-9][0-9]*)?$/.test(s)) throw new NumericsError('INVALID_INPUT');
  const parts=s.split('/'),negative=parts[0][0]==='-';
  const integer=(text:string)=>{let v=zero;for(let i=0;i<text.length;i++){tick();v=add(multiply(v,q(10n),ctx),q(BigInt(text.charCodeAt(i)-48)),ctx);}return v;};
  let v=divide(integer(negative?parts[0].slice(1):parts[0]),parts[1]?integer(parts[1]):one,ctx);
  if(negative)v=subtract(zero,v,ctx);
  tick(); if((v.d===1n?String(v.n):`${v.n}/${v.d}`)!==s)throw new NumericsError('INVALID_INPUT');
  return v;
 };
 const parse=(input:readonly string[])=>{
  tick();if(!Array.isArray(input)||Object.getOwnPropertyDescriptor(input,'length')?.value!==4)throw new NumericsError('INVALID_INPUT');
  const c:Rational[]=[];for(let i=0;i<4;i++){tick();const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!('value'in d))throw new NumericsError('INVALID_INPUT');c.push(parseQ(d.value));}return algebraic(c,ctx);
 };
 const binary=(a:Algebraic,b:Algebraic,sub:boolean)=>{const x=check(a),y=check(b),c:Rational[]=[];for(let i=0;i<4;i++){tick();c.push((sub?subtract:add)(x[i],y[i],ctx));}return algebraic(c,ctx);};
 const mul=(a:Algebraic,b:Algebraic)=>{
  const x=check(a),y=check(b);tick();const c=[zero,zero,zero,zero];
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){tick();let v=multiply(x[i],y[j],ctx);if(i&j&1)v=multiply(v,two,ctx);if(i&j&2)v=multiply(v,q(3n),ctx);c[i^j]=add(c[i^j],v,ctx);}return algebraic(c,ctx);
 };
 const equal=(a:Algebraic,b:Algebraic)=>{const x=check(a),y=check(b);for(let i=0;i<4;i++){tick();if(compare(x[i],y[i],ctx)!==0)return false;}return true;};
 const sign=(a:Algebraic,refinements=60):AlgebraicSign=>{
  tick();if(!Number.isSafeInteger(refinements)||refinements<0||refinements>4096)throw new NumericsError('INVALID_INPUT');
  const c=check(a);if(c.every(v=>v.n===0n))return Object.freeze({sign:0,lower:zero,upper:zero});
  let lower=c[0],upper=c[0];
  for(let i=1;i<4;i++){
   tick();let l=one,u=q(i===3?3n:2n);const rad=q(i===1?2n:i===2?3n:6n);
   for(let j=0;j<refinements;j++){tick();const m=divide(add(l,u,ctx),two,ctx);if(compare(multiply(m,m,ctx),rad,ctx)<0)l=m;else u=m;}
   const positive=compare(c[i],zero,ctx)>=0;
   lower=add(lower,multiply(c[i],positive?l:u,ctx),ctx);upper=add(upper,multiply(c[i],positive?u:l,ctx),ctx);
  }
  return Object.freeze({sign:compare(lower,zero,ctx)>0?1:compare(upper,zero,ctx)<0?-1:'UNKNOWN',lower,upper});
 };
 return Object.freeze({parse,add:(a:Algebraic,b:Algebraic)=>binary(a,b,false),subtract:(a:Algebraic,b:Algebraic)=>binary(a,b,true),multiply:mul,equal,sign});
}
import { authenticatedCoefficients } from './algebraic';
