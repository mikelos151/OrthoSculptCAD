'use strict';
// Harness only. Geometry and certificates come from unmodified compiled TS.
const fs = require('node:fs');
const path = require('node:path');
const num = require('./compiled/numerics.js');
const {certifyFaceCubic} = require('./compiled/face-cubic.js');
const {sampleCubic} = require('./compiled/bezier.js');
const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ctx = num.createArithmeticContext({maxBits: 1024, maxOperations: 2000000});
const rat = x => num.rational(BigInt(x.n), BigInt(x.d), ctx);
const cases = [];
for (const c of request.cases) {
  const triangle = c.triangleBits.map(row => row.map(x => num.fromFloat32Bits(x, ctx)));
  const weights = c.barycentricControls.map(row => row.map(rat));
  const tolerance = rat(c.tolerance);
  const containment = certifyFaceCubic(triangle, weights, ctx);
  const approximation = sampleCubic(containment.controls, tolerance,
    {maxDepth: 20, maxSegments: 2000, maxNodes: 4000}, ctx);
  cases.push({id: c.id, tolerance, containment, approximation});
}
const proof = {format: 'OrthoSculptFaceCubicProof', version: 1, cases};
fs.writeFileSync(process.argv[3], JSON.stringify(proof, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2), {flag: 'wx'});
console.log(JSON.stringify({producer: 'real-existing-TS', cases: cases.length,
  leaves: cases.reduce((n,c) => n+c.approximation.leaves.length, 0), sameContextForEntireBundle: true}));
