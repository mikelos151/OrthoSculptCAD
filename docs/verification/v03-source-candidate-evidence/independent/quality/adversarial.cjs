'use strict';
// Bounded synthetic review witnesses; no repository writes or fabricated SHA successes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const out = __dirname;
const base = 'C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-parent/compiled';
const files = ['trimline/source-candidate.js', 'trimline/numerics.js', 'trimline/face-cubic.js', 'trimline/bezier.js', 'io/validation.js'];
const hashes = () => Object.fromEntries(files.map(f => [f, createHash('sha256').update(fs.readFileSync(path.join(base,f))).digest('hex')]));
const artifactHashesStart = hashes();
if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{ value:webcrypto,configurable:true });
const { createSourceCandidateStore:S } = require(path.join(base,'trimline/source-candidate.js'));
const N = require(path.join(base,'trimline/numerics.js'));
const results=[];
const stamp=()=>({projectEpoch:1,revision:2,generation:3,units:'mm',unitsConfirmed:true,frameId:'quality_1'});
const mesh=()=>({name:'synthetic 🦴',source:'synthetic',positions:new Float32Array([2,0,-0,3,0,0,2,1,0,2,0,1]),indices:new Uint32Array([0,2,1,0,1,3,1,2,3,2,0,3]),colors:new Float32Array(12).fill(.5),uvs:new Float32Array(8),textureUrl:'data:image/png;base64,AAAA'});
const ctx=(maxOperations=2000000)=>N.createArithmeticContext({maxBits:4096,maxOperations});
const store=(maxOwnedBufferBytes=4096)=>S({maxOwnedBufferBytes});
function error(code,name='SourceCandidateError') { return e=>{assert.equal(e.name,name);assert.equal(e.code,code);assert.equal(e.message,code);return true;}; }
function canonical(m,s=stamp()) {
 const chunks=[];const u8=n=>chunks.push(Buffer.from([n]));const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);chunks.push(b);};
 const text=t=>{const b=Buffer.from(t,'utf8');u32(b.length);chunks.push(b);};
 chunks.push(Buffer.from('OrthoSculptSourceCandidate\0'));u32(1);u32(m.positions.length/3);u32(m.indices.length/3);
 const raw=a=>{for(const n of new Uint32Array(a.buffer,a.byteOffset,a.length))u32(n);};
 raw(m.positions);raw(m.indices);for(const a of [m.colors,m.uvs]){u8(a===undefined?0:1);if(a)raw(a);}
 u8(m.source===undefined?0:m.source==='synthetic'?1:2);text(m.name);u8(m.textureUrl===undefined?0:1);if(m.textureUrl!==undefined)text(m.textureUrl);text(s.units);u8(1);text(s.frameId);return Buffer.concat(chunks);
}
const digest=(m,s)=>'sha256:'+createHash('sha256').update(canonical(m,s)).digest('hex');
const total=m=>canonical(m).length+[m.positions,m.indices,m.colors,m.uvs].reduce((n,a)=>n+(a?.byteLength??0),0);
function frozen(x) {if(!x||typeof x!=='object')return;assert(!ArrayBuffer.isView(x));assert(!(x instanceof ArrayBuffer));assert(Object.isFrozen(x));for(const k of Reflect.ownKeys(x)){const d=Object.getOwnPropertyDescriptor(x,k);assert('value' in d);frozen(d.value);}}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function check(id,fn){try{await fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',error:{name:e.name,message:e.message,stack:e.stack}});}}
async function main(){
 await check('ownership-exact-range-native-shadow-immunity',async()=>{
  const m=mesh(),s=stamp(),wanted=digest(m,s);let touched=0;
  for(const key of ['positions','indices','colors','uvs']){const a=m[key],b=new ArrayBuffer(a.byteLength+24);new Uint8Array(b).fill(255);new Uint8Array(b,12,a.byteLength).set(new Uint8Array(a.buffer));const v=new (key==='indices'?Uint32Array:Float32Array)(b,12,a.length);for(const k of ['buffer','length','byteOffset','byteLength','slice',Symbol.iterator,Symbol.toStringTag])Object.defineProperty(v,k,{get(){touched++;throw Error('shadow');}});m[key]=v;}
  const st=store();const p=st.capture(m,s);for(const key of ['positions','indices','colors','uvs'])for(let i=0;i<(key==='uvs'?8:12);i++)m[key][i]=0;s.revision=99;m.name='changed';const h=await p;assert.equal(st.describe(h).sourceDigest,wanted);assert.equal(st.describe(h).stamp.revision,2);assert.equal(touched,0);assert.equal(st.resolveFace(h,0,ctx()).positionBits[0][2],0x80000000);st.dispose();
 });
 await check('deep-frozen-no-buffer-no-private-mesh-publication',async()=>{
  const st=store(),h=await st.capture(mesh(),stamp()),c=ctx(),q=n=>N.rational(n,1n,c),row=[q(1n),q(0n),q(0n)],w=[row,row,row,row];
  const span=st.bindFaceCubic(h,0,w,c);for(const x of [h,st.describe(h),st.resolveFace(h,0,c),span])frozen(x);assert.deepEqual(Reflect.ownKeys(h),[]);assert.throws(()=>{span.face.vertexIDs[0]=99;},TypeError);assert.equal(span.containment.barycentricControls[0][0],row[0]);assert.notEqual(span.containment.barycentricControls[0],row);st.release(h);assert.equal(span.face.positionBits[0][2],0x80000000);st.dispose();
 });
 await check('private-authority-json-structuredclone-foreign-and-primitives',async()=>{
  const a=store(),b=store(),h=await a.capture(mesh(),stamp()),foreign=await b.capture(mesh(),stamp());assert.notEqual(a.describe(h).sourceId,b.describe(foreign).sourceId);
  for(const fake of [{},JSON.parse(JSON.stringify(h)),structuredClone(h),foreign,null,0,'x',Symbol('x')]){assert.throws(()=>a.describe(fake),error('INVALID_INPUT'));assert.throws(()=>a.resolveFace(fake,-1,null),error('INVALID_INPUT'));assert.throws(()=>a.bindFaceCubic(fake,-1,null,null),error('INVALID_INPUT'));assert.throws(()=>a.release(fake),error('INVALID_INPUT'));}a.dispose();b.dispose();
 });
 await check('busy-closed-authentication-error-priority-no-getters',async()=>{
  let touched=0;const hostile=Object.defineProperty({},'positions',{get(){touched++;throw Error('should not run');}});const st=store(),h=await st.capture(mesh(),stamp());await assert.rejects(st.capture(hostile,null),error('SOURCE_IN_USE'));st.release(h);assert.throws(()=>st.resolveFace(h,-1,null),error('STALE_SOURCE'));st.dispose();st.dispose();for(const fake of [h,{}]){assert.throws(()=>st.describe(fake),error('STALE_SOURCE'));assert.throws(()=>st.resolveFace(fake,-1,null),error('STALE_SOURCE'));assert.throws(()=>st.bindFaceCubic(fake,-1,null,null),error('STALE_SOURCE'));}st.release(h);assert.throws(()=>st.release({}),error('INVALID_INPUT'));await assert.rejects(st.capture(hostile,null),error('STALE_SOURCE'));assert.equal(touched,0);
 });
 await check('rejected-native-view-brands-and-buffer-lifetimes',async()=>{
  const st=store();const detached=new Float32Array(12);structuredClone(detached.buffer,{transfer:[detached.buffer]});const u=new Uint32Array(12);Object.setPrototypeOf(u,Float32Array.prototype);Object.defineProperty(u,Symbol.toStringTag,{value:'Float32Array'});
  const sab=new SharedArrayBuffer(48);Object.setPrototypeOf(sab,ArrayBuffer.prototype);
  const cases=[new Float32Array(new SharedArrayBuffer(48)),new Float32Array(sab),new Float32Array(new ArrayBuffer(48,{maxByteLength:96})),detached,new(class extends Float32Array{})(12),u,Object.create(Float32Array.prototype),new DataView(new ArrayBuffer(48))];
  for(const positions of cases)await assert.rejects(st.capture({...mesh(),positions},stamp()),error('INVALID_INPUT'));const h=await st.capture(mesh(),stamp());st.release(h);
 });
 await check('shape-descriptors-and-fixed-field-traversal',async()=>{
  const st=store();let touched=0;const getter=()=>{touched++;throw Error('getter');};for(const key of ['positions','indices','colors','uvs','name','source','textureUrl'])await assert.rejects(st.capture(Object.defineProperty(mesh(),key,{get:getter}),stamp()),error('INVALID_INPUT'));
  for(const key of Object.keys(stamp()))await assert.rejects(st.capture(mesh(),Object.defineProperty(stamp(),key,{get:getter})),error('INVALID_INPUT'));
  const m=mesh();Object.defineProperty(m,'irrelevant',{get:getter});Object.defineProperty(m,Symbol.iterator,{get:getter});const h=await st.capture(m,stamp());st.release(h);assert.equal(touched,0);
 });
 await check('whole-snapshot-validation-not-only-local-face',async()=>{
  const st=store();for(const edit of [m=>m.positions[11]=NaN,m=>m.positions[11]=Infinity,m=>m.indices[11]=4,m=>m.colors[11]=-1,m=>m.colors[11]=1.01,m=>m.uvs[7]=Infinity]){const m=mesh();edit(m);await assert.rejects(st.capture(m,stamp()),error('INVALID_INPUT'));}const h=await st.capture(mesh(),stamp());st.dispose();
 });
 await check('face-ordinal-before-context-controls-coercion',async()=>{
  const st=store(),h=await st.capture(mesh(),stamp());let touched=0;const f={valueOf(){touched++;throw Error('coercion');}},w=Object.defineProperty([],'0',{get(){touched++;throw Error('controls');}});for(const bad of [-1,.1,4,12,NaN,Infinity,'0',null,f]){assert.throws(()=>st.resolveFace(h,bad,null),error('INVALID_INPUT'));assert.throws(()=>st.bindFaceCubic(h,bad,w,null),error('INVALID_INPUT'));}assert.equal(touched,0);assert.deepEqual(st.resolveFace(h,3,ctx()).vertexIDs,[2,0,3]);st.dispose();
 });
 await check('same-context-exhaustion-and-original-error-classes',async()=>{
  const st=store(),h=await st.capture(mesh(),stamp()),small=ctx(1);assert.throws(()=>st.resolveFace(h,0,small),error('BUDGET_EXCEEDED','NumericsError'));assert.throws(()=>N.rational(0n,1n,small),error('BUDGET_EXCEEDED','NumericsError'));assert.throws(()=>st.bindFaceCubic(h,0,{},ctx()),error('INVALID_INPUT','FaceCubicError'));const c=ctx(),q=n=>N.rational(n,1n,c),row=[q(1n),q(0n),q(0n)],w=[row,row,row,row],limited=ctx(400);assert.throws(()=>st.bindFaceCubic(h,0,w,limited),error('BUDGET_EXCEEDED','NumericsError'));assert.throws(()=>N.rational(0n,1n,limited),error('BUDGET_EXCEEDED','NumericsError'));st.dispose();
 });
 await check('preallocation-whole-budget-direct-encodeInto',async()=>{
  const m=mesh();m.textureUrl='data:image/png;base64,'+'A'.repeat(128);const n=total(m),Native=ArrayBuffer,enc=TextEncoder.prototype.encode,alloc=[];
  globalThis.ArrayBuffer=new Proxy(Native,{construct(t,args){alloc.push(args[0]);return Reflect.construct(t,args);}});TextEncoder.prototype.encode=()=>{throw Error('unreserved encoded copy');};
  try{const tiny=store(n-1);await assert.rejects(tiny.capture(m,stamp()),error('BUDGET_EXCEEDED'));assert.deepEqual(alloc,[]);const st=store(n),h=await st.capture(m,stamp());assert.deepEqual(alloc,[48,48,48,32,canonical(m).length]);assert.equal(st.describe(h).sourceDigest,digest(m));st.release(h);alloc.length=0;const h2=await st.capture(m,stamp());assert.deepEqual(alloc,[48,48,48,32,canonical(m).length]);st.dispose();}finally{globalThis.ArrayBuffer=Native;TextEncoder.prototype.encode=enc;}
 });
 for(const failAt of [2,5])await check('allocation-failure-injection-rollback-'+failAt,async()=>{
  const m=mesh(),st=store(total(m)),Native=ArrayBuffer;let allocations=0;globalThis.ArrayBuffer=new Proxy(Native,{construct(t,args){if(++allocations===failAt)throw new RangeError('INJECTED private geometry paths');return Reflect.construct(t,args);}});
  try{await assert.rejects(st.capture(m,stamp()),error('UNAVAILABLE'));}finally{globalThis.ArrayBuffer=Native;}for(let i=0;i<3;i++){const h=await st.capture(m,stamp());st.release(h);st.release(h);}st.dispose();
 });
 for(const reject of [false,true])await check('dispose-pending-real-native-sha-failure-injection-'+reject,async()=>{
  const st=store(),native=crypto.subtle.digest.bind(crypto.subtle),original=crypto.subtle.digest,gate=defer(),nativeDone=defer();let nativeSettled=false,published=false,settled=false,submitted;
  crypto.subtle.digest=async(a,data)=>{submitted=Buffer.from(data);try{const value=await native(a,data);nativeSettled=true;nativeDone.resolve();await gate.promise;if(reject)throw Error('INJECTED native result rejection private coordinates');return value;}catch(e){nativeDone.resolve();throw e;}};
  try{const m=mesh(),expected=canonical(m);const p=st.capture(m,stamp());const observed=p.then(h=>{published=true;settled=true;return h;},e=>{settled=true;throw e;});const refused=assert.rejects(observed,error('STALE_SOURCE'));assert.equal(nativeSettled,false);st.dispose();st.dispose();m.positions.fill(99);await nativeDone.promise;assert.equal(nativeSettled,true);assert.deepEqual(submitted,expected);await Promise.resolve();assert.equal(settled,false);await assert.rejects(st.capture(null,null),error('STALE_SOURCE'));gate.resolve();await refused;assert.equal(published,false);assert.equal(settled,true);}finally{gate.resolve();crypto.subtle.digest=original;}
 });
 await check('h1-release-while-h2-pending-cannot-retire-h2-or-clear-busy',async()=>{
  const m=mesh(),st=store(total(m)),h1=await st.capture(m,stamp());st.release(h1);const native=crypto.subtle.digest.bind(crypto.subtle),original=crypto.subtle.digest,gate=defer(),done=defer();let calls=0;
  crypto.subtle.digest=async(a,data)=>{calls++;const r=await native(a,data);done.resolve();await gate.promise;return r;};
  try{const p2=st.capture(m,stamp());st.release(h1);st.release(h1);await assert.rejects(st.capture(null,null),error('SOURCE_IN_USE'));await done.promise;st.release(h1);await assert.rejects(st.capture(null,null),error('SOURCE_IN_USE'));assert.equal(calls,1);gate.resolve();const h2=await p2;assert.equal(st.describe(h2).sourceDigest,digest(m));st.release(h1);assert.equal(st.describe(h2).sourceDigest,digest(m));st.release(h2);}finally{gate.resolve();crypto.subtle.digest=original;}const h3=await st.capture(m,stamp());assert.equal(st.describe(h3).sourceDigest,digest(m));st.dispose();
 });
 for(const stage of ['throw','reject'])await check('sha-operational-failure-injection-sanitized-rollback-'+stage,async()=>{
  const m=mesh(),st=store(total(m)),original=crypto.subtle.digest;crypto.subtle.digest=()=>{if(stage==='throw')throw Error('INJECTED secrets paths');return Promise.reject(Error('INJECTED secrets paths'));};try{await assert.rejects(st.capture(m,stamp()),error('UNAVAILABLE'));}finally{crypto.subtle.digest=original;}const h=await st.capture(m,stamp());assert.equal(st.describe(h).sourceDigest,digest(m));st.dispose();
 });
 await check('validator-allocation-failure-injection-remains-operational',async()=>{
  const st=store(),original=Number.isFinite;let once=true;Number.isFinite=x=>{if(once){once=false;throw new RangeError('INJECTED allocation');}return original(x);};try{await assert.rejects(st.capture(mesh(),stamp()),error('UNAVAILABLE'));}finally{Number.isFinite=original;}const h=await st.capture(mesh(),stamp());st.dispose();
 });
 const artifactHashesEnd=hashes();assert.deepEqual(artifactHashesEnd,artifactHashesStart);
 const report={scope:'M0c3a bounded synthetic security/lifecycle/resource witnesses only',runtime:{node:process.version,nodeOptions:process.env.NODE_OPTIONS},artifactHashesStart,artifactHashesEnd,total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results,limitations:['No full suite, browser, whole-project compiler, real patient data, admission, RSS/GC proof or native cancellation claim.','Native SHA gates are test-only delay wrappers; rejected hash/allocation/validator cases are explicitly failure injection.','Runtime artifacts supplied by parent; this run does not claim their original compile was clean.','Reservation internals and weak-retired nonretention additionally audited statically, not externally introspected.']};fs.writeFileSync(path.join(out,'adversarial-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
