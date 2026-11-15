import { createNativeLedger, createResourceLedger } from 'C:/Users/sandr/OrthoSculptCAD/src/compute/resourceLedger';
import type { Lease, Ref, Category } from 'C:/Users/sandr/OrthoSculptCAD/src/compute/resourceLedger';
import { createNativeHandoff, encodeInputPacket, decodeInputPacket } from 'C:/Users/sandr/OrthoSculptCAD/src/compute/nativeHandoff';
let assertions = 0; const results: string[] = [];
function check(v: unknown, label: string): asserts v { assertions++; if (!v) throw new Error(label); }
function eq(a: unknown,b: unknown,label: string) { check(JSON.stringify(a)===JSON.stringify(b),label); }
function throws(f:()=>unknown, code: string) { let got; try { f(); } catch(e) { got=(e as {code?:string}).code; } eq(got,code,'expected '+code); }
function take<T extends object>(v: T): Exclude<T, {code: string}> { check(!('code' in v),'capability expected'); return v as Exclude<T, {code: string}>; }
const caps={managed:128,job:64,history:32};
function scenario(name: string, f:()=>void) { f();results.push(name); }
for(const cat of ['resident','job','history'] as Category[]) scenario('same identity/charge through roundtrip '+cat,()=>{
 const {ledger:l,handoff:h}=createNativeLedger(caps), main=l.createRealm(),remote=l.createRealm();
 const source=take(l.reserve([{key:'a',bytes:16,category:cat,owner:main},{key:'unrelated',bytes:3,category:'history',owner:main}]));
 const old=source.ref('a'),unrelated=source.ref('unrelated'),b=source.allocateBuffer(old); source.allocateBuffer(unrelated);new Uint8Array(b).set([1,2,3]);
 const before=l.snapshot(),binding={},t=h.prepare(source,[old],main,remote,binding);
 eq(l.snapshot().allocations.map(a=>a.id),before.allocations.map(a=>a.id),'prepare IDs'); throws(()=>source.ref('a'),'INVALID_INPUT');
 throws(()=>source.release(old),'INVALID_INPUT');throws(()=>source.close(),'INVALID_INPUT');
 const other=take(l.reserve([]));throws(()=>other.retain(old,cat,main),'INVALID_INPUT');
 const prepared=l.snapshot();h.sendThrew(t,binding);eq(l.snapshot(),before,'rollback exact graph');check(source.ref('a')===old,'rollback exact ref');
 const t2=h.prepare(source,[old],main,remote,binding),p=h.packet(t2,binding),worker=structuredClone(p.buffers,{transfer:p.buffers});h.sent(t2,binding);
 check(b.byteLength===0,'detached');source.release(old);throws(()=>other.retain(old,cat,remote),'INVALID_INPUT');
 eq(l.snapshot().managed,before.managed,'inflight global');eq(l.snapshot().job,before.job,'inflight job');eq(l.snapshot().history,before.history,'inflight history');
 h.received(t2,binding);eq(l.snapshot().allocations[0].phase,'REMOTE','remote phase');
 const back=structuredClone(worker,{transfer:worker});const remoteSnapshot=l.snapshot();
 throws(()=>h.returned(t2,binding,[new ArrayBuffer(15)]),'INVALID_INPUT');eq(l.snapshot(),remoteSnapshot,'malformed atomic');
 h.returned(t2,binding,back);eq(l.snapshot().allocations[0].id,before.allocations[0].id,'same allocation');
 const closed=take(l.reserve([]));closed.close();const returned=l.snapshot();throws(()=>h.publish(t2,binding,closed),'CLOSED');eq(l.snapshot(),returned,'closed consumer atomic');
 const result=h.publish(t2,binding,other);check(result.buffers[0]===back[0]&&result.buffers[0]!==b,'actual wrapper only');
 eq(Array.from(new Uint8Array(result.buffers[0])).slice(0,3),[1,2,3],'contents');throws(()=>other.retain(old,cat,main),'INVALID_INPUT');
 h.terminated(t2,binding);source.close();eq(l.snapshot().managed,16,'source close only unrelated');other.close();eq(l.snapshot().managed,0,'last cleanup');
});
scenario('partial detach terminal restores attached subset only',()=>{
 const {ledger:l,handoff:h}=createNativeLedger(caps),main=l.createRealm(),remote=l.createRealm();const s=take(l.reserve([0,1].map(i=>({key:String(i),bytes:8,category:'job' as const,owner:main}))));
 const rr=[s.ref('0'),s.ref('1')],bb=rr.map(r=>s.allocateBuffer(r)),binding={},t=h.prepare(s,rr,main,remote,binding);
 structuredClone(bb[0],{transfer:[bb[0]]});throws(()=>h.sendThrew(t,binding),'INVALID_INPUT');h.terminated(t,binding);
 eq(l.snapshot().managed,8,'only attached charge');check(s.ref('1')===rr[1],'attached original capability');throws(()=>s.ref('0'),'INVALID_INPUT');s.release(rr[0]);h.terminated(t,binding);s.close();eq(l.snapshot().managed,0,'partial final zero');
});
scenario('returned batch conflicts atomic and consumer categories never evade cap',()=>{
 const {ledger:l,handoff:h}=createNativeLedger(caps),main=l.createRealm(),remote=l.createRealm();const s=take(l.reserve([0,1].map(i=>({key:String(i),bytes:24,category:'resident' as const,owner:main}))));
 const rr=[s.ref('0'),s.ref('1')],bb=rr.map(r=>s.allocateBuffer(r)),binding={},t=h.prepare(s,rr,main,remote,binding),worker=structuredClone(bb,{transfer:bb});h.sent(t,binding);h.received(t,binding);
 const back=structuredClone(worker,{transfer:worker}),before=l.snapshot();for(const bad of [[back[0],back[0]],[back[0]],Array(2)]) {throws(()=>h.returned(t,binding,bad),'INVALID_INPUT');eq(l.snapshot(),before,'malformed group atomic');}
 h.returned(t,binding,back);const c=take(l.reserve([])),a=h.publish(t,binding,c);eq(c.reclassify(a.refs[0],'history'),undefined,'first history allowed');const snap=l.snapshot();eq(c.reclassify(a.refs[1],'history'),{ok:false,code:'BUDGET'},'second history refused');eq(l.snapshot(),snap,'category refusal atomic');
 const alias=take(l.reserve([]));eq(alias.retain(a.refs[1],'history',main),{ok:false,code:'BUDGET'},'retain category cap');eq(l.snapshot(),snap,'retain refusal atomic');c.release(a.refs[0]);eq(l.snapshot().managed,24,'partial adoption release');c.close();s.close();alias.close();eq(l.snapshot().managed,0,'batch cleanup');
});
scenario('default ledger graph remains legacy and independent',()=>{
 const l=createResourceLedger(caps),m=l.createRealm(),s=take(l.reserve([{key:'a',bytes:16,category:'job',owner:m}]));eq(l.snapshot().allocations[0].phase,'reserved','legacy reserved');const r=s.ref('a');s.allocateBuffer(r);eq(l.snapshot().allocations[0].phase,'live','legacy live');const c=take(l.reserve([])),alias=take(c.retain(r,'history',m));eq([l.snapshot().managed,l.snapshot().job,l.snapshot().history],[16,16,16],'union');s.close();eq([l.snapshot().managed,l.snapshot().job,l.snapshot().history],[16,0,16],'other ref survives');c.release(alias);c.close();eq(l.snapshot().managed,0,'default final');
});
// UNIT transport double only. This is not a real Worker or a native proof.
class UnitWorker {
 static all: UnitWorker[]=[]; static mode:'roundtrip'|'attachedThrow'|'hold'|'malformed'='roundtrip';
 listeners=new Map<string,Set<EventListener>>(); terminated=0;
 constructor(..._args:unknown[]){UnitWorker.all.push(this);}
 addEventListener(type:string,fn:EventListener){let s=this.listeners.get(type);if(!s)this.listeners.set(type,s=new Set());s.add(fn);}
 removeEventListener(type:string,fn:EventListener){this.listeners.get(type)?.delete(fn);}
 emit(type:string,data:unknown){for(const f of [...this.listeners.get(type)??[]])f({data} as unknown as Event);}
 postMessage(packet: ReturnType<typeof encodeInputPacket>, transfer:ArrayBuffer[]){
  if(UnitWorker.mode==='attachedThrow')throw new DOMException('UNIT attached throw','DataCloneError');
  const incoming=structuredClone(packet,{transfer});if(UnitWorker.mode==='hold')return;
  const f=decodeInputPacket(incoming),malformed=UnitWorker.mode==='malformed';
  queueMicrotask(()=>{this.emit('message',encodeInputPacket(2,f.tuple,f.nonce,f.plan,[]));const ret=encodeInputPacket(3,f.tuple,f.nonce,f.plan,f.buffers);if(malformed)new DataView(ret.header).setUint32(56,1,true);this.emit('message',structuredClone(ret,{transfer:ret.buffers}));});
 }
 terminate(){this.terminated++;}
}
Object.defineProperty(globalThis,'Worker',{value:UnitWorker,configurable:true});
async function facade(){
 const b=createNativeHandoff(caps),l=b.ledger;const s=take(l.reserve([{key:'a',bytes:16,category:'job',owner:b.mainRealm},{key:'keep',bytes:8,category:'history',owner:b.mainRealm}]));const old=s.ref('a'),raw=s.allocateBuffer(old);s.allocateBuffer(s.ref('keep'));const before=l.snapshot();
 UnitWorker.mode='attachedThrow';let failed=false;try{b.submit(s,[{ref:old,role:1}]);}catch(e){failed=(e as Error).name==='DataCloneError';}check(failed,'facade send throw');eq(l.snapshot(),before,'facade full rollback');check(s.ref('a')===old&&raw.byteLength===16,'facade exact key/ref');eq(b.snapshot().pending,0,'rollback no pending');
 UnitWorker.mode='roundtrip';const h=take(b.submit(s,[{ref:old,role:1}]));await b.wait(h);eq(b.snapshot().pool.occupied,0,'returned terminates worker');eq(b.snapshot().pending,1,'unaccepted counts pending');
 const foreign=createNativeHandoff(caps),fc=take(foreign.ledger.reserve([])),snap=l.snapshot();throws(()=>b.accept(h,fc),'INVALID_INPUT');eq(l.snapshot(),snap,'foreign consumer atomic');const consumer=take(l.reserve([])),r=b.accept(h,consumer);eq(b.snapshot().pending,0,'accept removes pending');throws(()=>b.accept(h,consumer),'STALE');b.release(h);eq(l.snapshot().managed,24,'retired release preserves consumer');consumer.close();eq(l.snapshot().managed,8,'only unrelated hold');s.close();foreign.dispose();fc.close();b.dispose();eq(l.snapshot().managed,0,'facade cleanup');results.push('UNIT facade attached rollback + wait/accept ownership');
 UnitWorker.mode='hold';const hold=createNativeHandoff(caps),ss=take(hold.ledger.reserve([0,1,2].map(i=>({key:String(i),bytes:8,category:'job' as const,owner:hold.mainRealm}))));const rr=[0,1,2].map(i=>ss.ref(String(i))),bb=rr.map(r=>ss.allocateBuffer(r));const h1=take(hold.submit(ss,[{ref:rr[0],role:1}])),h2=take(hold.submit(ss,[{ref:rr[1],role:1}]));const count=UnitWorker.all.length;eq(hold.submit(ss,[{ref:rr[2],role:1}]),{ok:false,code:'BUSY'},'third BUSY');eq(UnitWorker.all.length,count,'BUSY no constructor');check(bb[2].byteLength===8,'BUSY no detach');hold.release(h1);const snap2=hold.ledger.snapshot();hold.release(h1);eq(hold.ledger.snapshot(),snap2,'old handle no h2 release');hold.release(h2);ss.close();hold.dispose();eq(hold.ledger.snapshot().managed,0,'holds final zero');results.push('UNIT facade cap2 and retired release isolation');
 UnitWorker.mode='malformed';const bad=createNativeHandoff(caps),bs=take(bad.ledger.reserve([{key:'a',bytes:8,category:'job',owner:bad.mainRealm}])),br=bs.ref('a');bs.allocateBuffer(br);const bh=take(bad.submit(bs,[{ref:br,role:1}]));let code;try{await bad.wait(bh);}catch(e){code=(e as {code?:string}).code;}eq(code,'INVALID_INPUT','malformed return rejects');eq(bad.ledger.snapshot().managed,0,'malformed cleanup');eq(bad.snapshot().pending,0,'malformed removes pending');bs.close();bad.dispose();results.push('UNIT facade malformed return fail closed');
 check(UnitWorker.all.every(w=>w.terminated===1),'UNIT exactly once terminate');
}
await facade();
console.log(JSON.stringify({passed:true,scope:'G1b1bInputOnly',kind:'actual API UNIT, structuredClone; Worker double NOT native proof',assertions,scenarios:results.length,results,unitWorkerConstructors:UnitWorker.all.length,unitWorkerTerminates:UnitWorker.all.reduce((n,w)=>n+w.terminated,0)},null,2));
