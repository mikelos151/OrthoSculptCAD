import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createResourceLedger,createNativeLedger} from './compiled/resourceLedger.js';
import {createNativeHandoff,encodeInputPacket,decodeInputPacket} from './compiled/nativeHandoff.js';
const results=[],caps={managed:1024,job:1024,history:1024};
const snap=l=>JSON.stringify(l.snapshot());
const rejects=(f,code='INVALID_INPUT')=>assert.throws(f,e=>e.code===code);
async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:String(e.stack??e)});}}
function core(sizes=[2,3],category='job'){
 const {ledger:l,handoff:h}=createNativeLedger(caps),main=l.createRealm(),remote=l.createRealm();
 const source=l.reserve(sizes.map((bytes,i)=>({key:String(i),bytes,category,owner:main}))),rr=sizes.map((_,i)=>source.ref(String(i))),bb=rr.map(r=>source.allocateBuffer(r));
 const binding={},before=snap(l),t=h.prepare(source,rr,main,remote,binding);
 return {l,h,main,remote,source,rr,bb,binding,before,t};
}
function remote(x){const actual=structuredClone(x.bb,{transfer:x.bb});x.h.sent(x.t,x.binding);x.h.received(x.t,x.binding);return structuredClone(actual,{transfer:actual});}
await test('default factory surface and legacy phase remain compatible',()=>{
 const l=createResourceLedger(caps),owner=l.createRealm(),a=l.reserve([{key:'a',bytes:2,category:'job',owner}]);
 assert.deepEqual(Object.keys(l).sort(),['createRealm','registerExisting','reserve','snapshot']);assert.equal(l.snapshot().allocations[0].phase,'reserved');
 const r=a.ref('a'),b=a.allocateBuffer(r);assert.equal(l.snapshot().allocations[0].phase,'live');const d=l.reserve([]),alias=d.retain(r,'history',owner);
 assert.deepEqual([l.snapshot().managed,l.snapshot().job,l.snapshot().history],[2,2,2]);a.close();assert.equal(l.snapshot().managed,2);d.release(alias);d.close();a.close();assert.equal(l.snapshot().managed,0);assert.equal(b.byteLength,2);
});
await test('PREPARED denies all public refs keys realms and backing aliases without mutation',()=>{
 const x=core(),d=x.l.reserve([]),baseline=snap(x.l),foreign=createNativeLedger(caps),fm=foreign.ledger.createRealm();
 for(const f of [()=>x.source.ref('0'),()=>x.source.release(x.rr[0]),()=>x.source.close(),()=>x.source.reclassify(x.rr[0],'history'),()=>x.source.transfer(x.rr[0],x.remote),()=>x.source.allocateBuffer(x.rr[0]),()=>d.retain(x.rr[0],'job',x.main),()=>d.retain(x.rr[0],'job',fm),()=>x.l.registerExisting(x.bb[0],d,'history',x.main)]){rejects(f);assert.equal(snap(x.l),baseline);}
 x.h.sendThrew(x.t,x.binding);assert.equal(snap(x.l),x.before);assert.equal(x.source.ref('0'),x.rr[0]);x.source.close();d.close();
});
await test('private tickets and exact binding authenticate every transition',()=>{
 const x=core(),y=core();
 for(const [t,b]of [[{},x.binding],[structuredClone(x.t),x.binding],[x.t,{}],[y.t,x.binding]])for(const f of [()=>x.h.packet(t,b),()=>x.h.sent(t,b),()=>x.h.received(t,b),()=>x.h.returned(t,b,[]),()=>x.h.sendThrew(t,b),()=>x.h.terminated(t,b),()=>x.h.publish(t,b,x.source)])rejects(f);
 x.h.sendThrew(x.t,x.binding);y.h.sendThrew(y.t,y.binding);x.source.close();y.source.close();
});
await test('real structuredClone DataCloneError rolls full batch graph back to identical ref/key',()=>{
 const x=core([0,2,3]);assert.throws(()=>structuredClone({bb:x.bb,fn(){ }},{transfer:x.bb}),e=>e.name==='DataCloneError');
 x.h.sendThrew(x.t,x.binding);assert.equal(snap(x.l),x.before);x.rr.forEach((r,i)=>assert.equal(x.source.ref(String(i)),r));x.source.close();assert.equal(x.l.snapshot().managed,0);
});
await test('partial detach is terminal and never reauthorizes detached source',()=>{
 const x=core([0,2]);structuredClone(x.bb[0],{transfer:[x.bb[0]]});rejects(()=>x.h.sent(x.t,x.binding));rejects(()=>x.h.sendThrew(x.t,x.binding));x.h.terminated(x.t,x.binding);
 rejects(()=>x.source.ref('0'));assert.equal(x.source.ref('1'),x.rr[1]);assert.equal(x.l.snapshot().managed,2);x.source.close();
});
await test('after detach retired refs cannot allocate retain transfer or register stale zero wrappers',()=>{
 const x=core([0,2]),back=remote(x),d=x.l.reserve([]);x.source.close();const baseline=snap(x.l);
 for(const f of [()=>d.retain(x.rr[0],'job',x.main),()=>d.retain(x.rr[1],'job',x.remote),()=>x.source.allocateBuffer(x.rr[0]),()=>x.source.transfer(x.rr[0],x.main),()=>x.l.registerExisting(x.bb[0],d,'job',x.main)]){rejects(f);assert.equal(snap(x.l),baseline);}
 x.h.returned(x.t,x.binding,back);const out=x.h.publish(x.t,x.binding,d);assert.deepEqual(out.buffers.map(b=>b.byteLength),[0,2]);d.close();assert.equal(x.l.snapshot().managed,0);
});
await test('return batch rejects every malformed second member before ANY first rebind',()=>{
 const x=core([2,2]),back=remote(x),d=x.l.reserve([]),known=new ArrayBuffer(2);x.l.registerExisting(known,d,'job',x.main);
 const detached=new ArrayBuffer(2);structuredClone(detached,{transfer:[detached]});
 const bad=[new ArrayBuffer(1),new SharedArrayBuffer(2),new ArrayBuffer(2,{maxByteLength:4}),new Uint8Array(2),detached,back[0],known,undefined];
 const baseline=snap(x.l);for(const b of bad){rejects(()=>x.h.returned(x.t,x.binding,[back[0],b]));assert.equal(snap(x.l),baseline);}
 for(const b of [[],[back[0]],Array(2)]){rejects(()=>x.h.returned(x.t,x.binding,b));assert.equal(snap(x.l),baseline);}
 x.h.returned(x.t,x.binding,back);const consumer=x.l.reserve([]);x.h.publish(x.t,x.binding,consumer);consumer.close();d.close();x.source.close();assert.equal(x.l.snapshot().managed,0);
});
await test('same allocation ID charge owner and returned identity preserved; original ref retired',()=>{
 const x=core([2,3],'history'),before=JSON.parse(x.before),back=remote(x);x.source.close();x.h.returned(x.t,x.binding,back);const d=x.l.reserve([]),out=x.h.publish(x.t,x.binding,d);
 assert.deepEqual(x.l.snapshot().allocations.map(a=>[a.id,a.bytes,a.realm]),before.allocations.map(a=>[a.id,a.bytes,a.realm]));assert.deepEqual([x.l.snapshot().managed,x.l.snapshot().job,x.l.snapshot().history],[5,0,5]);assert.equal(out.buffers[0],back[0]);assert.notEqual(out.buffers[0],x.bb[0]);rejects(()=>d.retain(x.rr[0],'history',x.main));d.close();assert.equal(x.l.snapshot().managed,0);
});
await test('closed/foreign consumer adoption is all-or-none and retryable with no raw leak',()=>{
 const x=core(),back=remote(x);x.h.returned(x.t,x.binding,back);const closed=x.l.reserve([]);closed.close();const other=createNativeLedger(caps).ledger.reserve([]),before=snap(x.l);
 rejects(()=>x.h.publish(x.t,x.binding,closed),'CLOSED');assert.equal(snap(x.l),before);rejects(()=>x.h.publish(x.t,x.binding,other));assert.equal(snap(x.l),before);const d=x.l.reserve([]),out=x.h.publish(x.t,x.binding,d);assert.equal(out.refs.length,2);rejects(()=>x.h.publish(x.t,x.binding,d));x.h.terminated(x.t,x.binding);d.close();x.source.close();
});
const tuple=[0,1,1,1,1,1,1],nonce=[3,4,5,6];
function packet(){return encodeInputPacket(3,tuple,nonce,[[0,1,2],[1,9,3]],[new ArrayBuffer(2),new ArrayBuffer(3)]);}
const mutations={
 'reserved56':p=>new DataView(p.header).setUint32(56,1,true),'reserved60':p=>new DataView(p.header).setUint32(60,1,true),
 'magic':p=>new DataView(p.header).setUint32(0,0,true),'version':p=>new DataView(p.header).setUint32(4,2,true),'type0':p=>new DataView(p.header).setUint32(8,0,true),'type8':p=>new DataView(p.header).setUint32(8,8,true),
 'header-short':p=>p.header=new ArrayBuffer(63),'header-long':p=>p.header=new ArrayBuffer(65),'descriptors-odd':p=>p.descriptors=new ArrayBuffer(13),'descriptors-over16':p=>p.descriptors=new ArrayBuffer(204),
 'role0':p=>new DataView(p.descriptors).setUint32(4,0,true),'role10':p=>new DataView(p.descriptors).setUint32(4,10,true),'ordinal16':p=>new DataView(p.descriptors).setUint32(0,16,true),'ordinal-duplicate':p=>new DataView(p.descriptors).setUint32(12,0,true),
 'wrong-length':p=>p.buffers[1]=new ArrayBuffer(4),'SAB':p=>p.buffers[1]=new SharedArrayBuffer(3),'RAB':p=>p.buffers[1]=new ArrayBuffer(3,{maxByteLength:5}),'view':p=>p.buffers[1]=new Uint8Array(3),
 'detached':p=>structuredClone(p.buffers[1],{transfer:[p.buffers[1]]}),'empty':p=>p.buffers=[],'sparse':p=>p.buffers=Array(2),'extra-buffer-key':p=>p.buffers.extra=0,'extra-envelope':p=>p.extra=0,'symbol-envelope':p=>p[Symbol()]=0,
 'accessor-envelope':p=>Object.defineProperty(p,'buffers',{get(){throw Error('must not invoke accessor');}}),'ACK-has-payload':p=>new DataView(p.header).setUint32(8,2,true),
 'header-is-payload':p=>{p.buffers[0]=p.header;new DataView(p.descriptors).setUint32(8,64,true);},
 'descriptor-is-payload':p=>{p.buffers[0]=p.descriptors;new DataView(p.descriptors).setUint32(8,24,true);},
 'duplicate-payload':p=>{p.buffers[1]=p.buffers[0];new DataView(p.descriptors).setUint32(20,2,true);},
};
for(const [name,mutate]of Object.entries(mutations))await test('codec rejects '+name,()=>{const p=packet();mutate(p);rejects(()=>decodeInputPacket(p));});
await test('codec permits fixed zero and16 descriptors with bounded exact LE ABI',()=>{
 const plan=Array.from({length:16},(_,i)=>[i,i%9+1,i%3]),p=encodeInputPacket(1,tuple,nonce,plan,plan.map(a=>new ArrayBuffer(a[2]))),f=decodeInputPacket(p);
 assert.equal(p.header.byteLength,64);assert.equal(p.descriptors.byteLength,192);assert.equal(f.plan.length,16);assert.deepEqual(Array.from({length:16},(_,i)=>new DataView(p.header).getUint32(4*i,true)),[0x3142474e,1,1,...tuple,...nonce,0,0]);
});
// UNIT transport only. EventTarget plus actual structuredClone transfer, NOT native Workers.
const nativeWorker=globalThis.Worker;let mode={},instances=[],activeControllers=[];
class UnitWorker extends EventTarget {
 constructor(url,options){super();this.url=String(url);this.options=options;this.listeners=[];this.removed=[];this.terminates=0;this.addCalls=0;instances.push(this);if(mode.constructThrow)throw Error('constructor injected');mode.onConstruct?.(this);}
 addEventListener(type,fn,...rest){this.addCalls++;if(mode.addThrow===this.addCalls)throw Error('add injected');this.listeners.push({type,fn});return super.addEventListener(type,fn,...rest);}
 removeEventListener(type,fn,...rest){this.removed.push(type);if(mode.removeThrow===type)throw Error('remove injected');return super.removeEventListener(type,fn,...rest);}
 postMessage(p,transfer){mode.onSend?.(this,p);if(mode.sendThrow)throw Error('send injected');this.actual=structuredClone(p,{transfer});if(mode.partialThrow){throw Error('partial-detach injected');}}
 terminate(){this.terminates++;mode.onTerminate?.(this);if(mode.terminateThrow)throw Error('terminate injected');}
 frame(type,mutate){const f=decodeInputPacket(this.actual),bb=type===3?structuredClone(f.buffers,{transfer:f.buffers}):[],p=encodeInputPacket(type,f.tuple,f.nonce,f.plan,bb);mutate?.(p);return p;}
 emit(p){this.dispatchEvent(new MessageEvent('message',{data:p}));}
 finish(){this.emit(this.frame(2));this.emit(this.frame(3));}
 stale(p){for(const {type,fn}of this.listeners)if(type==='message')fn(new MessageEvent('message',{data:p}));}
}
globalThis.Worker=UnitWorker;
function controller(){const c=createNativeHandoff(caps);activeControllers.push(c);return c;}
function material(c,sizes=[2,3]){const l=c.ledger,s=l.reserve(sizes.map((bytes,i)=>({key:String(i),bytes,category:'job',owner:c.mainRealm}))),rr=sizes.map((_,i)=>s.ref(String(i))),bb=rr.map(r=>s.allocateBuffer(r));return {s,rr,bb};}
const submit=(c,x)=>c.submit(x.s,x.rr.map((ref,i)=>({ref,role:i%9+1})));
async function unit(name,fn){await test('UNIT '+name,async()=>{mode={};instances=[];activeControllers=[];try{await fn();}finally{mode={};for(const c of activeControllers)try{c.dispose();}catch{}}});}
await unit('happy roundtrip wait contains no payload; adoption same-core before release',async()=>{
 const c=controller(),x=material(c),before=c.ledger.snapshot(),h=submit(c,x),w=instances.at(-1);x.s.close();assert(x.bb.every(b=>b.byteLength===0));w.finish();assert.equal(await c.wait(h),undefined);assert.equal(w.terminates,1);assert.equal(c.snapshot().pending,1);
 const d=c.ledger.reserve([]),out=c.accept(h,d);assert.equal(out.refs.length,2);assert.deepEqual(c.ledger.snapshot().allocations.map(a=>a.id),before.allocations.map(a=>a.id));assert(Object.isFrozen(out)&&Object.isFrozen(out.refs)&&Object.isFrozen(out.buffers));rejects(()=>c.accept(h,d),'STALE');d.close();assert.equal(c.ledger.snapshot().managed,0);
});
await unit('factory has no public Worker URL hook and rejects forged clone foreign handles',()=>{
 const c=controller(),other=controller(),x=material(c),h=submit(c,x),d=c.ledger.reserve([]);
 assert.equal(instances[0].options.type,'module');assert(instances[0].url.endsWith('/nativeHandoff.worker.ts'));
 for(const bad of [{},structuredClone(h),{id:1},{slot:0,buffer:new ArrayBuffer(2)}])for(const f of [()=>c.wait(bad),()=>c.accept(bad,d),()=>c.release(bad)])rejects(f);
 rejects(()=>other.wait(h));c.release(h);assert.equal(c.ledger.snapshot().managed,0);d.close();x.s.close();
});
await unit('send throw attached rolls back exact refs and closes slot',()=>{
 const c=controller(),x=material(c),before=snap(c.ledger);mode.sendThrow=true;assert.throws(()=>submit(c,x),/send injected/);assert.equal(snap(c.ledger),before);assert.equal(x.s.ref('0'),x.rr[0]);assert.equal(c.snapshot().pending,0);assert.equal(c.snapshot().pool.occupied,0);assert.equal(instances[0].terminates,1);x.s.close();
});
await unit('send partial detach throw retires rather than restoring old refs',()=>{
 const c=controller(),x=material(c);mode.partialThrow=true;assert.throws(()=>submit(c,x),/partial-detach/);assert.equal(c.ledger.snapshot().managed,0);rejects(()=>x.s.ref('0'));assert.equal(instances[0].terminates,1);x.s.close();
});
await unit('constructor error neither consumes caller graph nor pending/slot',()=>{
 const c=controller(),x=material(c),before=snap(c.ledger);mode.constructThrow=true;assert.throws(()=>submit(c,x),/constructor/);assert.equal(snap(c.ledger),before);assert.equal(c.snapshot().pending,0);assert.equal(c.snapshot().pool.occupied,0);x.s.close();
});
for(const n of [1,2,3,4,5])await unit('partial listener registration failure '+n+' releases slot and caller graph',()=>{
 const c=controller(),x=material(c),before=snap(c.ledger);mode.addThrow=n;assert.throws(()=>submit(c,x),/add injected/);assert.equal(snap(c.ledger),before);assert.equal(c.snapshot().pool.occupied,0);assert.equal(c.snapshot().pending,0);assert.equal(instances[0].terminates,1);x.s.close();
});
for(const kind of ['wrong-nonce','wrong-tuple','wrong-plan','padding','RETURN-before-ACK','duplicate-ACK','unexpected-START'])await unit('current '+kind+' faults before unsafe rebind',async()=>{
 const c=controller(),x=material(c),h=submit(c,x),w=instances[0];x.s.close();let p;
 if(kind==='RETURN-before-ACK')p=w.frame(3);else if(kind==='unexpected-START')p=w.actual;else if(kind==='duplicate-ACK'){w.emit(w.frame(2));p=w.frame(2);}else p=w.frame(2,p=>{const h=new DataView(p.header),d=new DataView(p.descriptors);if(kind==='wrong-nonce')h.setUint32(40,99,true);if(kind==='wrong-tuple')h.setUint32(28,99,true);if(kind==='wrong-plan')d.setUint32(4,9,true);if(kind==='padding')h.setUint32(60,1,true);});
 w.emit(p);await assert.rejects(c.wait(h),e=>e.code==='INVALID_INPUT');assert.equal(c.ledger.snapshot().managed,0);assert.equal(w.terminates,1);assert.equal(c.snapshot().pending,0);rejects(()=>c.accept(h,c.ledger.reserve([])),'STALE');
});
await unit('stale exact old event and retired release do not touch newer lease',async()=>{
 const c=controller(),x=material(c),h1=submit(c,x),old=instances[0];old.finish();await c.wait(h1);const d=c.ledger.reserve([]);c.accept(h1,d);d.close();x.s.close();
 const y=material(c),h2=submit(c,y),before=snap(c.ledger),state=JSON.stringify(c.snapshot());old.stale({malformed:true});c.release(h1);assert.equal(snap(c.ledger),before);assert.equal(JSON.stringify(c.snapshot()),state);assert.equal(instances[1].terminates,0);c.release(h2);y.s.close();
});
await unit('two pending results block third despite physical slots free',async()=>{
 const c=controller(),x=material(c),y=material(c),z=material(c),hx=submit(c,x),hy=submit(c,y);instances[0].finish();instances[1].finish();await Promise.all([c.wait(hx),c.wait(hy)]);assert.equal(c.snapshot().pool.occupied,0);
 const before=snap(c.ledger);assert.deepEqual(submit(c,z),{ok:false,code:'BUSY'});assert.equal(instances.length,2);assert.equal(snap(c.ledger),before);c.release(hx);c.release(hy);x.s.close();y.s.close();z.s.close();
});
await unit('closed consumer refused atomically, then dispose after wait precludes acceptance',async()=>{
 const c=controller(),x=material(c),h=submit(c,x);instances[0].finish();await c.wait(h);const d=c.ledger.reserve([]);d.close();const before=snap(c.ledger);rejects(()=>c.accept(h,d),'CLOSED');assert.equal(snap(c.ledger),before);c.dispose();assert.equal(c.ledger.snapshot().managed,0);rejects(()=>c.accept(h,c.ledger.reserve([])),'STALE');x.s.close();
});
await unit('terminate throw retains charge and occupied slot with revoked result',async()=>{
 const c=controller(),x=material(c),h=submit(c,x),w=instances[0];x.s.close();mode.terminateThrow=true;c.release(h);await assert.rejects(c.wait(h));assert.equal(c.ledger.snapshot().managed,5);assert.equal(c.snapshot().pool.occupied,1);assert.equal(w.terminates,1);rejects(()=>c.accept(h,c.ledger.reserve([])),'STALE');c.release(h);assert.equal(w.terminates,1);assert.equal(c.ledger.snapshot().managed,5);
});
await unit('snapshot recursively frozen without payload Worker ticket nonce or authority',()=>{
 const c=controller(),x=material(c),h=submit(c,x);
 function inspect(v){if(v&&typeof v==='object'){assert(!(v instanceof ArrayBuffer)&&!ArrayBuffer.isView(v)&&!(v instanceof UnitWorker));assert(Object.isFrozen(v));for(const[k,z]of Object.entries(v)){assert(!['ticket','nonce','worker','binding','ref','lease'].includes(k));inspect(z);}}}
 inspect(c.snapshot());inspect(c.ledger.snapshot());c.release(h);x.s.close();
});
await unit('reentrant dispose from supported input getter closes admission without ownership leak',()=>{
 const c=controller(),x=material(c),before=snap(c.ledger);assert.throws(()=>c.submit(x.s,[{ref:x.rr[0],get role(){c.dispose();return 1;}}]),e=>e.code==='CLOSED');assert.equal(snap(c.ledger),before);assert.equal(c.snapshot().pending,0);assert.equal(instances.length,0);x.s.close();
});
await unit('reentrant dispose during termination never leaves a RETURNED orphan after closed',async()=>{
 const c=controller(),x=material(c),h=submit(c,x),w=instances[0];x.s.close();let fired=false;mode.onTerminate=()=>{if(!fired){fired=true;c.dispose();}};w.finish();await c.wait(h).catch(()=>{});
 assert.equal(c.snapshot().disposed,true);assert.equal(c.snapshot().pool.occupied,0);assert.equal(c.snapshot().pending,0,'closed composition must retire local returned payload');assert.equal(c.ledger.snapshot().managed,0,'no continuation or live worker justifies a hold');
});
await unit('listener cleanup throw still attempts terminate and releases after successful terminal',async()=>{
 const c=controller(),x=material(c),h=submit(c,x),w=instances[0];x.s.close();mode.removeThrow='message';c.release(h);await c.wait(h).catch(()=>{});
 assert.equal(w.terminates,1,'listener removal failure must not skip controlled termination');assert.equal(c.snapshot().pool.occupied,0);assert.equal(c.ledger.snapshot().managed,0);
});
globalThis.Worker=nativeWorker;
const data={evidence_kind:'UNIT actual compiled APIs + EventTarget/structuredClone; ZERO native Worker evidence',total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
writeFileSync(new URL('./witness-results.json',import.meta.url),JSON.stringify(data,null,2));console.log(JSON.stringify(data,null,2));process.exitCode=data.failed?1:0;
