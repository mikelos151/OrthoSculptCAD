/** Constructive fixed-field local bridge. Rational authoritative faces only.
 * Every exact operation and final verification shares ctx; no cut permission. */
import {createAlgebraicKernel} from './algebraic-kernel';
import {algebraic} from './algebraic';
import {rational,add,subtract,multiply,divide,compare,NumericsError,type ArithmeticContext,type Rational} from './numerics';
import {verifyAlgebraicCertificate} from './algebraic-certificate';
export interface ProducerResult {readonly status:'PASS'|'UNKNOWN';readonly reason:string;readonly certificate?:unknown}
export function produceAlgebraicBridge(input:unknown,sourceInput:unknown,ctx:ArithmeticContext):ProducerResult {
 try {
 const refuse=(reason:string):never=>{throw new Error(reason);};
 const tick=()=>{};
const obj=(v:unknown,keys:string[])=>{tick();if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)return refuse('SCHEMA');const names=Reflect.ownKeys(v);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return refuse('SCHEMA');const o:Record<string,unknown>={};for(const key of keys){tick();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value'in d))return refuse('SCHEMA');o[key]=d.value;}return o;};
 const arr=(v:unknown,min:number,max:number):unknown[]=>{tick();if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)return refuse('SCHEMA');const n=Object.getOwnPropertyDescriptor(v,'length')?.value;if(!Number.isSafeInteger(n)||n<min||n>max||Reflect.ownKeys(v).length!==n+1)return refuse('LIMIT');const out:unknown[]=[];for(let i=0;i<n;i++){tick();const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))return refuse('SCHEMA');out.push(d.value);}return out;};
 const integer=(v:unknown,min:number,max:number)=>{tick();if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)return refuse('LIMIT');return v;};
 const root=obj(input,['field','spans','maxDepth','maxSegments','roundingSteps']);
 if(root.field!=='Qsqrt2sqrt3-positive')return refuse('FIELD');
 const depth=integer(root.maxDepth,0,12),cap=integer(root.maxSegments,1,256),steps=integer(root.roundingSteps,1,1048576);
 const k=createAlgebraicKernel(ctx),z=rational(0n,1n,ctx),one=rational(1n,1n,ctx),two=rational(2n,1n,ctx);
 type A=readonly Rational[];type P=A[];
 const parse=(v:unknown):A=>k.parse(arr(v,4,4) as string[]).coefficients;
 const q=(n:number)=>{tick();return rational(BigInt(n),1n,ctx);};
 const lift=(r:Rational):A=>[r,z,z,z];
 const plus=(a:A,b:A):A=>a.map((x,i)=>{tick();return x.n===0n?b[i]:b[i].n===0n?x:add(x,b[i],ctx);});
 const minus=(a:A,b:A):A=>a.map((x,i)=>{tick();return b[i].n===0n?x:subtract(x,b[i],ctx);});
 const times=(a:A,b:A):A=>{tick();if(a.slice(1).every(x=>x.n===0n)&&b.slice(1).every(x=>x.n===0n))return lift(multiply(a[0],b[0],ctx));const c=[z,z,z,z];for(let i=0;i<4;i++)for(let j=0;j<4;j++){tick();if(a[i].n===0n||b[j].n===0n)continue;let v=multiply(a[i],b[j],ctx);if(i&j&1)v=multiply(v,two,ctx);if(i&j&2)v=multiply(v,q(3),ctx);c[i^j]=add(c[i^j],v,ctx);}return c;};
 const text=(r:Rational)=>r.d===1n?String(r.n):`${r.n}/${r.d}`;
 const encode=(a:A)=>a.map(text),encodeP=(p:P)=>p.map(encode);
 const zero=lift(z),unit=lift(one);
 // Cache certified radical enclosures once; repeated rounding predicates must not
 // recompute three square-root bisections for every coefficient comparison.
 const radicals=[1,2,3].map(i=>{const c=[z,z,z,z];c[i]=one;return k.sign(algebraic(c,ctx),24);});
 const interval=(a:A)=>{let lower=a[0],upper=a[0];for(let i=1;i<4;i++){tick();if(a[i].n===0n)continue;const r=radicals[i-1],positive=compare(a[i],z,ctx)>=0;lower=add(lower,multiply(a[i],positive?r.lower:r.upper,ctx),ctx);upper=add(upper,multiply(a[i],positive?r.upper:r.lower,ctx),ctx);}return {lower,upper};};
 const sign=(a:A)=>{if(a.slice(1).every(x=>x.n===0n))return compare(a[0],z,ctx);const r=interval(a);if(compare(r.lower,z,ctx)>0)return 1;if(compare(r.upper,z,ctx)<0)return -1;return refuse('SIGN');};
 const eq=(a:A,b:A)=>a.every((x,i)=>compare(x,b[i],ctx)===0);
 const source=arr(sourceInput,1,64).map(t=>arr(t,3,3).map(p=>arr(p,3,3).map(v=>{const a=parse(v);if(a.slice(1).some(x=>x.n!==0n))return refuse('UNSUPPORTED_SOURCE');return a;})));
 const spans=arr(root.spans,1,64).map(raw=>{const s=obj(raw,['sourceFace','weights','regularAxis']);const face=integer(s.sourceFace,0,source.length-1),axis=integer(s.regularAxis,0,2),tri=source[face];const weights=arr(s.weights,4,4).map(w=>arr(w,3,3).map(parse));for(const w of weights){if(w.some(v=>sign(v)<0)||!eq(w.reduce(plus,zero),unit))return refuse('WEIGHTS');}const controls=weights.map(w=>[0,1,2].map(axis=>w.reduce((sum,x,i)=>plus(sum,times(x,tri[i][axis])),zero)));return {sourceFace:face,triangle:tri.map(encodeP),weights:weights.map(w=>w.map(encode)),controls:controls.map(encodeP),regularAxis:axis,_weights:weights,_tri:tri};});
 const segments:{span:number;t0:string;t1:string;controls:string[][];controlError:string;chordError:string}[]=[];
 const events=new Map<string,Rational[]>();
 const blend=(a:A,b:A,t:Rational)=>plus(times(lift(subtract(one,t,ctx)),a),times(lift(t),b));
 const round=(w:P,tri:P[])=>{const ideal=[0,1,2].map(axis=>w.reduce((sum,x,i)=>plus(sum,times(x,tri[i][axis])),zero));const key=JSON.stringify(encodeP(ideal));const existing=events.get(key);if(existing)return existing;const floor=(a:A)=>{let lo=0,hi=steps;while(lo<hi){tick();const mid=Math.ceil((lo+hi)/2);if(sign(minus(a,lift(divide(q(mid),q(steps),ctx))))>=0)lo=mid;else hi=mid-1;}return divide(q(lo),q(steps),ctx);};const b=floor(w[1]),c=floor(w[2]),weights=[subtract(subtract(one,b,ctx),c,ctx),b,c];const p=[0,1,2].map(axis=>weights.reduce((sum,x,i)=>add(sum,multiply(x,tri[i][axis][0],ctx),ctx),z));tick();events.set(key,p);return p;};
 const bound=(a:A):Rational=>{if(a.slice(1).every(x=>x.n===0n))return compare(a[0],z,ctx)<0?subtract(z,a[0],ctx):a[0];const s=interval(a),l=compare(s.lower,z,ctx)<0?subtract(z,s.lower,ctx):s.lower,u=compare(s.upper,z,ctx)<0?subtract(z,s.upper,ctx):s.upper;return compare(l,u,ctx)>0?l:u;};
 for(let si=0;si<spans.length;si++){
 const span=spans[si];
 const visit=(weights:P[],t0:Rational,t1:Rational,d:number):void=>{tick();if(segments.length>=cap)return refuse('SEGMENT_CAP');const controls=weights.map(w=>round(w,span._tri));let ce=z,le=z;
 for(let j=0;j<4;j++){const ideal=[0,1,2].map(axis=>weights[j].reduce((sum,x,i)=>plus(sum,times(x,span._tri[i][axis])),zero));const err=ideal.reduce((sum,x,axis)=>add(sum,bound(minus(x,lift(controls[j][axis]))),ctx),z);if(compare(err,ce,ctx)>0)ce=err;const t=divide(q(j),q(3),ctx);const chord=controls[j].reduce((sum,x,axis)=>{const line=add(multiply(subtract(one,t,ctx),controls[0][axis],ctx),multiply(t,controls[3][axis],ctx),ctx);const r=subtract(x,line,ctx);return add(sum,compare(r,z,ctx)<0?subtract(z,r,ctx):r,ctx);},z);if(compare(chord,le,ctx)>0)le=chord;}
 if(compare(add(ce,le,ctx),divide(one,q(200),ctx),ctx)<=0){tick();segments.push({span:si,t0:text(t0),t1:text(t1),controls:controls.map(p=>p.map(text)),controlError:text(ce),chordError:text(le)});return;}
 if(d===depth)return refuse('DEPTH_CAP');const half=divide(one,two,ctx),levels=[weights];for(let level=0;level<3;level++)levels.push(levels[level].slice(0,-1).map((w,i)=>w.map((a,j)=>blend(a,levels[level][i+1][j],half))));const mid=divide(add(t0,t1,ctx),two,ctx);visit(levels.map(level=>level[0]),t0,mid,d+1);visit(levels.map(level=>level[level.length-1]).reverse(),mid,t1,d+1);
 };
 visit(span._weights,z,one,0);
 }
 const certificate={version:'algebraic-source-bridge-v1',field:'Qsqrt2sqrt3-positive',spans:spans.map(s=>({sourceFace:s.sourceFace,triangle:s.triangle,weights:s.weights,controls:s.controls,regularAxis:s.regularAxis})),segments};
 const result=verifyAlgebraicCertificate(certificate,sourceInput,ctx);if(result.status!=='PASS')return {status:'UNKNOWN',reason:result.reason};return {status:'PASS',reason:result.reason,certificate};
 }catch(e){if(e instanceof NumericsError)return {status:'UNKNOWN',reason:e.code};if(e instanceof Error&&['SCHEMA','LIMIT','FIELD','SIGN','UNSUPPORTED_SOURCE','WEIGHTS','SEGMENT_CAP','DEPTH_CAP'].includes(e.message))return {status:'UNKNOWN',reason:e.message};throw e;}
}
