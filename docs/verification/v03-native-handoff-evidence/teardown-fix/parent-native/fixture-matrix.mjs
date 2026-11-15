import {run as happy} from './fixture-base.mjs';
import {createNativeHandoff} from './nativeHandoff.js';
export async function run(){
 const e=await happy(),check=(v,name)=>{e.checks.push({name,pass:!!v});if(!v)throw Error(name);};
 const NativeWorker=globalThis.Worker,post=NativeWorker.prototype.postMessage,terminate=NativeWorker.prototype.terminate;let live=0,peak=0,faultSend=false,watch;
 globalThis.Worker=class extends NativeWorker{
  constructor(...args){super(...args);live++;peak=Math.max(peak,live);e.events.push({native:'constructor',url:String(args[0]),live});this.addEventListener('message',x=>{
   e.events.push({native:'receive',type:new DataView(x.data.header).getUint32(8,true),lengths:x.data.buffers.map(b=>b.byteLength),ledgerBefore:watch?.snapshot()});
   queueMicrotask(()=>e.events.push({native:'after-receive',ledger:watch?.snapshot()}));
  });}
  postMessage(frame,transfers){e.events.push({native:'send-before',type:new DataView(frame.header).getUint32(8,true),lengths:frame.buffers.map(b=>b.byteLength)});
   try{const actual=faultSend?{...frame,uncloneable:()=>0}:frame;faultSend=false;const r=post.call(this,actual,transfers);e.events.push({native:'send-after',lengths:frame.buffers.map(b=>b.byteLength)});return r;}
   catch(error){e.events.push({native:'native-post-threw',name:error.name,lengths:frame.buffers.map(b=>b.byteLength),genuineNativeCall:true});throw error;}
  }
  terminate(){const r=terminate.call(this);live--;e.events.push({native:'terminate',live});return r;}
 };
 const c=createNativeHandoff({managed:1024,job:1024,history:1024}),l=c.ledger;watch=l;
 const mk=(n=16,category='job')=>{const lease=l.reserve([{key:'a',bytes:n,category,owner:c.mainRealm}]),r=lease.ref('a'),b=lease.allocateBuffer(r);if(n)new Uint8Array(b)[0]=37;return{lease,r,b};};
 const submit=x=>{const h=c.submit(x.lease,[{ref:x.r,role:1}]);check(!h.code,'bounded native submit accepted');return h;};
 const expectCode=(f,code,name)=>{let actual;try{f();}catch(x){actual=x.code;}check(actual===code,name);};
 const mode=async name=>{const r=await fetch('/__mode/'+name);check(r.ok,'test-only server fault mode '+name);};
 try{
  // Actual browser DataCloneError: real native postMessage attempts to clone a function.
  const x=mk(),before=l.snapshot(),start=e.events.length;faultSend=true;let cloneName;
  try{submit(x);}catch(error){cloneName=error.name;}
  check(cloneName==='DataCloneError'&&x.b.byteLength===16,'genuine Chromium DataCloneError preserves attached payload');
  check(JSON.stringify(l.snapshot())===JSON.stringify(before)&&x.lease.ref('a')===x.r,'attached-send rollback exact ID/refs/owner/categories/charges');
  check(c.snapshot().pool.occupied===0&&live===0,'failed native send terminates and releases pool slot');
  check(e.events.slice(start).some(v=>v.native==='native-post-threw'&&v.genuineNativeCall)&&!e.events.slice(start).some(v=>v.native==='receive'),'no fabricated native response for DataCloneError');
  const retry=submit(x);await c.wait(retry);const consumer=l.reserve([]),out=c.accept(retry,consumer);
  check(out.buffers[0]!==x.b&&new Uint8Array(out.buffers[0])[0]===37,'fresh physical binding retries original live ownership after atomic rollback');consumer.close();x.lease.close();
  // Actual native concurrent occupancy and a zero-work third request.
  const a=mk(),b=mk(),third=mk(),ha=submit(a),hb=submit(b),beforeBusy=l.snapshot(),countCtor=e.events.filter(v=>v.native==='constructor').length,countSend=e.events.filter(v=>v.native==='send-before').length;
  const refused=c.submit(third.lease,[{ref:third.r,role:1}]);
  check(refused.code==='BUSY'&&third.b.byteLength===16,'third request BUSY before payload detach');
  check(e.events.filter(v=>v.native==='constructor').length===countCtor&&e.events.filter(v=>v.native==='send-before').length===countSend&&JSON.stringify(l.snapshot())===JSON.stringify(beforeBusy),'third request no constructor/send/ledger mutation');
  check(c.snapshot().pool.occupied===2&&peak===2,'accepted pool composition holds maximum two physical Workers');
  c.release(retry);check(c.snapshot().pool.occupied===2,'retired h1 release does not touch newer native h2');
  await Promise.all([c.wait(ha),c.wait(hb)]);check(live===0&&c.snapshot().pool.occupied===0,'both one-shots terminated before adoption');
  check(c.submit(third.lease,[{ref:third.r,role:1}]).code==='BUSY','returned-but-not-adopted results bounded by the same two logical main holds');
  const dest=l.reserve([]);const closed=l.reserve([]);closed.close();const beforeClosed=l.snapshot();expectCode(()=>c.accept(ha,closed),'CLOSED','closed consumer cannot publish');check(JSON.stringify(l.snapshot())===JSON.stringify(beforeClosed),'consumer refusal atomic');
  const foreign=createNativeHandoff({managed:128,job:128,history:128});expectCode(()=>foreign.wait(ha),'INVALID_INPUT','foreign composition handle lacks exact binding authority');foreign.dispose();
  const channel=new MessageChannel();const cloned=await new Promise(resolve=>{channel.port2.onmessage=x=>resolve(x.data);channel.port1.postMessage(ha);});channel.port1.close();channel.port2.close();expectCode(()=>c.wait(cloned),'INVALID_INPUT','actual native MessageChannel-cloned handle has no authority');
  for(const fake of [{}, {id:l.snapshot().allocations[0].id}, {allocationId:l.snapshot().allocations[0].id,buffer:new Uint8Array([37,...Array(15).fill(0)]).buffer}])expectCode(()=>c.accept(fake,dest),'INVALID_INPUT','forged diagnostic-ID/equal-bytes handle denied');
  c.accept(ha,dest);c.accept(hb,dest);expectCode(()=>c.accept(ha,dest),'STALE','authentic accepted handle cannot publish twice');dest.close();a.lease.close();b.lease.close();third.lease.close();
  // Alias/duplicate refusal is prior to native send, with the exact original graph intact.
  const alias=mk(),holder=l.reserve([]);holder.retain(alias.r,'history',c.mainRealm);let snap=l.snapshot(),sends=e.events.filter(v=>v.native==='send-before').length;
  expectCode(()=>c.submit(alias.lease,[{ref:alias.r,role:1}]),'TRANSFER_ALIASED','actual UI/history alias refuses before detach');
  check(JSON.stringify(l.snapshot())===JSON.stringify(snap)&&alias.b.byteLength===16&&e.events.filter(v=>v.native==='send-before').length===sends,'alias refusal atomic and no native send');holder.close();snap=l.snapshot();
  expectCode(()=>c.submit(alias.lease,[{ref:alias.r,role:1},{ref:alias.r,role:2}]),'INVALID_INPUT','duplicate allocation in one native group refused');check(JSON.stringify(l.snapshot())===JSON.stringify(snap)&&alias.b.byteLength===16,'duplicate refusal atomic');alias.lease.close();
  // Malformed real RETURNs: actual native endpoint + actual original received ABs;
  // test-only instrumentation corrupts control metadata just before real native postMessage.
  for(const fault of ['return-reserved','return-envelope','return-bytes','return-nonce']){
   await mode(fault);const f=mk(),h=submit(f),id=l.snapshot().allocations[0].id;f.lease.close();let code;
   try{await c.wait(h);}catch(error){code=error.code;}
   check(code==='INVALID_INPUT',fault+': native RETURN fail-closed');check(l.snapshot().managed===0&&l.snapshot().allocations.length===0&&live===0,fault+': no rebind/publication, remote charges retire only after terminate');
   const unused=l.reserve([]);expectCode(()=>c.accept(h,unused),'STALE',fault+': no result authority');unused.close();c.release(h);e.snapshots[fault]={originalAllocationId:id,final:l.snapshot(),broker:c.snapshot()};
  }
  await mode('normal');
  // Maximum 16 descriptors including an actual fixed zero-byte AB.
  const batch=l.reserve(Array.from({length:16},(_,i)=>({key:String(i),bytes:i===0?0:1,category:'job',owner:c.mainRealm}))),refs=Array.from({length:16},(_,i)=>batch.ref(String(i))),old=refs.map(r=>batch.allocateBuffer(r));
  const batchBefore=l.snapshot(),h=c.submit(batch,refs.map((r,i)=>({ref:r,role:i%9+1})));check(!h.code,'16-descriptor native boundary accepted');await c.wait(h);const bd=l.reserve([]),actual=c.accept(h,bd);
  check(actual.buffers.length===16&&actual.buffers.every((b,i)=>b!==old[i]&&b.byteLength===(i===0?0:1)),'all16 original native backings returned as new wrappers including zero-byte');
  check(JSON.stringify(l.snapshot().allocations.map(a=>[a.id,a.bytes]))===JSON.stringify(batchBefore.allocations.map(a=>[a.id,a.bytes])),'batch keeps every allocation ID and full bytes');bd.close();batch.close();
  check(l.snapshot().managed===0&&l.snapshot().allocations.length===0&&c.snapshot().pending===0,'final logical charges and pending handles zero');
  const isPrivate=v=>{if(v instanceof ArrayBuffer||v instanceof NativeWorker||ArrayBuffer.isView(v))return false;if(v&&typeof v==='object')return Object.keys(v).every(k=>!['nonce','worker','ticket','rebind'].includes(k)&&isPrivate(v[k]));return true;};
  check(isPrivate(c.snapshot())&&Object.isFrozen(c.snapshot())&&Object.isFrozen(c.snapshot().pool.slots),'snapshots frozen and contain no transport/payload/nonce capabilities');
 }finally{c.dispose();globalThis.Worker=NativeWorker;}
 e.metrics={constructors:e.events.filter(v=>v.native==='constructor').length,terminates:e.events.filter(v=>v.native==='terminate').length,peak,live};
 check(e.metrics.constructors===e.metrics.terminates&&live===0,'each native constructor matched exactly one terminate API invocation');return e;
}
