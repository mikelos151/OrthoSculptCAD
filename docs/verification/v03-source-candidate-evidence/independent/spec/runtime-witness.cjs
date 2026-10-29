const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = __dirname;
const repo = 'C:/Users/sandr/OrthoSculptCAD';
const numerics = require('./compiled/trimline/numerics.js');
const faceCubic = require('./compiled/trimline/face-cubic.js');
const { sampleCubic } = require('./compiled/trimline/bezier.js');
const { createSourceCandidateStore } = require('./compiled/trimline/source-candidate.js');
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/v03-source-candidate-oracle.json'), 'utf8'));
const serial = x => JSON.parse(JSON.stringify(x, (_, v) => typeof v === 'bigint' ? String(v) : v));
const ctx = (maxOperations = 2000000) => numerics.createArithmeticContext({maxBits:4096,maxOperations});
const fromBits = b => new Float32Array(Uint32Array.from(b).buffer);
function mesh(c) {
  const m = c.mesh;
  return {name:m.name,positions:fromBits(m.positionsBits),indices:Uint32Array.from(m.indices),
    ...(m.colorsBits ? {colors:fromBits(m.colorsBits)} : {}), ...(m.uvsBits ? {uvs:fromBits(m.uvsBits)} : {}),
    ...(m.source === undefined ? {} : {source:m.source}), ...(m.textureUrl === undefined ? {} : {textureUrl:m.textureUrl})};
}
function freezeCheck(x) {
  if (!x || typeof x !== 'object') return;
  assert(!ArrayBuffer.isView(x)); assert(!(x instanceof ArrayBuffer)); assert(Object.isFrozen(x));
  for (const v of Object.values(x)) freezeCheck(v);
}
(async () => {
  let faceCount = 0, shaCount = 0;
  const sourceIds = new Set(), outputs = [], capturedBytes = [];
  const nativeDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const originalDigest = globalThis.crypto.subtle.digest;
  globalThis.crypto.subtle.digest = async (algorithm,data) => {
    shaCount++; capturedBytes.push(Buffer.from(data).toString('hex'));
    return nativeDigest(algorithm,data);
  };
  for (const c of fixture.cases) {
    // Validate literal arrays before any numeric typed-array conversion.
    for (const field of ['positionsBits','indices','colorsBits','uvsBits']) {
      if (!(field in c.mesh)) continue;
      const a = c.mesh[field]; assert(Array.isArray(a)); assert(a.length <= 600000);
      for(let i=0;i<a.length;i++) {assert(Object.hasOwn(a,i)); assert(Number.isInteger(a[i])); assert(a[i]>=0 && a[i]<=0xffffffff);}
    }
    const store = createSourceCandidateStore({maxOwnedBufferBytes:1048576});
    const m = mesh(c), stamp = {...c.stamp};
    // Untrusted metadata is not identity authority and must not be inspected.
    for (const key of ['sourceId','sourceDigest','audited']) Object.defineProperty(m,key,{get(){throw Error('untrusted extra metadata inspected');}});
    const pending = store.capture(m,stamp);
    m.positions.fill(33); m.indices.fill(0); m.colors?.fill(1); m.uvs?.fill(7); m.name='caller changed'; stamp.revision++;
    const h = await pending, d = store.describe(h);
    assert.equal(d.sourceDigest,c.expected.sourceDigest); assert.equal(d.vertexCount,c.expected.vertexCount);
    assert.equal(d.faceCount,c.expected.faceCount); assert.deepEqual(d.stamp,c.stamp);
    assert(!sourceIds.has(d.sourceId)); sourceIds.add(d.sourceId);
    assert.equal(d.kind,'owned-source-candidate-v1'); assert(!('audited' in d));
    const arithmetic = ctx(), faces = [];
    for (const expected of c.expected.faces) {
      const f = store.resolveFace(h,expected.sourceFace,arithmetic);
      assert.deepEqual(serial({sourceFace:f.sourceFace,vertexIDs:f.vertexIDs,positionBits:f.positionBits,triangle:f.triangle}),expected);
      freezeCheck(f); faces.push(serial(f)); faceCount++;
    }
    freezeCheck(h); outputs.push({id:c.id,description:d,faces}); store.dispose();
  }
  globalThis.crypto.subtle.digest = originalDigest;
  assert.equal(shaCount,fixture.cases.length);
  const proof = {format:'OrthoSculptFaceCubicProof',version:1,cases:[]};
  const bound = [], decoderCalls = [], certifierCalls = [];
  const originalDecode = numerics.fromFloat32Bits, originalCert = faceCubic.certifyFaceCubic;
  numerics.fromFloat32Bits = (bits,context) => {decoderCalls.push(context); return originalDecode(bits,context);};
  faceCubic.certifyFaceCubic = (tri,w,context) => {certifierCalls.push({tri,w,context}); return originalCert(tri,w,context);};
  for (const id of ['TESTDATA-tetra-base','TESTDATA-negative-zero','TESTDATA-dyadic','TESTDATA-ordered-single-triangle']) {
    const c = fixture.cases.find(c => c.id===id), store = createSourceCandidateStore({maxOwnedBufferBytes:1048576});
    const m=mesh(c), p=store.capture(m,c.stamp); m.positions.fill(100); m.indices.fill(0); const h=await p;
    const arithmetic=ctx(), q=(n,d=1)=>numerics.rational(BigInt(n),BigInt(d),arithmetic);
    const w=[[q(1),q(0),q(0)],[q(1,2),q(1,2),q(0)],[q(0),q(1,2),q(1,2)],[q(0),q(0),q(1)]];
    const before=decoderCalls.length, s=store.bindFaceCubic(h,0,w,arithmetic);
    assert.equal(decoderCalls.length-before,9); assert(decoderCalls.slice(before).every(c=>c===arithmetic));
    const call=certifierCalls.at(-1); assert.strictEqual(call.tri,s.face.triangle); assert.strictEqual(call.w,w); assert.strictEqual(call.context,arithmetic);
    assert.deepEqual(serial(s.face.triangle),c.expected.faces[0].triangle);
    assert.deepEqual(s.containment.triangle,s.face.triangle);
    const tolerance=q(1,200), approximation=sampleCubic(s.containment.controls,tolerance,{maxDepth:16,maxNodes:1000,maxSegments:500},arithmetic);
    freezeCheck(s); freezeCheck(approximation);
    proof.cases.push(serial({id,tolerance,containment:s.containment,approximation}));
    bound.push({id,span:serial(s)}); store.dispose();
  }
  // Independent near-plate and ordering composition through the actual store.
  const closeMesh = {name:'TESTDATA near plates',source:'synthetic',
    positions:new Float32Array([2,0,-0,3,0,0,3,1,0,2,1,0,2,0,1/1024,3,0,1/1024,3,1,1/1024,2,1,1/1024]),
    indices:new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7])};
  const plateStore=createSourceCandidateStore({maxOwnedBufferBytes:4096});
  const plateHandle=await plateStore.capture(closeMesh,fixture.cases[0].stamp), arithmetic=ctx();
  const q=(n,d=1)=>numerics.rational(BigInt(n),BigInt(d),arithmetic);
  const w=[[q(1,2),q(1,3),q(1,6)],[q(1),q(0),q(0)],[q(0),q(1),q(0)],[q(0),q(0),q(1)]];
  const a=plateStore.bindFaceCubic(plateHandle,0,w,arithmetic), b=plateStore.bindFaceCubic(plateHandle,2,w,arithmetic);
  assert.deepEqual(a.face.vertexIDs,[0,2,1]); assert.deepEqual(b.face.vertexIDs,[4,5,6]);
  assert.deepEqual(a.containment.controls[0][2],q(0)); assert.deepEqual(b.containment.controls[0][2],q(1,1024));
  plateStore.release(plateHandle);
  [closeMesh.indices[1],closeMesh.indices[2]]=[closeMesh.indices[2],closeMesh.indices[1]];
  const permutedHandle=await plateStore.capture(closeMesh,fixture.cases[0].stamp);
  const wrong=plateStore.bindFaceCubic(permutedHandle,0,w,arithmetic);
  const permutedWeights=w.map(r=>[r[0],r[2],r[1]]);
  const corrected=plateStore.bindFaceCubic(permutedHandle,0,permutedWeights,arithmetic);
  assert.notDeepEqual(wrong.containment.controls,a.containment.controls);
  assert.deepEqual(corrected.containment.controls,a.containment.controls);
  assert.notDeepEqual(corrected.face.vertexIDs,a.face.vertexIDs);
  assert.notEqual(corrected.face.source.sourceDigest,a.face.source.sourceDigest);
  for(const [id,s] of [['near-plate-a',a],['near-plate-b',b],['ordering-without-weight-permutation',wrong],['ordering-with-weight-permutation',corrected]]) {
    const tolerance=q(1,200), approximation=sampleCubic(s.containment.controls,tolerance,{maxDepth:16,maxNodes:1000,maxSegments:500},arithmetic);
    proof.cases.push(serial({id,tolerance,containment:s.containment,approximation}));
    bound.push({id,span:serial(s)}); freezeCheck(s); freezeCheck(approximation);
  }
  plateStore.dispose();
  assert(decoderCalls.slice(36).every(c=>c===arithmetic));
  assert(certifierCalls.slice(4).every(c=>c.context===arithmetic));
  numerics.fromFloat32Bits=originalDecode; faceCubic.certifyFaceCubic=originalCert;
  // Check a validation hypothesis: line terminators must not pass the frame alphabet.
  const invalidFrames=[];
  for (const frameId of ['A\n','A\r','A\r\n','A\u2028','A\u2029','A B','']) {
    const store=createSourceCandidateStore({maxOwnedBufferBytes:4096});
    try { const h=await store.capture(mesh(fixture.cases[0]),{...fixture.cases[0].stamp,frameId});
      invalidFrames.push({frameId,accepted:true,returnedFrame:store.describe(h).stamp.frameId}); }
    catch(e) {invalidFrames.push({frameId,accepted:false,error:e.code});}
    store.dispose();
  }
  const exhausted=ctx(1), store=createSourceCandidateStore({maxOwnedBufferBytes:4096});
  const h=await store.capture(mesh(fixture.cases[0]),fixture.cases[0].stamp);
  assert.throws(()=>store.resolveFace(h,0,exhausted),e=>e.name==='NumericsError' && e.code==='BUDGET_EXCEEDED');
  assert.throws(()=>numerics.rational(0n,1n,exhausted),e=>e.code==='BUDGET_EXCEEDED'); store.dispose();
  fs.writeFileSync(path.join(root,'runtime-actual.json'),JSON.stringify({outputs,capturedBytes,bound,invalidFrames},null,2));
  fs.writeFileSync(path.join(root,'actual-face-proof.json'),JSON.stringify(proof,null,2));
  const result={fixtureCases:fixture.cases.length,faces:faceCount,uniqueDigests:new Set(outputs.map(x=>x.description.sourceDigest)).size,
    uniqueRuntimeIds:sourceIds.size,nativeShaCalls:shaCount,boundSpans:bound.length,sameContextDecoderCalls:decoderCalls.length,
    sameContextCertifierCalls:certifierCalls.length,invalidFrames,
    frameAlphabetAllInvalidRejected:invalidFrames.every(x=>!x.accepted)};
  assert(result.frameAlphabetAllInvalidRejected);
  fs.writeFileSync(path.join(root,'runtime-results.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
