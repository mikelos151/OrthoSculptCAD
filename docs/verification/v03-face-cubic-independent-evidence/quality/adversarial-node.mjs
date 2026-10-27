import fs from 'node:fs';
import assert from 'node:assert/strict';
import {certifyFaceCubic} from './face-cubic.mjs';
import {createArithmeticContext,rational} from './numerics.mjs';
import {sampleCubic} from './bezier.mjs';
const fresh=()=>createArithmeticContext({maxBits:4096,maxOperations:2000000});
const cases=JSON.parse(fs.readFileSync(new URL('./random-inputs.json',import.meta.url),'utf8'));
const results=[], proofCases=[];
let getterHits=0,shapeAssertions=0,scalarAssertions=0;
for(const test of cases) {
 const ctx=fresh();
 const decode=rows=>rows.map(row=>row.map(q=>rational(BigInt(q.n),BigInt(q.d),ctx)));
 const t=decode(test.triangle), w=decode(test.weights);
 const out=certifyFaceCubic(t,w,ctx);
 results.push(out);
 if(test.constant) {
  const tolerance=rational(1n,200n,ctx);
  const approximation=sampleCubic(out.controls,tolerance,{maxDepth:0,maxSegments:1,maxNodes:1},ctx);
  proofCases.push({id:`review-constant-${proofCases.length}`,tolerance,containment:out,approximation});
 }
 assert(Object.isFrozen(out)&&Object.isFrozen(out.controls));
 assert(!Object.isFrozen(t)&&!Object.isFrozen(w));
}
const ctx=fresh(), q=n=>rational(BigInt(n),1n,ctx);
const triangle=[[q(0),q(0),q(0)],[q(1),q(0),q(0)],[q(0),q(1),q(0)]];
const weights=Array.from({length:4},()=>[q(1),q(0),q(0)]);
const getter={get(){getterHits++;throw Error('getter called');}};
// Input methods, extras, and null/custom prototypes must not be consulted.
for(const array of [triangle,weights,...triangle,...weights]) {
 for(const key of ['map','slice','forEach','valueOf','toString','constructor',Symbol.iterator,Symbol.toPrimitive]) Object.defineProperty(array,key,getter);
 Object.setPrototypeOf(array,null);
}
certifyFaceCubic(triangle,weights,fresh());
for(let i=0;i<21;i++) {
 const t=Array.from({length:3},(_,r)=>Array.from({length:3},(_,c)=>triangle[r][c]));
 const w=Array.from({length:4},(_,r)=>Array.from({length:3},(_,c)=>weights[r][c]));
 const fake=Object.create(null,{n:getter,d:getter,valueOf:getter,toString:getter});
 if(i<9)t[Math.floor(i/3)][i%3]=fake;else w[Math.floor((i-9)/3)][(i-9)%3]=fake;
 assert.throws(()=>certifyFaceCubic(t,w,fresh()),e=>e.name==='NumericsError'&&e.code==='INVALID_INPUT'); scalarAssertions++;
}
for(const isTriangle of [true,false]) for(let row=0;row<(isTriangle?3:4);row++)for(let axis=0;axis<3;axis++) {
 const t=Array.from({length:3},(_,r)=>Array.from({length:3},(_,c)=>triangle[r][c]));
 const w=Array.from({length:4},(_,r)=>Array.from({length:3},(_,c)=>weights[r][c]));
 Object.defineProperty((isTriangle?t:w)[row],axis,getter);
 assert.throws(()=>certifyFaceCubic(t,w,fresh()),e=>e.name==='FaceCubicError'&&e.code==='INVALID_INPUT');shapeAssertions++;
}
assert.equal(getterHits,0);
fs.writeFileSync(new URL('./random-results.json',import.meta.url),JSON.stringify(results,(_k,v)=>typeof v==='bigint'?v.toString():v));
fs.writeFileSync(new URL('./random-constant-proofs.json',import.meta.url),JSON.stringify({format:'OrthoSculptFaceCubicProof',version:1,cases:proofCases},(_k,v)=>typeof v==='bigint'?v.toString():v));
console.log(JSON.stringify({randomMappedCases:results.length,realConstantProofs:proofCases.length,scalarAssertions,shapeAssertions,getterHits,customPrototypesAccepted:true}));
