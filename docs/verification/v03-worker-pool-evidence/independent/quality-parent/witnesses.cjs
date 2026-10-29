'use strict';
// Independent UNIT transport doubles; no native Worker/browser evidence is claimed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createWorkerPool} = require('./compiled/workerPool.js');
const {createResourceLedger} = require('./compiled/resourceLedger.js');
const limits = {managed:128, job:96, history:64};
const plan = [{key:'tiny', bytes:8, category:'job'}];
const rows = [];
let assertions = 0;
function eq(a,b) { assertions++; assert.deepStrictEqual(a,b); }
function yes(a) { assertions++; assert.ok(a); }
function err(fn, code) { assertions++; assert.throws(fn, e => e?.code === code); }
function thrown(fn, message) { assertions++; assert.throws(fn, {message}); }
function ok(v) { yes(v && !('code' in v)); return v; }
function test(id, fn) {
  const start=assertions;
  try { fn(); rows.push({id, passed:true, assertions:assertions-start}); }
  catch(e) { rows.push({id, passed:false, assertions:assertions-start, error:e.stack}); }
  console.log(JSON.stringify(rows.at(-1)));
}
class UnitWorker extends EventTarget {
  constructor() { super(); this.terminated=0; this.sends=0; this.callbacks={}; this.listeners=new Map(); }
  addEventListener(type, cb, options) {
    (this.callbacks[type] ??= []).push(cb);
    const set=this.listeners.get(type)??new Set(); set.add(cb); this.listeners.set(type,set);
    return super.addEventListener(type,cb,options);
  }
  removeEventListener(type, cb, options) { this.listeners.get(type)?.delete(cb); return super.removeEventListener(type,cb,options); }
  terminate() { this.terminated++; }
  postMessage() { this.sends++; throw Error('UNEXPECTED SEND'); }
}
function fixture(ctor, options={}) {
  const workers=[]; let allocations=0;
  const ledger=createResourceLedger(limits,{...options, allocate:n=>{ allocations++; return new ArrayBuffer(n); }});
  const pool=createWorkerPool(ledger,kind=>{
    const w=ctor?ctor(kind,workers,pool,ledger):new UnitWorker(); workers.push(w); return w;
  });
  return {ledger,pool,workers,allocations:()=>allocations};
}
function state(f) { return {pool:f.pool.snapshot(),ledger:f.ledger.snapshot(),terminated:f.workers.map(w=>w.terminated)}; }

test('01-same-ledger-full-reservation-before-factory-owner-not-caller-data',()=>{
  let calls=0;
  const f=fixture((kind,ws,pool,ledger)=>{ calls++; eq(kind,'owner'); eq(ledger.snapshot().managed,12); eq(ledger.snapshot().history,4); eq(ledger.snapshot().allocations.map(a=>a.phase),['reserved','reserved']); return new UnitWorker(); });
  const p=[{key:'one',bytes:8,category:'job',owner:{}},{key:'two',bytes:4,category:'history',owner:'fake-realm'}];
  const h=ok(f.pool.acquire('owner',p)); eq(calls,1); eq(f.ledger.snapshot().allocations.map(a=>a.realm),[2,2]);
  eq(p[0].owner,{}); eq(p[1].owner,'fake-realm'); eq(f.allocations(),0); f.pool.release(h); eq(f.ledger.snapshot().managed,0);
});
test('02-forged-cloned-foreign-proxy-diagnostic-handles-atomic',()=>{
  const f=fixture(), other=fixture(); const h=ok(f.pool.acquire('compute',plan)); const foreign=ok(other.pool.acquire('display',plan));
  const before=state(f);
  const hostile=new Proxy({}, {get(){throw Error('must not read forged properties');}});
  for(const bad of [undefined,null,false,1,1n,Symbol('x'),'h',{},[],()=>{},new Proxy(h,{}),hostile,structuredClone(h),JSON.parse(JSON.stringify(h)),foreign,f.pool.snapshot(),f.pool.snapshot().slots[0],{ordinal:0,incarnation:1,generation:1}]) {
    err(()=>f.pool.release(bad),'INVALID_INPUT'); eq(state(f),before);
  }
  eq(Reflect.ownKeys(h),[]); yes(Object.isFrozen(h)); f.pool.release(h); other.pool.dispose();
});
test('03-authentication-priority-after-dispose-and-retired-idempotency',()=>{
  const f=fixture(); const h=ok(f.pool.acquire('compute',plan)); f.pool.dispose(); const before=state(f);
  f.pool.release(h); f.pool.release(h); f.pool.dispose(); eq(state(f),before);
  for(const bad of [{},structuredClone(h),null]) err(()=>f.pool.release(bad),'INVALID_INPUT');
  err(()=>f.pool.acquire('compute',plan),'CLOSED');
});
test('04-method-receiver-is-not-authority-closure-handle-both-required',()=>{
  const f=fixture(), other=fixture(); const h=ok(f.pool.acquire('compute',plan)); const foreign=ok(other.pool.acquire('display',plan));
  const release=f.pool.release; release.call(other.pool,h); eq(f.workers[0].terminated,1);
  err(()=>release.call(other.pool,foreign),'INVALID_INPUT'); eq(other.workers[0].terminated,0); other.pool.dispose();
});
test('05-busy-zero-plan-read-constructor-reserve-copy-send',()=>{
  const f=fixture(); ok(f.pool.acquire('owner',plan)); ok(f.pool.acquire('index',plan)); const before=state(f);
  const unread=new Proxy([], {get(){throw Error('BUSY read plan');}});
  eq(f.pool.acquire('display',unread),{ok:false,code:'BUSY'}); eq(state(f),before); eq(f.allocations(),0); eq(f.workers.map(w=>w.sends),[0,0]); f.pool.dispose();
});
test('06-starting-occupied-nested-factory-cannot-start-third',()=>{
  let constructors=0, inner;
  const f=fixture((kind,ws,pool,ledger)=>{
    constructors++; if(constructors===1){ eq(pool.snapshot().occupied,1); eq(pool.snapshot().slots[0].phase,'STARTING'); inner=ok(pool.acquire('display',plan)); }
    else { eq(pool.snapshot().occupied,2); eq(ledger.snapshot().managed,16); eq(pool.acquire('owner',plan),{ok:false,code:'BUSY'}); }
    return new UnitWorker();
  });
  const outer=ok(f.pool.acquire('compute',plan)); eq(constructors,2); eq(f.pool.snapshot().occupied,2); f.pool.release(inner); f.pool.release(outer); eq(f.ledger.snapshot().managed,0);
});
test('07-constructor-throw-rolls-back-only-own-reservation',()=>{
  const ledger=createResourceLedger(limits), r=ledger.createRealm(); const external=ledger.reserve([{key:'external',bytes:4,category:'history',owner:r}]);
  const b=external.allocateBuffer(external.ref('external')); const before=ledger.snapshot(); let fail=true;
  const pool=createWorkerPool(ledger,()=>{if(fail)throw Error('ctor');return new UnitWorker();});
  thrown(()=>pool.acquire('compute',plan),'ctor'); eq(ledger.snapshot(),before); eq(pool.snapshot().occupied,0); eq(b.byteLength,4);
  fail=false; ok(pool.acquire('compute',plan)); ok(pool.acquire('display',plan)); pool.dispose(); eq(ledger.snapshot(),before); external.close();
});
test('08-outer-constructor-throw-preserves-successful-reentrant-inner',()=>{
  let calls=0, inner;
  const f=fixture((kind,ws,pool)=>{if(++calls===1){inner=ok(pool.acquire('index',plan));throw Error('outer');}return new UnitWorker();});
  thrown(()=>f.pool.acquire('compute',plan),'outer'); eq(f.pool.snapshot().occupied,1); eq(f.ledger.snapshot().managed,8); eq(f.workers[0].terminated,0);
  ok(f.pool.acquire('display',plan)); f.pool.release(inner); eq(f.ledger.snapshot().managed,8); f.pool.dispose();
});
test('09-dispose-during-starting-return-prevents-lease-publication',()=>{
  const w=new UnitWorker(); const f=fixture((kind,ws,pool,ledger)=>{pool.dispose();eq(pool.snapshot().slots[0].phase,'REVOKING');eq(ledger.snapshot().managed,8);err(()=>pool.acquire('display',[]),'CLOSED');return w;});
  err(()=>f.pool.acquire('compute',plan),'CLOSED'); eq(w.terminated,1); eq(f.ledger.snapshot().managed,0); eq(f.pool.snapshot().occupied,0); f.pool.dispose(); eq(w.terminated,1);
});
test('10-dispose-during-starting-then-factory-throw',()=>{
  const f=fixture((kind,ws,pool)=>{pool.dispose();throw Error('ctor-disposed');});
  thrown(()=>f.pool.acquire('compute',plan),'ctor-disposed'); eq(f.pool.snapshot().disposed,true); eq(f.pool.snapshot().occupied,0); eq(f.ledger.snapshot().managed,0);
});
test('11-dispose-with-two-nested-starting-bindings',()=>{
  const workers=[]; let calls=0;
  const f=fixture((kind,ws,pool)=>{const w=new UnitWorker();workers.push(w);if(++calls===1){err(()=>pool.acquire('owner',plan),'CLOSED');}else pool.dispose();return w;});
  err(()=>f.pool.acquire('compute',plan),'CLOSED'); eq(workers.map(w=>w.terminated),[1,1]); eq(f.pool.snapshot().occupied,0); eq(f.ledger.snapshot().managed,0);
});
test('12-budget-category-global-and-safe-integer-atomic-no-constructor',()=>{
  const f=fixture(); const h=ok(f.pool.acquire('compute',plan)); const before=state(f);
  for(const p of [[{key:'x',bytes:89,category:'job'}],[{key:'x',bytes:65,category:'history'}],[{key:'x',bytes:121,category:'resident'}],[{key:'x',bytes:Number.MAX_SAFE_INTEGER,category:'resident'},{key:'y',bytes:1,category:'resident'}]]) {
    eq(f.pool.acquire('owner',p),{ok:false,code:'BUDGET'}); eq(state(f),before);
  }
  ok(f.pool.acquire('index',[])); eq(f.workers.length,2); f.pool.release(h); f.pool.dispose();
});
test('13-malformed-dense-sparse-plans-atomic',()=>{
  const f=fixture(); const before=state(f); const sparse=[...plan]; sparse.length=3; sparse[2]={...plan[0],key:'unique'};
  const ps=[null,{},[null],[undefined],sparse,[{...plan[0],bytes:-1}],[{...plan[0],bytes:0.25}],[{...plan[0],bytes:Infinity}],[{...plan[0],bytes:NaN}],[{...plan[0],bytes:Number.MAX_SAFE_INTEGER+1}],[{...plan[0],key:''}],[{...plan[0],key:'x'.repeat(129)}],[plan[0],{...plan[0]}],[{...plan[0],category:'constructor'}]];
  for(const p of ps){err(()=>f.pool.acquire('compute',p),'INVALID_INPUT');eq(state(f),before);}
  for(const role of ['fake','__proto__',null,{},1]){err(()=>f.pool.acquire(role,plan),'INVALID_INPUT');eq(state(f),before);}
  const h=ok(f.pool.acquire('owner',plan)); f.pool.release(h);
});
test('14-plan-cardinality-bound-zero-byte-records',()=>{
  const f=fixture(); const p=Array.from({length:17},(_,i)=>({key:'key'+i,bytes:0,category:'resident'})); const before=state(f);
  eq(f.pool.acquire('compute',p),{ok:false,code:'BUDGET'}); eq(state(f),before); const h=ok(f.pool.acquire('compute',p.slice(0,16))); eq(f.ledger.snapshot().allocations.length,16); f.pool.release(h); eq(f.ledger.snapshot().allocations.length,0);
});
test('15-eighty-incarnations-no-new-domains-or-control-limit-bump',()=>{
  const f=fixture(undefined,{controls:{maxRealms:3,maxLeases:2,maxRefs:2}}); const anchor=ok(f.pool.acquire('owner',plan)); const realms=new Set();
  let generation=1;
  for(let i=0;i<80;i++) {const h=ok(f.pool.acquire('index',plan)); const s=f.pool.snapshot();eq(s.ownershipDomains,3);eq(s.occupied,2);yes(s.slots[1].generation>generation);generation=s.slots[1].generation;eq(s.slots[1].incarnation,i+1);for(const a of f.ledger.snapshot().allocations)realms.add(a.realm);f.pool.release(h);f.pool.release(h);eq(f.ledger.snapshot().managed,8);}
  eq([...realms].sort(),[2,3]);err(()=>f.ledger.createRealm(),'BUDGET');f.pool.release(anchor);eq(f.ledger.snapshot().managed,0);eq(f.workers.length,81);yes(f.workers.every(w=>w.terminated===1));
});
test('16-exact-worker-object-reuse-rejected-without-terminating-valid-binding',()=>{
  const w=new UnitWorker(); const f=fixture(()=>w); const h=ok(f.pool.acquire('compute',plan)), before=state(f);
  err(()=>f.pool.acquire('owner',plan),'INVALID_INPUT'); eq(f.ledger.snapshot(),before.ledger); eq(f.pool.snapshot().occupied,1); eq(w.terminated,0);
  f.pool.release(h);err(()=>f.pool.acquire('display',plan),'INVALID_INPUT');eq(w.terminated,1);eq(f.ledger.snapshot().managed,0);eq(f.pool.snapshot().occupied,0);
});
for(const eventType of ['error','messageerror']) test('17-'+eventType+'-captured-old-callback-has-zero-new-lease-effects',()=>{
  const f=fixture();const h1=ok(f.pool.acquire('index',plan)), w1=f.workers[0], old=w1.callbacks[eventType][0];
  w1.dispatchEvent(new Event(eventType));eq(w1.terminated,1);eq(f.pool.snapshot().occupied,0);eq(w1.listeners.get('error').size,0);eq(w1.listeners.get('messageerror').size,0);
  const h2=ok(f.pool.acquire('display',plan)), before=state(f);old(new Event(eventType));f.pool.release(h1);eq(state(f),before);eq(f.workers[1].terminated,0);f.pool.release(h2);
});
test('18-reentrant-release-holds-revoking-slot-and-revoked-authority',()=>{
  let h1, calls=0;const f=fixture((kind,ws,pool,ledger)=>{const w=new UnitWorker();w.terminate=()=>{w.terminated++;if(++calls===1){pool.release(h1);eq(pool.snapshot().slots[0].phase,'REVOKING');eq(ledger.snapshot().managed,16);eq(pool.acquire('owner',[]),{ok:false,code:'BUSY'});}};return w;});
  h1=ok(f.pool.acquire('compute',plan));ok(f.pool.acquire('display',plan));f.pool.release(h1);eq(f.workers.map(w=>w.terminated),[1,0]);eq(f.ledger.snapshot().managed,8);f.pool.dispose();
});
test('19-terminate-throw-revokes-auth-retains-charge-and-failed-slot-no-retry',()=>{
  const f=fixture(()=>{const w=new UnitWorker();w.terminate=()=>{w.terminated++;throw Error('terminate');};return w;});const h=ok(f.pool.acquire('owner',plan));ok(f.pool.acquire('index',plan));const before=f.ledger.snapshot();
  thrown(()=>f.pool.release(h),'terminate');eq(f.pool.snapshot().slots[0].phase,'FAILED');eq(f.ledger.snapshot(),before);f.pool.release(h);eq(f.workers[0].terminated,1);eq(f.pool.acquire('display',[]),{ok:false,code:'BUSY'});thrown(()=>f.pool.dispose(),'terminate');eq(f.workers.map(w=>w.terminated),[1,1]);eq(f.ledger.snapshot().managed,16);
});
test('20-dispose-revokes-all-authority-before-listener-teardown',()=>{
  let h1,h2, first=true;const f=fixture((kind,ws,pool)=>{const w=new UnitWorker();const remove=w.removeEventListener.bind(w);w.removeEventListener=(...args)=>{if(first){first=false;pool.release(h1);pool.release(h2);eq(ws.map(w=>w.terminated),[0,0]);err(()=>pool.acquire('owner',[]),'CLOSED');}return remove(...args);};return w;});
  h1=ok(f.pool.acquire('compute',plan));h2=ok(f.pool.acquire('display',plan));f.pool.dispose();eq(f.workers.map(w=>w.terminated),[1,1]);eq(f.ledger.snapshot().managed,0);
});
test('21-dispose-continues-other-cleanup-after-first-terminate-throw',()=>{
  const f=fixture((kind,ws)=>{const w=new UnitWorker();if(ws.length===0)w.terminate=()=>{w.terminated++;throw Error('first');};return w;});const h1=ok(f.pool.acquire('compute',plan)),h2=ok(f.pool.acquire('display',plan));
  thrown(()=>f.pool.dispose(),'first');eq(f.workers.map(w=>w.terminated),[1,1]);eq(f.pool.snapshot().slots.map(s=>s.phase),['FAILED','FREE']);eq(f.ledger.snapshot().managed,8);f.pool.release(h1);f.pool.release(h2);f.pool.dispose();eq(f.workers.map(w=>w.terminated),[1,1]);
});
test('22-partial-listener-install-throw-removes-first-listener-and-rolls-back',()=>{
  const w=new UnitWorker(), add=w.addEventListener.bind(w);w.addEventListener=(type,...args)=>{if(type==='messageerror')throw Error('install-second');return add(type,...args);};const f=fixture(()=>w);
  thrown(()=>f.pool.acquire('index',plan),'install-second');eq(w.terminated,1);eq(w.listeners.get('error').size,0);eq(f.pool.snapshot().occupied,0);eq(f.ledger.snapshot().managed,0);
});
test('23-error-callback-terminate-throw-fail-closed-without-retry',()=>{
  const w=new UnitWorker();w.terminate=()=>{w.terminated++;throw Error('error-cleanup');};const f=fixture(()=>w);const h=ok(f.pool.acquire('compute',plan));const cb=w.callbacks.error[0];cb(new Event('error'));eq(f.pool.snapshot().slots[0].phase,'FAILED');eq(f.ledger.snapshot().managed,8);f.pool.release(h);cb(new Event('error'));eq(w.terminated,1);f.pool.dispose();eq(w.terminated,1);
});
test('24-terminate-can-reentrantly-acquire-only-other-free-slot',()=>{
  let other,first=true;const f=fixture((kind,ws,pool,ledger)=>{const w=new UnitWorker();w.terminate=()=>{w.terminated++;if(first){first=false;eq(pool.snapshot().occupied,1);eq(ledger.snapshot().managed,8);other=ok(pool.acquire('owner',plan));eq(pool.snapshot().occupied,2);eq(pool.acquire('display',plan),{ok:false,code:'BUSY'});}};return w;});
  const h=ok(f.pool.acquire('compute',plan));f.pool.release(h);eq(f.pool.snapshot().occupied,1);eq(f.ledger.snapshot().managed,8);eq(f.workers.map(w=>w.terminated),[1,0]);f.pool.release(other);
});
test('25-retired-h1-release-during-new-h2-starting-does-not-cancel-new-work',()=>{
  let h1,again=false;const f=fixture((kind,ws,pool,ledger)=>{if(again){const before={pool:pool.snapshot(),ledger:ledger.snapshot()};pool.release(h1);eq({pool:pool.snapshot(),ledger:ledger.snapshot()},before);eq(pool.snapshot().slots[0].phase,'STARTING');}return new UnitWorker();});
  h1=ok(f.pool.acquire('index',plan));f.pool.release(h1);again=true;const h2=ok(f.pool.acquire('index',plan));eq(f.workers.map(w=>w.terminated),[1,0]);eq(f.ledger.snapshot().managed,8);f.pool.release(h2);
});
test('26-public-values-deep-frozen-diagnostics-only-no-worker-resource-nonce',()=>{
  const f=fixture();eq(Object.keys(f.pool).sort(),['acquire','dispose','release','snapshot']);yes(Object.isFrozen(f.pool));const h=ok(f.pool.acquire('owner',plan));eq(Reflect.ownKeys(h),[]);
  const s=f.pool.snapshot();yes(Object.isFrozen(s));yes(Object.isFrozen(s.slots));eq(Object.keys(s).sort(),['disposed','occupied','ownershipDomains','slots']);for(const x of s.slots){yes(Object.isFrozen(x));eq(Object.keys(x).sort(),['generation','incarnation','ordinal','phase']);}eq(f.allocations(),0);eq(f.workers[0].sends,0);f.pool.dispose();
});
test('27-plain-prototype-pollution-shaped-fields-cannot-set-owner-authority',()=>{
  const f=fixture();const p=JSON.parse('[{"key":"__proto__","bytes":1,"category":"resident","owner":{"realm":999},"__proto__":{"injected":true}}]');
  const h=ok(f.pool.acquire('compute',p));eq(f.ledger.snapshot().allocations[0].realm,2);eq({}.injected,undefined);f.pool.release(h);eq(f.ledger.snapshot().managed,0);
});
test('28-dispose-during-starting-and-late-terminate-throw-retains-unpublished-binding',()=>{
  const w=new UnitWorker();w.terminate=()=>{w.terminated++;throw Error('late-start-terminate');};const f=fixture((kind,ws,pool)=>{pool.dispose();return w;});
  thrown(()=>f.pool.acquire('owner',plan),'late-start-terminate');eq(f.pool.snapshot().disposed,true);eq(f.pool.snapshot().occupied,1);eq(f.pool.snapshot().slots[0].phase,'FAILED');eq(f.ledger.snapshot().managed,8);f.pool.dispose();eq(w.terminated,1);err(()=>f.pool.acquire('display',[]),'CLOSED');
});
const summary={kind:'independent actual production API UNIT witnesses; EventTarget doubles, NOT native Worker',node:process.version,tests:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,assertions,rows};
fs.writeFileSync(path.join(__dirname,'witness-results.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({tests:summary.tests,passed:summary.passed,failed:summary.failed,assertions}));
process.exitCode=summary.failed?1:0;
