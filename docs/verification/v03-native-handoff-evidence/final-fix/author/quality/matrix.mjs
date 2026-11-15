import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createNativeHandoff,encodeInputPacket,decodeInputPacket} from './compiled/nativeHandoff.js';
const results=[],caps={managed:1024,job:1024,history:1024};
const savedWorker=globalThis.Worker;
let workers=[];
class UnitWorker extends EventTarget {
 constructor(){super();this.listeners=[];this.removed=[];this.terminates=0;workers.push(this);}
 addEventListener(type,fn,...rest){this.listeners.push({type,fn});return super.addEventListener(type,fn,...rest);}
 removeEventListener(type,fn,...rest){const index=this.listeners.findIndex(x=>x.type===type&&x.fn===fn),broker=index>=2;this.removed.push({type,broker,index});if(broker)this.onRemove?.(type);if(broker&&this.removeFault===type)throw this.removeError;return super.removeEventListener(type,fn,...rest);}
 postMessage(p,transfer){if(this.sendError)throw this.sendError;this.actual=structuredClone(p,{transfer});}
 terminate(){this.terminates++;this.onTerminate?.();if(this.terminateError)throw this.terminateError;}
 frame(type){const f=decodeInputPacket(this.actual);return encodeInputPacket(type,f.tuple,f.nonce,f.plan,type===3?structuredClone(f.buffers,{transfer:f.buffers}):[]);}
 emit(p){this.dispatchEvent(new MessageEvent('message',{data:p}));}
 stale(){for(const {fn,type}of this.listeners)if(type==='message')fn(new MessageEvent('message',{data:{bad:true}}));}
}
globalThis.Worker=UnitWorker;
function material(c,sizes=[2,3],category='job'){
 const s=c.ledger.reserve(sizes.map((bytes,i)=>({key:String(i),bytes,category,owner:c.mainRealm})));assert(!('code'in s));
 const rr=sizes.map((_,i)=>s.ref(String(i))),bb=rr.map((r,i)=>{const b=s.allocateBuffer(r);new Uint8Array(b).fill(17+i);return b;});return {s,rr,bb};
}
function submit(c,x){const h=c.submit(x.s,x.rr.map(ref=>({ref,role:1})));assert(!('code'in h));return h;}
const snapshot=c=>JSON.stringify({broker:c.snapshot(),ledger:c.ledger.snapshot()});
const staleAccept=(c,h,consumer)=>assert.throws(()=>c.accept(h,consumer),e=>e.code==='STALE');
async function test(name,fn){workers=[];try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:String(e.stack??e)});}}
// UNIT fault matrix: real final compiled facade/private ledger; EventTarget is NOT native Worker.
for(const stage of ['IN_FLIGHT','REMOTE','RETURN'])for(const site of ['message','error','messageerror','terminate'])for(const revoke of ['release','dispose'])for(const cleanupThrow of [false,true])for(const terminateThrow of [false,true]){
 await test(`UNIT matrix ${stage}/${site}/${revoke}/cleanup=${cleanupThrow}/terminate=${terminateThrow}`,async()=>{
  const c=createNativeHandoff(caps),x=material(c),consumer=c.ledger.reserve([]),h=submit(c,x),w=workers[0],terminateError=new Error('exact terminate object'),removeError=new Error('exact remove object');x.s.close();
  const outcome=c.wait(h).then(()=>({resolved:true}),error=>({error}));let settled=0;void outcome.then(()=>settled++);
  if(stage!=='IN_FLIGHT')w.emit(w.frame(2));
  w.removeFault=cleanupThrow?'messageerror':undefined;w.removeError=removeError;w.terminateError=terminateThrow?terminateError:undefined;
  let fired=false;const reenter=()=>{
   if(fired)return;fired=true;
   assert.equal(c.snapshot().pool.occupied,1);assert.equal(c.ledger.snapshot().managed,5);staleAccept(c,h,consumer);
   const before=c.ledger.snapshot();w.stale();assert.deepEqual(c.ledger.snapshot(),before);
   if(revoke==='release')c.release(h);else c.dispose();
   assert.equal(c.ledger.snapshot().managed,5,'original physical stop has not returned');staleAccept(c,h,consumer);
  };
  if(site==='terminate')w.onTerminate=reenter;else w.onRemove=type=>{if(type===site)reenter();};
  if(stage==='RETURN')w.emit(w.frame(3));else c.release(h);
  const out=await outcome;await Promise.resolve();assert(fired);assert.equal(settled,1);assert.equal(w.terminates,1);
  assert.deepEqual(w.removed.filter(x=>x.broker).map(x=>x.type),['message','error','messageerror']);
  staleAccept(c,h,consumer);assert(out.error,'revoke must reject rather than publish RETURNED');
  if(terminateThrow){
   assert.equal(c.snapshot().pool.occupied,1);assert.equal(c.snapshot().pending,1);assert.equal(c.snapshot().requests[0].phase,'FAILED');assert.equal(c.snapshot().pool.slots[0].phase,'FAILED');assert.equal(c.ledger.snapshot().managed,5);
   assert.equal(out.error,terminateError,'retain original terminate error identity');
  }else{assert.equal(c.snapshot().pool.occupied,0);assert.equal(c.snapshot().pending,0);assert.equal(c.ledger.snapshot().managed,0);if(stage==='RETURN'&&site==='terminate'&&cleanupThrow)assert.equal(out.error,removeError,'earlier cleanup fault retains priority over later reentrant revoke');else assert.equal(out.error.code,stage==='RETURN'?(revoke==='dispose'?'CLOSED':'RELEASED'):'RELEASED');}
  const before=snapshot(c);c.release(h);c.release(h);w.stale();c.dispose();c.dispose();assert.equal(w.terminates,1);assert.equal(settled,1);assert.equal(c.ledger.snapshot().managed,terminateThrow?5:0);
  if(terminateThrow){assert.equal(await c.wait(h).catch(e=>e),terminateError);}
  consumer.close();
 });
}
for(const stage of ['IN_FLIGHT','REMOTE','RETURN'])for(const fault of ['message','error','messageerror'])await test(`UNIT cleanup-only ${stage}/${fault}`,async()=>{
 const c=createNativeHandoff(caps),x=material(c),h=submit(c,x),w=workers[0],e=new Error('cleanup-only exact object');x.s.close();
 w.removeFault=fault;w.removeError=e;const outcome=c.wait(h).then(()=>null,e=>e);
 if(stage!=='IN_FLIGHT')w.emit(w.frame(2));if(stage==='RETURN')w.emit(w.frame(3));else c.release(h);
 const error=await outcome;assert.equal(w.terminates,1);assert.equal(c.snapshot().pending,0);assert.equal(c.ledger.snapshot().managed,0);assert.deepEqual(w.removed.filter(x=>x.broker).map(x=>x.type),['message','error','messageerror']);
 if(stage==='RETURN')assert.equal(error,e);else assert.equal(error.code,'RELEASED');c.dispose();
});
for(const trigger of ['release','return'])for(const fault of [undefined,'message','error','messageerror'])for(const terminateThrow of [false,true])await test(`UNIT foreign holds ${trigger}/${fault}/terminate=${terminateThrow}`,async()=>{
 const c=createNativeHandoff(caps),consumer=c.ledger.reserve([]),main=material(c,[7],'history'),owned=material(c,[11],'history'),hc=submit(c,owned),wc=workers.at(-1);owned.s.close();wc.emit(wc.frame(2));wc.emit(wc.frame(3));await c.wait(hc);const adopted=c.accept(hc,consumer);assert.equal(adopted.buffers[0].byteLength,11);
 const x=material(c),h=submit(c,x),w=workers.at(-1);x.s.close();const y=material(c,[13]),hy=submit(c,y),wy=workers.at(-1);y.s.close();const outcome=c.wait(h).catch(e=>e),foreignIds=c.ledger.snapshot().allocations.filter(a=>a.bytes===7||a.bytes===11||a.bytes===13),error=new Error('physical stop failed');
 w.removeFault=fault;w.removeError=new Error('cleanup');w.terminateError=terminateThrow?error:undefined;
 if(trigger==='return'){w.emit(w.frame(2));w.emit(w.frame(3));}else c.release(h);
 if(!fault&&!terminateThrow&&trigger==='return'){await c.wait(h);c.release(h);}else await outcome;
 assert.deepEqual(c.ledger.snapshot().allocations.filter(a=>a.bytes===7||a.bytes===11||a.bytes===13),foreignIds);assert.equal(wy.terminates,0);assert.equal(c.ledger.snapshot().managed,terminateThrow?36:31);assert.equal(c.ledger.snapshot().history,18);assert.equal(c.ledger.snapshot().job,terminateThrow?18:13);assert.deepEqual([...new Uint8Array(main.bb[0])],Array(7).fill(17));assert.deepEqual([...new Uint8Array(adopted.buffers[0])],Array(11).fill(17));
 const before=snapshot(c);w.stale();c.release(hc);c.release(h);assert.equal(snapshot(c),before);assert.equal(w.terminates,1);
 c.release(hy);await c.wait(hy).catch(()=>{});assert.equal(c.ledger.snapshot().managed,terminateThrow?23:18);consumer.close();main.s.close();assert.equal(c.ledger.snapshot().managed,terminateThrow?5:0);c.dispose();assert.equal(w.terminates,1);
});
for(const fault of ['message','error','messageerror'])await test(`UNIT retired h1 vs new h2 after ${fault} cleanup`,async()=>{
 const c=createNativeHandoff(caps),x=material(c),h1=submit(c,x),w=workers[0];x.s.close();w.removeFault=fault;w.removeError=new Error('remove');w.emit(w.frame(2));w.emit(w.frame(3));await c.wait(h1).catch(()=>{});
 const y=material(c),h2=submit(c,y),nw=workers.at(-1);y.s.close();assert.equal(c.snapshot().pool.slots[0].incarnation,2);const before=snapshot(c);w.stale();c.release(h1);assert.equal(snapshot(c),before);assert.equal(nw.terminates,0);nw.emit(nw.frame(2));nw.emit(nw.frame(3));await c.wait(h2);const consumer=c.ledger.reserve([]),out=c.accept(h2,consumer);assert.deepEqual(out.buffers.map(b=>b.byteLength),[2,3]);consumer.close();c.dispose();assert.equal(c.ledger.snapshot().managed,0);
});
globalThis.Worker=savedWorker;
const data={evidence_kind:'UNIT actual freshly compiled final APIs, EventTarget + actual structuredClone; no native/security exploit claim',total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
writeFileSync(new URL('./matrix-results.json',import.meta.url),JSON.stringify(data,null,2));console.log(JSON.stringify({total:data.total,passed:data.passed,failed:data.failed,failures:results.filter(r=>!r.passed)},null,2));process.exitCode=data.failed?1:0;
