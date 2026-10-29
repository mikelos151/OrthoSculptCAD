import assert from 'node:assert/strict';
const phase=process.argv[2];
const {createResourceLedger}=await import('./historical/'+phase+'.mjs');
const cycle=parseInt(phase,10),caps={managed:1024,job:768,history:512};
const ok=x=>{assert.ok(x&&!('code'in x),'valid operation must be accepted');return x;};
const budget={ok:false,code:'BUDGET'};
const err=(fn,code='INVALID_INPUT')=>assert.throws(fn,e=>e?.code===code);
const tuple=l=>{const{managed,job,history}=l.snapshot();return[managed,job,history];};
const reserve=(l,o,n=256,c='job')=>{const q=ok(l.reserve([{key:'x',bytes:n,category:c,owner:o}]));return[q,q.ref('x')];};
const live=(l,o,n=256,c='job')=>{const[q,r]=reserve(l,o,n,c);return[q,r,q.allocateBuffer(r)];};
try{
 switch(cycle){
 case 1:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r,b]=live(l,o,768);assert.equal(b.byteLength,768);assert.deepEqual(tuple(l),[768,768,0]);break;}
 case 2:{const l=createResourceLedger(caps),o=l.createRealm();reserve(l,o,768);assert.deepEqual(l.reserve([{key:'b',bytes:257,category:'resident',owner:o}]),budget);break;}
 case 3:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r]=live(l,o,768,'resident'),b=ok(l.reserve([]));ok(b.retain(r,'resident',o));assert.deepEqual(tuple(l),[768,0,0]);break;}
 case 4:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r]=live(l,o),b=ok(l.reserve([]));ok(b.retain(r,'job',o));assert.equal(q.reclassify(r,'history'),undefined);assert.deepEqual(tuple(l),[256,256,256]);break;}
 case 5:{const l=createResourceLedger({...caps,history:768}),o=l.createRealm(),[q,r]=live(l,o,768),b=ok(l.reserve([]));ok(b.retain(r,'history',o));q.close();assert.deepEqual(tuple(l),[768,0,768]);break;}
 case 6:{let calls=0;const l=createResourceLedger(caps,{allocate:n=>{if(++calls===2)throw RangeError('allocator fault');return new ArrayBuffer(n);}}),o=l.createRealm();const q=ok(l.reserve(['a','b','c'].map(key=>({key,bytes:128,category:'job',owner:o}))));q.allocateBuffer(q.ref('a'));const b=ok(l.reserve([]));ok(b.retain(q.ref('a'),'history',o));assert.throws(()=>q.allocateBuffer(q.ref('b')),/allocator fault/);assert.deepEqual(tuple(l),[256,256,128]);break;}
 case 7:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r,b]=live(l,o,768,'resident'),dest=ok(l.reserve([]));ok(l.registerExisting(new Uint8Array(b,0,16).buffer,dest,'resident',o));assert.deepEqual(tuple(l),[768,0,0]);break;}
 case 8:{const l=createResourceLedger(caps),o=l.createRealm(),target=l.createRealm(),[q,r]=live(l,o),b=ok(l.reserve([]));ok(b.retain(r,'resident',o));err(()=>q.transfer(r,target),'TRANSFER_ALIASED');break;}
 case 9:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r]=live(l,o);q.close();err(()=>q.transfer(r,o));break;}
 case 10:{const l=createResourceLedger(caps,{controls:{maxRealms:1}});l.createRealm();err(()=>l.createRealm(),'BUDGET');break;}
 case 11:{const backing=new ArrayBuffer(16),l=createResourceLedger(caps,{allocate:()=>backing}),o=l.createRealm();const q=ok(l.reserve([{key:'a',bytes:16,category:'job',owner:o},{key:'b',bytes:16,category:'resident',owner:o}]));q.allocateBuffer(q.ref('a'));err(()=>q.allocateBuffer(q.ref('b')));assert.deepEqual(tuple(l),[16,16,0]);break;}
 case 12:{const l=createResourceLedger(caps,{controls:{maxLeases:1}}),o=l.createRealm(),p={key:'a',bytes:16,category:'job',owner:o};err(()=>l.reserve([p,,{...p,key:'b'}]));assert.deepEqual(tuple(l),[0,0,0]);ok(l.reserve([p]));break;}
 case 13:{const l=createResourceLedger(),o=l.createRealm();assert.deepEqual(l.reserve([{key:'x',bytes:134217729,category:'job',owner:o}]),budget);break;}
 case 14:{const l=createResourceLedger(caps),o=l.createRealm(),[q,r]=reserve(l,o,16),dest=ok(l.reserve([]));dest.close();err(()=>dest.retain(r,'job',o),'CLOSED');break;}
 default:throw Error('Unknown cycle');
 }
 console.log(JSON.stringify({phase,passed:true,kind:'UNCHANGED_HISTORICAL_PRODUCTION_BEHAVIOR'}));
}catch(e){console.error(e.stack);console.log(JSON.stringify({phase,passed:false,kind:'UNCHANGED_HISTORICAL_PRODUCTION_BEHAVIOR'}));process.exitCode=1;}
