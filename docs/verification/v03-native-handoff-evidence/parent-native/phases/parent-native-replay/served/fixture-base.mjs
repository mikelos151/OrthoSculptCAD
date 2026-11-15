import {createNativeHandoff} from './nativeHandoff.js';
export async function run(){
 const e=globalThis.evidence={checks:[],events:[],snapshots:{}};
 const check=(v,name)=>{e.checks.push({name,pass:!!v});if(!v)throw Error(name);};
 const NativeWorker=globalThis.Worker,post=NativeWorker.prototype.postMessage,stop=NativeWorker.prototype.terminate;let live=0,peak=0;
 globalThis.Worker=class extends NativeWorker{constructor(...a){super(...a);live++;peak=Math.max(peak,live);e.events.push({native:'constructor',url:String(a[0]),live});this.addEventListener('message',x=>{e.events.push({native:'receive',type:new DataView(x.data.header).getUint32(8,true),lengths:x.data.buffers.map(b=>b.byteLength)});});}postMessage(frame,transfer){e.events.push({native:'send-before',type:new DataView(frame.header).getUint32(8,true),lengths:frame.buffers.map(b=>b.byteLength)});const r=post.call(this,frame,transfer);e.events.push({native:'send-after',lengths:frame.buffers.map(b=>b.byteLength)});return r;}terminate(){const r=stop.call(this);live--;e.events.push({native:'terminate',live});return r;}};
 const c=createNativeHandoff({managed:1024,job:1024,history:1024}),l=c.ledger,src=l.reserve([]),b=new ArrayBuffer(16);new Uint8Array(b).set([7,11,13,17]);const r=l.registerExisting(b,src,'job',c.mainRealm);e.snapshots.before=l.snapshot();
 try{
  const h=c.submit(src,[{ref:r,role:1}]);check(!h.code,'accepted native input');check(b.byteLength===0,'native START detached actual G1a backing');e.snapshots.sent=l.snapshot();src.close();
  await c.wait(h);e.snapshots.returned=l.snapshot();const consumer=l.reserve([]),result=c.accept(h,consumer),returned=result.buffers[0];
  check(returned!==b&&returned.byteLength===16,'different JS RETURN wrapper same byteLength');check([...new Uint8Array(returned)].join(',')==='7,11,13,17,0,0,0,0,0,0,0,0,0,0,0,0','original exact payload bytes');
  const digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),b=>b.toString(16).padStart(2,'0')).join('');
  e.hash=await digest(returned);check(e.hash===await digest(new Uint8Array([7,11,13,17,...Array(12).fill(0)])),'original exact SHA256');
  for(const snap of [e.snapshots.sent,e.snapshots.returned,l.snapshot()])check(snap.managed===16&&snap.job===16&&snap.allocations.length===1&&snap.allocations[0].id===e.snapshots.before.allocations[0].id,'same allocation ID/charge throughout native handoff');
  check(e.events.some(x=>x.native==='receive'&&x.type===2)&&e.events.some(x=>x.native==='receive'&&x.type===3),'actual native RECEIVED and RETURN');
  check(live===0&&peak===1,'one-shot native terminate before result adoption');consumer.close();c.release(h);check(l.snapshot().managed===0,'all result refs closed');
 }finally{c.dispose();src.close();globalThis.Worker=NativeWorker;}
 return e;
}
