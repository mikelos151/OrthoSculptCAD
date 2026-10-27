import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = 'C:/Users/sandr/OrthoSculptCAD';
const out = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
const source = fs.readFileSync(`${root}/src/trimline/numerics.ts`, 'utf8');
const built = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const modulePath = path.join(out, 'numerics.review.mjs');
fs.writeFileSync(modulePath, built.outputText, {flag: 'wx'});
const api = await import(pathToFileURL(modulePath).href);
const cases = JSON.parse(fs.readFileSync(path.join(out, 'additional-cases.json'), 'utf8'));
const context = (maxBits = 4096, maxOperations = 2000000) => api.createArithmeticContext({maxBits, maxOperations});
const code = (fn, wanted) => assert.throws(fn, e => e instanceof api.NumericsError && e.code === wanted && e.message === wanted);
const results = {rounding: {finite: 0, overflow: 0, conservative_budget: 0}, arithmetic_cases: 0, arithmetic_assertions: 0, resource_checks: 0};
for (const c of cases.rounding) {
  const ctx = context();
  const value = api.rational(BigInt(c.n), BigInt(c.d), ctx);
  let actual;
  try { actual = api.toFloat32Bits(value, ctx); }
  catch (e) {
    assert(e instanceof api.NumericsError);
    if (e.code === 'BUDGET_EXCEEDED') { results.rounding.conservative_budget++; continue; }
    assert.equal(e.code, 'FLOAT32_OVERFLOW');
    assert.equal(c.expected.kind, 'overflow');
    results.rounding.overflow++;
    continue;
  }
  assert.equal(c.expected.kind, 'finite');
  assert.equal(actual, c.expected.bits);
  results.rounding.finite++;
}
for (const c of cases.arithmetic) {
  const ctx = context();
  const make = ([n,d]) => api.rational(BigInt(n), BigInt(d), ctx);
  const a = make(c.a), b = make(c.b);
  for (const operation of ['add', 'subtract', 'multiply', 'divide']) {
    const result = api[operation](a,b,ctx);
    assert.deepEqual([result.n.toString(),result.d.toString()], c[operation]);
    results.arithmetic_assertions++;
  }
  assert.equal(api.compare(a,b,ctx), c.compare);
  results.arithmetic_assertions++;
  results.arithmetic_cases++;
}
// Invalid calls spend admission units; no coercion or raw input is disclosed.
{
  const ctx = context(64,6);
  let coercions = 0;
  const n = {toString(){coercions++; throw Error('leaked');}, valueOf(){coercions++; throw Error('leaked');}};
  for(let i=0;i<6;i++) code(()=>api.rational(n,1n,ctx),'INVALID_INPUT');
  code(()=>api.rational(0n,1n,ctx),'BUDGET_EXCEEDED');
  assert.equal(coercions,0);
  results.resource_checks++;
}
// Oversized caller-owned BigInts never reach abs/stringification/gcd.
{
  const huge = -(1n << 1000000n);
  const original = BigInt.prototype.toString;
  BigInt.prototype.toString = function(...args) { assert(this.valueOf() !== huge); return original.apply(this,args); };
  try {
    const ctx = context(64,6);
    code(()=>api.rational(huge,1n,ctx),'BUDGET_EXCEEDED');
    code(()=>api.rational(huge,1n,ctx),'BUDGET_EXCEEDED');
    code(()=>api.rational(0n,1n,ctx),'BUDGET_EXCEEDED');
  } finally { BigInt.prototype.toString = original; }
  results.resource_checks++;
}
// An authentic value from a larger context cannot bypass a smaller consumer's bound.
{
  const producer = context();
  const value = api.rational((1n<<100n)+1n, 1n, producer);
  for (const op of ['add','subtract','multiply','divide','compare']) {
    code(()=>api[op](value,value,context(64)),'BUDGET_EXCEEDED');
    results.resource_checks++;
  }
  code(()=>api.toFloat32Bits(value,context(64)),'BUDGET_EXCEEDED');
  results.resource_checks++;
  const low = context(128,10);
  code(()=>api.multiply(value,value,low),'BUDGET_EXCEEDED');
  code(()=>api.rational(0n,1n,low),'BUDGET_EXCEEDED');
  results.resource_checks++;
}
// Owned limits are copied, not referenced or coerced, including operation count.
{
  const limits = {maxBits:64,maxOperations:1};
  const ctx = api.createArithmeticContext(limits);
  limits.maxBits=4096; limits.maxOperations=2000000;
  code(()=>api.rational(1n,1n,ctx),'BUDGET_EXCEEDED');
  code(()=>api.rational(1n,1n,ctx),'BUDGET_EXCEEDED');
  let reads=0;
  code(()=>api.createArithmeticContext({maxBits:64,get maxOperations(){reads++; return 2000000;}}),'INVALID_INPUT');
  assert.equal(reads,0);
  code(()=>api.createArithmeticContext(Object.create({maxBits:64,maxOperations:1000})),'INVALID_INPUT');
  results.resource_checks++;
}
assert.equal(Object.values(results.rounding).reduce((a,b)=>a+b,0),cases.rounding.length);
fs.writeFileSync(path.join(out,'additional-results.json'),JSON.stringify(results,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results));
