import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createNativeHandoff,encodeInputPacket,decodeInputPacket} from './compiled/nativeHandoff.js';
const results=[],observations=[];const oldWorker=globalThis.Worker;
for(const action of ['release','return']){
 let c,w,fired=false;const expected=new Error('original native terminate failure');
 class UnitWorker extends EventTarget{
  constructor(){super();w=this;this.terminates=0;this.removed=[];}
  postMessage(p,transfer){this.actual=structuredClone(p,{transfer});}
  removeEventListener(type,fn,...rest){this.removed.push(type);if(type==='message'&&!fired){fired=true;c.dispose();}return super.removeEventListener(type,fn,...rest);}
  terminate(){this.terminates++;throw expected;}
  finish(){const f=decodeInputPacket(this.actual);this.dispatchEvent(new MessageEvent('message',{data:encodeInputPacket(2,f.tuple,f.nonce,f.plan,[])}));const back=structuredClone(f.buffers,{transfer:f.buffers});this.dispatchEvent(new MessageEvent('message',{data:encodeInputPacket(3,f.tuple,f.nonce,f.plan,back)}));}
 }
 globalThis.Worker=UnitWorker;c=createNativeHandoff({managed:1024,job:1024,history:1024});
 const hold=c.ledger.reserve([{key:'main',bytes:7,category:'history',owner:c.mainRealm}]),hr=hold.ref('main'),hb=hold.allocateBuffer(hr);new Uint8Array(hb).fill(29);
 const source=c.ledger.reserve([2,3].map((bytes,i)=>({key:String(i),bytes,category:'job',owner:c.mainRealm}))),refs=[source.ref('0'),source.ref('1')];refs.forEach(r=>source.allocateBuffer(r));
 const h=c.submit(source,refs.map(ref=>({ref,role:1})));assert(!('code'in h));source.close();const consumer=c.ledger.reserve([]),outcome=c.wait(h).catch(e=>e);
 if(action==='release')c.release(h);else w.finish();const actual=await outcome;
 const check=(name,fn)=>{try{fn();results.push({name:action+': '+name,passed:true});}catch(e){results.push({name:action+': '+name,passed:false,error:String(e.stack??e)});}};
 check('dispose reentered from message listener cleanup',()=>assert(fired&&c.snapshot().disposed));
 check('required native termination attempted once',()=>assert.equal(w.terminates,1));
 check('all three facade cleanup types attempted',()=>assert.deepEqual(w.removed.slice(0,1).concat(w.removed.slice(-2)),['message','error','messageerror']));
 check('failed slot remains occupied',()=>assert.equal(c.snapshot().pool.slots[0].phase,'FAILED'));
 check('controlled bytes and unrelated main bytes remain charged',()=>assert.deepEqual([c.ledger.snapshot().managed,c.ledger.snapshot().job,c.ledger.snapshot().history],[12,5,7]));
 check('public result cannot be adopted',()=>assert.throws(()=>c.accept(h,consumer),e=>e.code==='STALE'));
 check('main hold identity and bytes unchanged',()=>{assert.equal(hold.ref('main'),hr);assert.deepEqual([...new Uint8Array(hb)],Array(7).fill(29));});
 c.release(h);c.release(h);c.dispose();c.dispose();
 check('repeated cleanup never retries terminate',()=>assert.equal(w.terminates,1));
 const repeatError=await c.wait(h).catch(e=>e);check('repeat wait preserves same rejection',()=>assert.equal(repeatError,actual));
 // Blocking assertion, not a fabricated native exploit: exact thrown Error is lost.
 check('original terminate error identity survives cleanup reentrancy',()=>assert.equal(actual,expected));
 observations.push({action,actualError:{message:actual.message,code:actual.code},expectedError:expected.message,sameError:actual===expected,terminates:w.terminates,removed:w.removed,broker:c.snapshot(),ledger:c.ledger.snapshot()});consumer.close();hold.close();
}
globalThis.Worker=oldWorker;
const data={evidence_kind:'UNIT EventTarget/structuredClone fault injection; final production APIs freshly compiled; NOT native reachability',total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,observations,results};
writeFileSync(new URL('./repro-results.json',import.meta.url),JSON.stringify(data,null,2));console.log(JSON.stringify(data,null,2));process.exitCode=data.failed?1:0;
