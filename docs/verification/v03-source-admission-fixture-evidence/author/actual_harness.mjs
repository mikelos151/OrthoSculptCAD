// Scratch-only behavioral regression spike; no production/admission implementation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Preserve untouched bundler-mode ESNext compiler output. Node-only resolution
// shim adds .js to relative imports exclusively under this owned build folder.
const build = new URL('./build/', import.meta.url).href;
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith(build) && !specifier.endsWith('.js')) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}});
const { auditMesh } = await import('./build/geometry/audit.js');
const { createSourceCandidateStore } = await import('./build/trimline/source-candidate.js');
const { createArithmeticContext, rational } = await import('./build/trimline/numerics.js');
const { sampleCubic } = await import('./build/trimline/bezier.js');
const load = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const plain = object => JSON.parse(JSON.stringify(object, (_,v) => typeof v==='bigint' ? v.toString() : v));
const save = (name, object) => writeFileSync(new URL(name, import.meta.url), JSON.stringify(plain(object), null, 2)+'\n');
const policy = Object.freeze({ maxPairTests: 2_000_000, maxIntersections: 100 });
const required = ['edge-manifold','watertight','vertex-manifold','components','degenerate-triangles',
                  'winding','self-intersections','outward'];
// Merely observes the existing public report; this is NOT a private-source owner
// gate, token minting, authenticated audit schema or a production API.
function observedRequiredPass(report, faceCount) {
  return report.complete===true && report.triangleCount===faceCount &&
    report.orientation==='outward' && Number.isFinite(report.signedVolume) && report.signedVolume>0 &&
    report.intersections.length===0 && required.every(id => {
      const checks=report.checks.filter(c=>c.id===id);
      return checks.length===1 && checks[0].status==='pass';
    });
}
function meshFromLiteral(input) {
  const f32 = bits => new Float32Array(new Uint32Array(bits).buffer);
  return {name:input.name,source:input.source,positions:f32(input.positionsBits),indices:new Uint32Array(input.indices),
          colors:f32(input.colorsBits),uvs:f32(input.uvsBits)};
}
const catalog=load('catalog.json');
const proofs=[], rows=[], reports={};
let baselineLocal, baselineProof;
assert.equal(globalThis.crypto.constructor.name, 'Crypto');
assert.equal(globalThis.crypto.subtle.constructor.name, 'SubtleCrypto');
const nativeCrypto = { globalCrypto:globalThis.crypto.constructor.name,
                       subtle:globalThis.crypto.subtle.constructor.name,
                       monkeyPatched:false, algorithm:'SHA-256',
                       implementation:'Actual source-candidate capture calls native Node WebCrypto; no injected digest.' };
for (const c of catalog.cases) {
  const mesh=meshFromLiteral(c.mesh);
  const store=createSourceCandidateStore({maxOwnedBufferBytes:16384});
  try {
    const handle=await store.capture(mesh,c.stamp);
    const description=store.describe(handle);
    assert.equal(description.sourceDigest,c.expected.sourceDigest,'whole-source Python hashlib vs native WebCrypto');
    assert.equal(description.faceCount,c.expected.faceCount);
    assert.equal(description.vertexCount,c.expected.vertexCount);
    assert.deepEqual(description.stamp,c.stamp);
    assert.equal('audited' in description,false);
    const ctx=createArithmeticContext({maxBits:4096,maxOperations:2_000_000});
    const q=text=>{const [n,d='1']=text.split('/'); return rational(BigInt(n),BigInt(d),ctx);};
    // Same ctx from ordered resolution through all bound-cubic arithmetic and sampling.
    for (const expected of c.expected.faces) {
      const face=store.resolveFace(handle,expected.sourceFace,ctx);
      assert.deepEqual(plain({sourceFace:face.sourceFace,vertexIDs:face.vertexIDs,
                             positionBits:face.positionBits,triangle:face.triangle}),expected);
    }
    const weights=catalog.barycentricControls.map(row=>row.map(q));
    const span=store.bindFaceCubic(handle,0,weights,ctx);
    const tolerance=q('1/200');
    const approximation=sampleCubic(span.containment.controls,tolerance,
                                   {maxDepth:16,maxNodes:1000,maxSegments:500},ctx);
    assert.ok(approximation.leaves.length>0);
    const local=plain({vertexIDs:span.face.vertexIDs,positionBits:span.face.positionBits,
                       triangle:span.face.triangle,containment:span.containment,approximation});
    const proof={id:c.id,tolerance,containment:span.containment,approximation};
    if (!baselineLocal) { baselineLocal=local; baselineProof=plain(proof); }
    assert.deepEqual(local,baselineLocal,'actual unchanged ordered local cubic + full approximation');
    assert.deepEqual(plain({...proof,id:baselineProof.id}),baselineProof);
    proofs.push(proof);
    // Public audit explicitly runs on caller input, NOT on inaccessible private candidate bytes.
    const report=auditMesh(mesh,policy);
    reports[c.id]=report;
    assert.equal(report.checks.find(x=>x.id==='minimum-thickness').status,'unknown');
    const observed=observedRequiredPass(report,description.faceCount);
    const valid=c.id==='TESTDATA-positive-S'||c.id==='TESTDATA-valid-distant-face-order';
    assert.equal(observed,valid);
    if (c.id==='TESTDATA-selfcross-remote-v6') {
      assert.equal(report.checks.find(x=>x.id==='self-intersections').status,'fail');
      assert.ok(report.intersections.some(([a,b])=>a===0&&b===2),'actual hit includes exact analytically proven pair');
      assert.equal(report.orientation,'unknown');
      for (const id of ['edge-manifold','watertight','vertex-manifold','components','degenerate-triangles','winding']) {
        assert.equal(report.checks.find(x=>x.id===id).status,'pass');
      }
    }
    if (c.id==='TESTDATA-remove-distant-face2') {
      assert.equal(report.checks.find(x=>x.id==='watertight').status,'fail');
    }
    if (c.id==='TESTDATA-duplicate-distant-face2') {
      assert.equal(report.checks.find(x=>x.id==='edge-manifold').status,'fail');
      assert.equal(report.checks.find(x=>x.id==='watertight').status,'fail');
    }
    rows.push({id:c.id,sourceDigest:description.sourceDigest,runtimeSourceId:description.sourceId,
      faceCount:description.faceCount,localCandidate:'PASS (binding + actual sampleCubic only; not source authority)',
      leaves:approximation.leaves.length,samples:approximation.samples.length,
      observedRequiredAuditPass:observed,complete:report.complete,orientation:report.orientation,
      signedVolume:report.signedVolume,intersectionPairs:report.intersections,
      checkStatuses:Object.fromEntries(report.checks.map(x=>[x.id,x.status]))});
  } finally {store.dispose();}
}
assert.equal(new Set(rows.map(r=>r.sourceDigest)).size,5);
const positive=rows[0];
const budgetZero=auditMesh(meshFromLiteral(catalog.cases[0].mesh),{...policy,maxPairTests:0});
assert.equal(budgetZero.complete,false);
assert.equal(budgetZero.candidateTests,0);
assert.equal(budgetZero.checks.find(x=>x.id==='self-intersections').status,'unknown');
assert.equal(budgetZero.orientation,'unknown');
assert.equal(observedRequiredPass(budgetZero,12),false);
reports['TESTDATA-positive-S-pair-budget-0']=budgetZero;
save('actual-positive-audit.json',reports[positive.id]);
save('actual-audit-reports.json',reports);
save('actual-local-face-proof.json',{format:'OrthoSculptFaceCubicProof',version:1,cases:proofs});
const savedReport=load('actual-positive-audit.json');
assert.deepEqual(savedReport,plain(reports[positive.id]));
const claims=[];
for (const row of rows.filter(r=>!r.observedRequiredAuditPass)) {
  const claim={label:'SYNTHETIC UNTRUSTED CLAIM ONLY: mutated mesh + recomputed valid digest + unchanged old required-check PASS report. '
                     +'Not an API response, not a production project reload format, no trusted audit/admission token.',
    caseId:row.id,meshCatalogCaseId:row.id,recomputedSourceDigest:row.sourceDigest,
    savedAuditOriginCaseId:positive.id,savedAuditOriginDigest:positive.sourceDigest,
    savedAuditRequiredChecksClaim:'PASS for old positive S only; minimum-thickness remains UNKNOWN',
    unchangedSavedAudit:savedReport};
  assert.notEqual(claim.recomputedSourceDigest,positive.sourceDigest);
  assert.deepEqual(claim.unchangedSavedAudit,savedReport);
  assert.equal(observedRequiredPass(reports[row.id],row.faceCount),false);
  claims.push(claim);
}
save('synthetic-untrusted-saved-PASS-claims.json',{label:'SCRATCH EXPERIMENT; NEVER TRUST THESE ASSOCIATIONS',claims});
save('actual-results.json',{scope:'Existing code behavior only. No source admission/owner/token/Worker fence implemented.',
  nativeCrypto,policy,auditResourceCapsUnchanged:{vertices:200000,faces:200000},rows,
  budgetZero:{complete:budgetZero.complete,candidateTests:budgetZero.candidateTests,
    selfIntersections:budgetZero.checks.find(c=>c.id==='self-intersections').status,
    outward:budgetZero.orientation,observedRequiredAuditPass:false},
  untrustedClaimCount:claims.length,
  boundary:'auditMesh ran on explicit public input mesh separate from Candidate private bytes. '
           +'Even positive candidates are not authority; this does NOT close tracer4 admission.'});
console.log(JSON.stringify({caseCount:rows.length,localCandidatePass:rows.length,
  requiredAuditPass:rows.filter(r=>r.observedRequiredAuditPass).map(r=>r.id),
  blockedByFreshAudit:rows.filter(r=>!r.observedRequiredAuditPass).map(r=>r.id),
  budgetZero:'UNKNOWN',untrustedSavedPASSClaims:claims.length,
  rows:rows.map(({id,sourceDigest,leaves,complete,orientation,intersectionPairs,checkStatuses})=>
    ({id,sourceDigest,leaves,complete,orientation,intersectionPairs,checkStatuses}))},null,2));
