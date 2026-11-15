import {createResourceLedger} from './resourceLedger.js';
export async function run(){
 const e=globalThis.evidence={checks:[],events:[],snapshots:{}};
 const check=(v,name)=>{e.checks.push({name,pass:!!v});if(!v)throw Error(name);};
 const l=createResourceLedger({managed:1024,job:1024,history:1024}),main=l.createRealm(),remote=l.createRealm();
 const lease=l.reserve([]),b=new ArrayBuffer(16);new Uint8Array(b).set([7,11,13,17]);const ref=l.registerExisting(b,lease,'job',main);e.snapshots.before=l.snapshot();
 const url=URL.createObjectURL(new Blob([`self.onmessage=e=>{const b=e.data;self.postMessage({type:'RECEIVED',bytes:b.byteLength});self.postMessage({type:'RETURN',buffer:b},[b]);self.postMessage({type:'DETACHED',bytes:b.byteLength});}`],{type:'text/javascript'}));
 const w=new Worker(url);e.events.push({native:'constructor'});
 let timer;try{
  const received=[];const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),10000);w.onmessage=x=>{e.events.push({native:x.data.type,bytes:x.data.bytes});received.push(x.data);if(x.data.type==='DETACHED')resolve();};});
  l.snapshot();w.postMessage(b,[b]);e.events.push({native:'send',detached:b.byteLength===0});check(b.byteLength===0,'native START detaches main wrapper');await done;
  const ret=received.find(x=>x.type==='RETURN').buffer;check(ret!==b&&ret.byteLength===16&&new Uint8Array(ret)[0]===7,'native RETURN new wrapper original bytes');check(received[2].bytes===0,'native Worker RETURN detached');
  const errors={};for(const [k,f]of [['retain',()=>lease.retain(ref,'job',main)],['reclassify',()=>lease.reclassify(ref,'history')],['transfer',()=>lease.transfer(ref,remote)]]){try{f();}catch(x){errors[k]=x.code;}}
  e.legacyDetachedRefusals=errors;check(Object.values(errors).length===3,'legacy G1a refuses detached original');
  const extra=l.reserve([]);l.registerExisting(ret,extra,'job',main);e.snapshots.naive=l.snapshot();check(l.snapshot().managed===32,'naive returned ingress doubles charge');extra.close();
  let rebound=false;try{lease.transfer(ref,main);rebound=true;}catch(x){e.missingRebindCode=x.code;}
  check(rebound,'G1b1b requires same-core rebind of returned wrapper; legacy detached G1a cannot perform it');
 }finally{clearTimeout(timer);w.terminate();e.events.push({native:'terminate'});URL.revokeObjectURL(url);lease.close();e.snapshots.closed=l.snapshot();}
 return e;
}
