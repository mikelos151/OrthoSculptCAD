import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createNativeHandoff,encodeInputPacket,decodeInputPacket} from './compiled/nativeHandoff.js';
const results=[],observations={},caps={managed:1024,job:1024,history:1024};
const original=globalThis.Worker;
let workers=[];
class UnitWorker extends EventTarget {
 constructor(){super();this.added=[];this.removed=[];this.terminates=0;workers.push(this);}
 addEventListener(type,fn,opts){this.added.push({type,fn});return super.addEventListener(type,fn,opts);}
 removeEventListener(type,fn,opts){const registration=this.added.findIndex(x=>x.type===type&&x.fn===fn)+1;this.removed.push({type,registration});this.onRemove?.(this.removed.length,registration);return super.removeEventListener(type,fn,opts);}
 postMessage(packet,transfer){this.actual=structuredClone(packet,{transfer});}
 terminate(){this.terminates++;this.onTerminate?.();}
 ack(){const f=decodeInputPacket(this.actual);this.dispatchEvent(new MessageEvent('message',{data:encodeInputPacket(2,f.tuple,f.nonce,f.plan,[])}));}
 finish(){this.ack();const f=decodeInputPacket(this.actual),back=structuredClone(f.buffers,{transfer:f.buffers});this.dispatchEvent(new MessageEvent('message',{data:encodeInputPacket(3,f.tuple,f.nonce,f.plan,back)}));}
 stale(){const fn=this.added.find(x=>x.type==='message')?.fn;fn?.(new MessageEvent('message',{data:{bad:true}}));}
}
globalThis.Worker=UnitWorker;
function material(c,sizes=[2,3],category='job'){
 const source=c.ledger.reserve(sizes.map((bytes,i)=>({key:String(i),bytes,category,owner:c.mainRealm}))),refs=sizes.map((_,i)=>source.ref(String(i))),buffers=refs.map(r=>source.allocateBuffer(r));
 buffers.forEach((b,i)=>new Uint8Array(b).fill(i+13));return {source,refs,buffers};
}
function fixture(){workers=[];const c=createNativeHandoff(caps),x=material(c),before=c.ledger.snapshot(),h=c.submit(x.source,x.refs.map(ref=>({ref,role:1}))),w=workers.at(-1),hold=material(c,[7],'history');x.source.close();return {c,x,h,w,hold,before};}
const counters=c=>{const s=c.ledger.snapshot();return [s.managed,s.job,s.history];};
const state=c=>({broker:c.snapshot(),ledger:c.ledger.snapshot()});
const outcome=(c,h)=>c.wait(h).then(()=>({resolved:true}),e=>({resolved:false,error:e,code:e?.code,message:e?.message}));
async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:String(e.stack??e)});}}
for(const action of ['release','dispose','return'])for(const hook of [1,2,3,4,5,'terminate'])for(const revoke of ['release','dispose'])await test(`reentrancy action=${action} hook=${hook} revoke=${revoke}`,async()=>{
 const {c,x,h,w,hold}=fixture(),wait=outcome(c,h),consumer=c.ledger.reserve([]);let fired=false,inside;
 const callback=()=>{
  if(fired)return;fired=true;assert.deepEqual(counters(c),[12,5,7]);assert.equal(c.snapshot().pool.occupied,1);
  if(revoke==='release')c.release(h);else c.dispose();
  assert.throws(()=>c.accept(h,consumer),e=>e.code==='STALE');
  // Controlled ticket is still owned by the original completion, even when the nested pool terminal succeeded.
  assert.deepEqual(counters(c),[12,5,7]);inside=state(c);w.stale();assert.deepEqual(state(c),inside);
 };
 if(hook==='terminate')w.onTerminate=callback;else w.onRemove=n=>{if(n===hook)callback();};
 if(action==='return')w.finish();else if(action==='release')c.release(h);else c.dispose();
 const result=await wait;
 assert.equal(result.resolved,false);assert.equal(result.code,action==='dispose'||revoke==='dispose'&&action==='return'?'CLOSED':'RELEASED');
 assert.equal(fired,true);assert.equal(w.terminates,1);assert.equal(c.snapshot().pending,0);assert.equal(c.snapshot().pool.occupied,0);assert.deepEqual(counters(c),[7,0,7]);
 assert.deepEqual(w.removed.map(x=>x.registration).sort(),[1,2,3,4,5]);
 assert.deepEqual(x.buffers.map(b=>b.byteLength),[0,0]);assert.throws(()=>c.accept(h,consumer),e=>e.code==='STALE');
 c.release(h);c.dispose();w.stale();assert.deepEqual(counters(c),[7,0,7]);hold.source.close();consumer.close();assert.deepEqual(counters(c),[0,0,0]);
});
for(const action of ['release','return'])for(const removal of [1,2,3,4,5])await test(`listener throw action=${action} removal=${removal}`,async()=>{
 const {c,h,w,hold}=fixture(),wait=outcome(c,h),error=new Error('cleanup injected '+removal);
 w.onRemove=n=>{if(n===removal)throw error;};
 if(action==='return')w.finish();else c.release(h);
 const settled=await wait;
 const first={...state(c),terminates:w.terminates,removed:[...w.removed],outcome:{resolved:settled.resolved,code:settled.code,message:settled.message}};
 w.onRemove=undefined;try{c.dispose();}catch{};c.release(h);w.stale();
 observations[`cleanup-${action}-${removal}`]={first,afterRetry:{...state(c),terminates:w.terminates,removed:[...w.removed]}};
 assert.equal(w.terminates,1,'cleanup throw must not prevent native terminal attempt');
 assert.deepEqual(w.removed.map(x=>x.registration).sort(),[1,2,3,4,5],'every listener cleanup attempted');
 assert.equal(c.snapshot().pending,0,'exact ticket must retire');assert.equal(c.snapshot().pool.occupied,0);assert.deepEqual(counters(c),[7,0,7]);
 assert.equal(settled.resolved,false);if(action==='return')assert.equal(settled.error,error);
 hold.source.close();
});
for(const action of ['release','return'])for(const cleanupThrow of [false,true])for(const reentrantDispose of [false,true])await test(`terminate failure action=${action} cleanup=${cleanupThrow} dispose=${reentrantDispose}`,async()=>{
 const {c,h,w,hold}=fixture(),wait=outcome(c,h),error=new Error('terminate injected'),other=material(c,[11]),h2=c.submit(other.source,other.refs.map(ref=>({ref,role:1}))),w2=workers.at(-1);other.source.close();
 if(cleanupThrow)w.onRemove=n=>{if(n===1)throw new Error('remove');};
 w.onTerminate=()=>{assert.deepEqual(counters(c),[23,16,7]);assert.equal(c.snapshot().pool.occupied,2);if(reentrantDispose)c.dispose();assert.deepEqual(counters(c),reentrantDispose?[12,5,7]:[23,16,7]);throw error;};
 if(action==='return')w.finish();else c.release(h);
 const settled=await wait;assert.equal(settled.error,error);assert.equal(w.terminates,1);assert.equal(c.snapshot().pool.slots[0].phase,'FAILED');
 assert.deepEqual(counters(c),reentrantDispose?[12,5,7]:[23,16,7]);
 assert.equal(w2.terminates,reentrantDispose?1:0);const before=state(c);c.release(h);c.release(h);w.stale();assert.deepEqual(state(c),before);assert.equal(w.terminates,1);
 if(!reentrantDispose){c.release(h2);assert.deepEqual(counters(c),[12,5,7]);}c.dispose();c.dispose();assert.equal(w.terminates,1);hold.source.close();assert.deepEqual(counters(c),[5,5,0]);
});
// Separate exact-ticket compatibility and category-union control through actual adopted refs.
await test('private adoption preserves ids and category union; retired h1 cannot release pending h2',async()=>{
 const {c,h,w,hold,before,x}=fixture();w.finish();await c.wait(h);const consumer=c.ledger.reserve([]),out=c.accept(h,consumer),history=c.ledger.reserve([]);
 assert.deepEqual(c.ledger.snapshot().allocations.slice(0,2).map(a=>a.id),before.allocations.map(a=>a.id));
 assert.deepEqual(out.buffers.map(b=>[...new Uint8Array(b)]),[[13,13],[14,14,14]]);assert.notEqual(out.buffers[0],x.buffers[0]);
 const retained=out.refs.map(ref=>history.retain(ref,'history',c.mainRealm));assert.equal(retained.length,2);assert.deepEqual(counters(c),[12,5,12]);consumer.close();assert.deepEqual(counters(c),[12,0,12]);
 const next=material(c,[11]),h2=c.submit(next.source,next.refs.map(ref=>({ref,role:1})));next.source.close();const baseline=state(c);c.release(h);w.stale();assert.deepEqual(state(c),baseline);c.release(h2);history.close();hold.source.close();c.dispose();assert.deepEqual(counters(c),[0,0,0]);
});
globalThis.Worker=original;
const data={kind:'UNIT actual compiled final APIs, EventTarget and structuredClone; no native exploit or reachability proof',total:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results,observations};
writeFileSync(new URL('./boundary-results.json',import.meta.url),JSON.stringify(data,null,2));console.log(JSON.stringify({total:data.total,passed:data.passed,failed:data.failed,failures:results.filter(x=>!x.passed)},null,2));process.exitCode=data.failed?1:0;
