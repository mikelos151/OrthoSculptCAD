import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const { createWorkerPool }=require('./compiled/workerPool.js');
const { createResourceLedger }=require('./compiled/resourceLedger.js');
const checks=[];
function witness(name,run){run(); checks.push({name,passed:true});}
const limits={managed:97,job:61,history:49};
const plan=(bytes=7,category='job')=>[{key:'one',bytes,category}];
const accept=h=>{assert.equal('code' in h,false); return h;};
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code);
// Explicit UNIT doubles: real pool and ledger, NOT a native Worker claim.
class UnitWorker extends EventTarget {
  terminates=0; captured=[];
  terminate(){this.terminates++;}
  addEventListener(type,fn,opts){this.captured.push([type,fn]);super.addEventListener(type,fn,opts);}
}
function setup(options={}){
 const ledger=createResourceLedger(limits,options), ws=[];
 const pool=createWorkerPool(ledger,()=>{const w=new UnitWorker();ws.push(w);return w;});
 return {pool,ledger,ws};
}
witness('reserve whole 16-entry mixed-category plan before exact constructor; third never reads plan',()=>{
 const ledger=createResourceLedger(limits);let calls=0;const ws=[];
 const p=Array.from({length:16},(_,i)=>({key:'k'+i,bytes:1,category:i%2?'history':'job'}));
 const pool=createWorkerPool(ledger,()=>{calls++;assert.equal(ledger.snapshot().managed,16*calls);const w=new UnitWorker();ws.push(w);return w;});
 accept(pool.acquire('compute',p));accept(pool.acquire('owner',p));
 const before=ledger.snapshot();const toxic=new Proxy([], {get(){throw Error('BUSY touched plan');}});
 assert.deepEqual(pool.acquire('index',toxic),{ok:false,code:'BUSY'});assert.deepEqual(ledger.snapshot(),before);assert.equal(calls,2);pool.dispose();
 assert.deepEqual(ws.map(w=>w.terminates),[1,1]);
});
witness('STARTING plus nested IDLE consume both slots before returning factories',()=>{
 const ledger=createResourceLedger(limits);let calls=0,inner;let pool;
 pool=createWorkerPool(ledger,()=>{calls++;assert.equal(pool.snapshot().slots[0].phase,'STARTING');if(calls===1)inner=accept(pool.acquire('display',plan()));else assert.deepEqual(pool.acquire('index',[]),{ok:false,code:'BUSY'});return new UnitWorker();});
 const first=accept(pool.acquire('compute',plan()));assert.equal(calls,2);pool.release(first);pool.release(inner);assert.equal(ledger.snapshot().managed,0);
});
witness('BUDGET and constructor throw preserve independent actual materialized source bytes and refs',()=>{
 const ledger=createResourceLedger(limits), realm=ledger.createRealm();const ext=ledger.reserve([{key:'source',bytes:11,category:'resident',owner:realm}]);
 const buf=ext.allocateBuffer(ext.ref('source'));new Uint8Array(buf).fill(73);const before=ledger.snapshot();let calls=0;
 const pool=createWorkerPool(ledger,()=>{calls++;throw Error('constructor-unit');});
 assert.deepEqual(pool.acquire('owner',plan(62)),{ok:false,code:'BUDGET'});assert.equal(calls,0);assert.deepEqual(ledger.snapshot(),before);
 assert.throws(()=>pool.acquire('compute',plan()),/constructor-unit/);assert.deepEqual(ledger.snapshot(),before);assert.deepEqual([...new Uint8Array(buf)],Array(11).fill(73));assert.equal(pool.snapshot().occupied,0);ext.close();
});
witness('retired/foreign/JSON/clone/snapshot handles never change a newer binding',()=>{
 const {pool,ledger,ws}=setup();const old=accept(pool.acquire('owner',plan()));pool.release(old);const fresh=accept(pool.acquire('index',plan()));
 const other=setup();const foreign=accept(other.pool.acquire('compute',[]));const before=ledger.snapshot();
 for(const bad of [{},null,17,JSON.parse(JSON.stringify(fresh)),structuredClone(fresh),foreign,pool.snapshot(),pool.snapshot().slots[0]])throws(()=>pool.release(bad),'INVALID_INPUT');
 pool.release(old);old && assert.equal(ws[0].terminates,1);assert.equal(ws[1].terminates,0);assert.deepEqual(ledger.snapshot(),before);pool.dispose();other.pool.dispose();
});
witness('actual captured late callbacks have zero newer-binding effects after same-slot reuse',()=>{
 const {pool,ledger,ws}=setup();const old=accept(pool.acquire('compute',plan()));const captured=ws[0].captured.map(x=>x[1]);ws[0].dispatchEvent(new Event('messageerror'));
 assert.equal(ws[0].terminates,1);const fresh=accept(pool.acquire('display',plan()));const before=ledger.snapshot(),snap=pool.snapshot();
 for(const cb of captured)cb(new Event('error'));pool.release(old);assert.deepEqual(ledger.snapshot(),before);assert.deepEqual(pool.snapshot(),snap);assert.equal(ws[1].terminates,0);pool.release(fresh);
});
witness('dispose revokes BOTH handles before first native-effect stand-in and REVOKING is occupied',()=>{
 const {pool,ledger,ws}=setup();const a=accept(pool.acquire('owner',plan())),b=accept(pool.acquire('index',plan()));
 ws[0].terminate=()=>{ws[0].terminates++;assert.equal(pool.snapshot().occupied,2);assert.equal(pool.snapshot().slots[0].phase,'REVOKING');pool.release(b);assert.equal(ws[1].terminates,0);throws(()=>pool.acquire('compute',[]),'CLOSED');};
 pool.dispose();pool.dispose();pool.release(a);pool.release(b);assert.deepEqual(ws.map(w=>w.terminates),[1,1]);assert.equal(ledger.snapshot().managed,0);
});
witness('terminate failure retains FAILED slot and charge forever without retry; disposal still cleans other slot',()=>{
 const {pool,ledger,ws}=setup();const a=accept(pool.acquire('owner',plan())),b=accept(pool.acquire('index',plan()));
 ws[0].terminate=()=>{ws[0].terminates++;throw Error('unit-terminate');};assert.throws(()=>pool.release(a),/unit-terminate/);pool.release(a);
 assert.equal(ws[0].terminates,1);assert.equal(pool.snapshot().slots[0].phase,'FAILED');assert.equal(ledger.snapshot().managed,14);assert.deepEqual(pool.acquire('display',[]),{ok:false,code:'BUSY'});
 pool.dispose();pool.release(b);assert.equal(ws[0].terminates,1);assert.equal(ws[1].terminates,1);assert.equal(ledger.snapshot().managed,7);assert.equal(pool.snapshot().occupied,1);
});
witness('dispose during nested STARTING blocks publication, terminates both returned exact objects once',()=>{
 const ledger=createResourceLedger(limits);const ws=[];let pool;
 pool=createWorkerPool(ledger,()=>{const w=new UnitWorker();ws.push(w);if(ws.length===1) {throws(()=>pool.acquire('index',plan()),'CLOSED');}else pool.dispose();return w;});
 throws(()=>pool.acquire('owner',plan()),'CLOSED');assert.deepEqual(ws.map(w=>w.terminates),[1,1]);assert.equal(ledger.snapshot().managed,0);assert.equal(pool.snapshot().occupied,0);
});
witness('dispose then constructor throw rolls back own reservation and publishes nothing',()=>{
 const ledger=createResourceLedger(limits);let pool;pool=createWorkerPool(ledger,()=>{pool.dispose();throw Error('after-dispose');});
 assert.throws(()=>pool.acquire('owner',plan()),/after-dispose/);assert.equal(ledger.snapshot().managed,0);assert.equal(pool.snapshot().occupied,0);assert.equal(pool.snapshot().disposed,true);
});
witness('three stable domains survive 80 admitted incarnations under maxRealms=3',()=>{
 const {pool,ledger,ws}=setup({controls:{maxRealms:3,maxLeases:2,maxRefs:2}});const anchor=accept(pool.acquire('owner',plan()));const domains=new Set(ledger.snapshot().allocations.map(a=>a.realm));
 for(let i=0;i<80;i++){const h=accept(pool.acquire('index',plan()));for(const a of ledger.snapshot().allocations)domains.add(a.realm);pool.release(h);}
 assert.equal(domains.size,2);assert.equal(pool.snapshot().slots[1].incarnation,80);throws(()=>ledger.createRealm(),'BUDGET');pool.release(anchor);assert.equal(ledger.snapshot().managed,0);assert.equal(ws.length,81);assert.equal(ws.reduce((s,w)=>s+w.terminates,0),81);
});
witness('diagnostics recursively frozen and contain only non-authoritative scalar fields',()=>{
 const {pool}=setup();const h=accept(pool.acquire('owner',[])),s=pool.snapshot();assert(Object.isFrozen(pool));assert(Object.isFrozen(h));assert.deepEqual(Reflect.ownKeys(h),[]);
 assert(Object.isFrozen(s));assert(Object.isFrozen(s.slots));for(const slot of s.slots){assert(Object.isFrozen(slot));assert.deepEqual(Object.keys(slot).sort(),['generation','incarnation','ordinal','phase']);}pool.dispose();
});
// Independent finite graph: no imitation of production binding records/weak maps.
let seed=0x35fab1;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};let steps=0;
witness('360 deterministic actual-API transitions agree with independent tiny ownership-counter graph',()=>{
 const {pool,ledger,ws}=setup();const graph=new Map(),retired=[];
 for(let i=0;i<360;i++){
  const op=rand(5);
  if(op<3){const bytes=rand(42),category=['resident','job','history'][rand(3)],sums={managed:0,job:0,history:0};for(const x of graph.values()){sums.managed+=x.bytes;if(x.category!=='resident')sums[x.category]+=x.bytes;}
   const expected=graph.size===2?'BUSY':sums.managed+bytes>limits.managed || (category!=='resident'&&sums[category]+bytes>limits[category])?'BUDGET':null;
   const count=ws.length;const h=pool.acquire(['compute','display','index','owner'][rand(4)],plan(bytes,category));if(expected){assert.equal(h.code,expected);assert.equal(ws.length,count);}else{accept(h);graph.set(h,{bytes,category,w:ws.at(-1)});}
  }else if(op===3&&graph.size){const h=[...graph.keys()][rand(graph.size)];pool.release(h);assert.equal(graph.get(h).w.terminates,1);graph.delete(h);retired.push(h);}
  else if(retired.length){pool.release(retired[rand(retired.length)]);}
  const sums={managed:0,job:0,history:0};for(const x of graph.values()){sums.managed+=x.bytes;if(x.category!=='resident')sums[x.category]+=x.bytes;assert.equal(x.w.terminates,0);}
  const ls=ledger.snapshot();for(const k of Object.keys(sums))assert.equal(ls[k],sums[k]);assert.equal(ls.allocations.length,graph.size);assert.equal(pool.snapshot().occupied,graph.size);assert.equal(ws.length-ws.reduce((s,w)=>s+w.terminates,0),graph.size);steps++;
 }
 pool.dispose();assert.equal(ledger.snapshot().managed,0);assert(ws.every(w=>w.terminates===1));
});
const result={passed:true,classification:'Independent existing-behavior UNIT coverage of actual compiled production APIs; no new TDD/native claim',checks,checks_count:checks.length,model_steps:steps,seed_final:seed};
writeFileSync(new URL('./witness-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
