/** Local evidence only: NOT source admission, simplicity or cut permission. */
import { createAlgebraicKernel } from './algebraic-kernel';
import { algebraic, type Algebraic } from './algebraic';
import { rational, add as qadd, subtract as qsub, multiply as qmul, compare, NumericsError, type ArithmeticContext } from './numerics';
export interface AlgebraicCertificateResult {readonly status:'PASS'|'FAIL'|'UNKNOWN';readonly reason:string}
class Refusal extends Error {constructor(readonly status:'FAIL'|'UNKNOWN',reason:string){super(reason);}}
export function verifyAlgebraicCertificate(input:unknown, sourceInput:unknown, ctx:ArithmeticContext):AlgebraicCertificateResult {
 try {
 const tick=()=>{rational(0n,1n,ctx);};
 const fail=(s:string):never=>{throw new Refusal('FAIL',s);};
 const unknown=(s:string):never=>{throw new Refusal('UNKNOWN',s);};
 const object=(v:unknown,keys:readonly string[])=>{
  tick();if(typeof v!=='object'||v===null||Array.isArray(v))return unknown('SCHEMA');
  if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)return unknown('SCHEMA');
  const names=Reflect.ownKeys(v);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))return unknown('SCHEMA');
  const out:Record<string,unknown>={};for(const key of keys){tick();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value'in d))return unknown('SCHEMA');out[key]=d.value;}return out;
 };
 const array=(v:unknown,min:number,max:number):unknown[]=>{tick();if(!Array.isArray(v))return unknown('SCHEMA');const n=Object.getOwnPropertyDescriptor(v,'length')?.value;if(!Number.isSafeInteger(n)||n<min||n>max)return unknown('LIMIT');const keys=Reflect.ownKeys(v);if(Object.getPrototypeOf(v)!==Array.prototype||keys.length!==n+1||keys.some(key=>key!=='length'&&(typeof key!=='string'||! /^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=n)))return unknown('SCHEMA');const out:unknown[]=[];for(let i=0;i<n;i++){tick();const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))return unknown('SCHEMA');out.push(d.value);}return out;};
 const k=createAlgebraicKernel(ctx),q=(s:unknown)=>k.parse([s as string,'0','0','0']),zero=q('0'),one=q('1');
 const scalar=(v:unknown)=>k.parse(array(v,4,4) as string[]);
 const point=(v:unknown)=>array(v,3,3).map(scalar),triangle=(v:unknown)=>array(v,3,3).map(point);
 // Values here originate exclusively from the authenticated kernel parser/factory.
 const z=rational(0n,1n,ctx);
 const isQ=(a:Algebraic)=>a.coefficients.slice(1).every(c=>c.n===0n);
 const lift=(r:ReturnType<typeof rational>)=>algebraic([r,z,z,z],ctx);
 const add=(a:Algebraic,b:Algebraic)=>isQ(a)&&isQ(b)?lift(qadd(a.coefficients[0],b.coefficients[0],ctx)):isQ(a)?algebraic([qadd(a.coefficients[0],b.coefficients[0],ctx),b.coefficients[1],b.coefficients[2],b.coefficients[3]],ctx):isQ(b)?algebraic([qadd(a.coefficients[0],b.coefficients[0],ctx),a.coefficients[1],a.coefficients[2],a.coefficients[3]],ctx):k.add(a,b);
 const sub=(a:Algebraic,b:Algebraic)=>isQ(a)&&isQ(b)?lift(qsub(a.coefficients[0],b.coefficients[0],ctx)):isQ(b)?algebraic([qsub(a.coefficients[0],b.coefficients[0],ctx),a.coefficients[1],a.coefficients[2],a.coefficients[3]],ctx):isQ(a)?algebraic([qsub(a.coefficients[0],b.coefficients[0],ctx),qsub(z,b.coefficients[1],ctx),qsub(z,b.coefficients[2],ctx),qsub(z,b.coefficients[3],ctx)],ctx):k.subtract(a,b);
 const mul=(a:Algebraic,b:Algebraic)=>isQ(a)&&isQ(b)?lift(qmul(a.coefficients[0],b.coefficients[0],ctx)):isQ(a)?(a.coefficients[0].n===0n?zero:a.coefficients[0].n===a.coefficients[0].d?b:algebraic([qmul(a.coefficients[0],b.coefficients[0],ctx),qmul(a.coefficients[0],b.coefficients[1],ctx),qmul(a.coefficients[0],b.coefficients[2],ctx),qmul(a.coefficients[0],b.coefficients[3],ctx)],ctx)):isQ(b)?(b.coefficients[0].n===0n?zero:b.coefficients[0].n===b.coefficients[0].d?a:algebraic([qmul(a.coefficients[0],b.coefficients[0],ctx),qmul(a.coefficients[1],b.coefficients[0],ctx),qmul(a.coefficients[2],b.coefficients[0],ctx),qmul(a.coefficients[3],b.coefficients[0],ctx)],ctx)):k.multiply(a,b);
 const eq=k.equal;
 // Reuse the SAME certified 60-step positive-radical enclosures within this
 // verification; no budget reset, epsilon predicates or weakened residuals.
 const roots=new Map<number,ReturnType<typeof k.sign>>();
 const sign=(v:Algebraic)=>{if(isQ(v))return compare(v.coefficients[0],z,ctx);let lower=v.coefficients[0],upper=lower;for(let i=1;i<4;i++){tick();const c=v.coefficients[i];if(c.n===0n)continue;let r=roots.get(i);if(!r){const coefficients=[z,z,z,z];coefficients[i]=rational(1n,1n,ctx);r=k.sign(algebraic(coefficients,ctx));roots.set(i,r);}const positive=compare(c,z,ctx)>=0;lower=qadd(lower,qmul(c,positive?r.lower:r.upper,ctx),ctx);upper=qadd(upper,qmul(c,positive?r.upper:r.lower,ctx),ctx);}if(compare(lower,z,ctx)>0)return 1;if(compare(upper,z,ctx)<0)return -1;if(v.coefficients.every(c=>c.n===0n))return 0;return unknown('SIGN');};
 const nonnegative=(v:Algebraic)=>{if(sign(v)<0)fail('NEGATIVE');};
 const vp=(a:Algebraic[],b:Algebraic[])=>a.map((x,i)=>sub(x,b[i]));
 const dot=(a:Algebraic[],b:Algebraic[])=>a.reduce((s,x,i)=>add(s,mul(x,b[i])),zero);
 const peq=(a:Algebraic[],b:Algebraic[])=>a.every((v,i)=>eq(v,b[i]));
 const norm1=(a:Algebraic[])=>a.reduce((s,x)=>add(s,sign(x)<0?sub(zero,x):x),zero);
 const cross=(a:Algebraic[],b:Algebraic[])=>[sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))];
 const root=object(input,['version','field','spans','segments']);
 if(root.version!=='algebraic-source-bridge-v1'||root.field!=='Qsqrt2sqrt3-positive')return unknown('VERSION_OR_FIELD');
 const source=array(sourceInput,1,64).map(triangle);
 const spans=array(root.spans,1,64).map(raw=>{
  const s=object(raw,['sourceFace','triangle','weights','controls','regularAxis']);
  if(typeof s.sourceFace!=='number'||!Number.isSafeInteger(s.sourceFace)||s.sourceFace<0||s.sourceFace>=source.length)return unknown('SOURCE_FACE');
  const tri=triangle(s.triangle);if(!tri.every((p,i)=>peq(p,source[s.sourceFace as number][i])))fail('SOURCE_IDENTITY');
  const u=vp(tri[1],tri[0]),v=vp(tri[2],tri[0]);
  // Nonzero minor plus all three forward residuals includes unused-axis check.
  if(cross(u,v).every(x=>eq(x,zero)))fail('DEGENERATE_FACE');
  const weights=array(s.weights,4,4).map(x=>array(x,3,3).map(scalar));
  const controls=array(s.controls,4,4).map(point);
  weights.forEach((w,j)=>{w.forEach(nonnegative);if(!eq(w.reduce(add,zero),one))fail('WEIGHT_SUM');for(let axis=0;axis<3;axis++){const mapped=w.reduce((sum,x,i)=>add(sum,mul(x,tri[i][axis])),zero);if(!eq(mapped,controls[j][axis]))fail('FACE_RESIDUAL');}});
  if(typeof s.regularAxis!=='number'||!Number.isInteger(s.regularAxis)||s.regularAxis<0||s.regularAxis>2)return unknown('REGULAR_AXIS');
  const ds=[0,1,2].map(i=>sign(sub(controls[i+1][s.regularAxis as number],controls[i][s.regularAxis as number])));
  if(ds[0]===0||!ds.every(d=>d===ds[0]))return unknown('REGULARITY_HULL');
  return {tri,controls};
 });
 for(let i=1;i<spans.length;i++){
  const a=spans[i-1],b=spans[i];if(!peq(a.controls[3],b.controls[0]))fail('SEAM_POINT');
  const va=vp(a.controls[3],a.controls[2]),vb=vp(b.controls[1],b.controls[0]);
  if(a.tri.every((p,j)=>peq(p,b.tri[j]))){if(!cross(va,vb).every(x=>eq(x,zero))||sign(dot(va,vb))!==1)fail('G1');continue;}
  const shared=a.tri.filter(p=>b.tri.some(q=>peq(p,q)));if(shared.length!==2)return unknown('SEAM_TOPOLOGY');
  const e=vp(shared[1],shared[0]),ee=dot(e,e),aa=dot(va,e),bb=dot(vb,e);
  const ra=vp(a.tri.find(p=>!shared.some(q=>peq(p,q)))!,shared[0]),rb=vp(b.tri.find(p=>!shared.some(q=>peq(p,q)))!,shared[0]);
  const ep=vp(a.controls[3],shared[0]);if(!cross(ep,e).every(x=>eq(x,zero))||sign(dot(ep,e))<0||sign(sub(ee,dot(ep,e)))<0)fail('SEAM_EDGE');
  if(sign(sub(mul(dot(va,ra),ee),mul(aa,dot(ra,e))))!==-1||sign(sub(mul(dot(vb,rb),ee),mul(bb,dot(rb,e))))!==1)fail('SEAM_DIRECTION');
  const pa=sub(mul(dot(va,va),ee),mul(aa,aa)),pb=sub(mul(dot(vb,vb),ee),mul(bb,bb));
  if(sign(aa)!==sign(bb)||!eq(mul(mul(aa,aa),pb),mul(mul(bb,bb),pa)))fail('G1');
 }
 const blossom=(controls:Algebraic[][],ts:Algebraic[])=>{let p=controls;for(const t of ts)p=p.slice(0,-1).map((v,i)=>v.map((x,j)=>add(mul(sub(one,t),x),mul(t,p[i+1][j]))));return p[0];};
 const segments=array(root.segments,1,256);let spanIndex=0,end=zero,previous:Algebraic[]|undefined;
 for(const raw of segments){
  const s=object(raw,['span','t0','t1','controls','controlError','chordError']);
  if(s.span!==spanIndex){if(s.span!==spanIndex+1||!eq(end,one))fail('PARAMETER_COVER');spanIndex++;end=zero;}
  if(spanIndex>=spans.length)fail('PARAMETER_COVER');
  const t0=q(s.t0),t1=q(s.t1);if(!eq(t0,end)||sign(sub(t1,t0))!==1||sign(sub(one,t1))<0)fail('PARAMETER_COVER');
  const controls=array(s.controls,4,4).map(p=>array(p,3,3).map(q));
  // Independent division-free barycentric inverse via oriented area numerators.
  const tri=spans[spanIndex].tri,u=vp(tri[1],tri[0]),v=vp(tri[2],tri[0]),n=cross(u,v),nn=dot(n,n);
  for(const p of controls){const r=vp(p,tri[0]);if(!eq(dot(n,r),zero))fail('BRIDGE_FACE');const wb=dot(cross(r,v),n),wc=dot(cross(u,r),n);if(sign(wb)<0||sign(wc)<0||sign(sub(sub(nn,wb),wc))<0)fail('BRIDGE_FACE');}
  const ce=q(s.controlError),le=q(s.chordError);nonnegative(ce);nonnegative(le);
  if(sign(sub(q('1/200'),add(ce,le)))<0)fail('APPROXIMATION_BUDGET');
  if(previous&&!peq(previous,controls[0]))fail('CANONICAL_EVENT');
  for(let j=0;j<4;j++){
   const restricted=blossom(spans[spanIndex].controls,[...Array(3-j).fill(t0),...Array(j).fill(t1)]);
   if(sign(sub(ce,norm1(vp(restricted,controls[j]))))<0)fail('CONTROL_BOUND');
   const t=q(j===0?'0':j===1?'1/3':j===2?'2/3':'1');
   const line=controls[0].map((x,axis)=>add(mul(sub(one,t),x),mul(t,controls[3][axis])));
   if(sign(sub(le,norm1(vp(controls[j],line))))<0)fail('CHORD_BOUND');
  }
  previous=controls[3];end=t1;
 }
 if(spanIndex!==spans.length-1||!eq(end,one))fail('PARAMETER_COVER');
 return Object.freeze({status:'PASS',reason:'LOCAL_CURVE_AND_SOURCE_BRIDGE_ONLY'});
 }catch(e){if(e instanceof Refusal)return Object.freeze({status:e.status,reason:e.message});if(e instanceof NumericsError)return Object.freeze({status:'UNKNOWN',reason:e.code});throw e;}
}
