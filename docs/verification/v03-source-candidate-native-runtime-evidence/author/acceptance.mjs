// Test-only artifact acceptance. No production code is changed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const path = fileURLToPath(new URL('./results.json', import.meta.url));
assert.ok(existsSync(path), 'Missing actual Chromium Worker evidence: results.json');
const r = JSON.parse(readFileSync(path, 'utf8'));
assert.equal(r.status, 'PASS');
assert.deepEqual(r.checks.map(c => [c.name, c.pass]), [
  ['independent-oracle', true], ['worker-local-input-mutation', true],
  ['pending-native-digest-dispose', true], ['opaque-handle-authentication', true],
  ['real-bind-cumulative-context', true],
]);
assert.equal(r.oracle.cases, 31); assert.equal(r.oracle.faces, 121);
assert.equal(r.oracle.uniqueRuntimeIds, 31);
assert.equal(r.cleanup.nativeWorkerConstructed, 1);
assert.equal(r.cleanup.nativeWorkerTerminated, 1);
assert.equal(r.cleanup.playwrightWorkerClosed, 1);
assert.equal(r.cleanup.workerClosedBeforeContextClose, true);
assert.equal(r.cleanup.browserDisconnected, true);
assert.equal(r.cleanup.serverStopped, true);
assert.equal(r.cleanup.serverPortRefused, true);
assert.deepEqual(r.externalRequests, []); assert.deepEqual(r.pageErrors, []);
assert.deepEqual(r.workerErrors, []);
assert.deepEqual(r.hashesStart, r.hashesEnd);
assert.match(r.browser.userAgent, /(?:HeadlessChrome|Chrome)\//);
assert.equal(r.nativeDigests.every(x => x.algorithm === 'SHA-256' && x.nativeSettled && /^[0-9a-f]{64}$/.test(x.digestHex)), true);
assert.equal(r.nativeDigests.length, 36);
assert.equal(r.runtimeIdentities.issued, r.runtimeIdentities.unique);
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
for (const artifact of manifest.artifacts) assert.equal(sha(readFileSync(artifact.path)), artifact.sha256, artifact.path);
for (const [relative, expected] of Object.entries(r.hashesStart)) assert.equal(sha(readFileSync('C:/Users/sandr/OrthoSculptCAD/' + relative)), expected, relative);
console.log(JSON.stringify({ status: 'PASS', behaviorChecks: r.checks.length, oracleCases: r.oracle.cases,
  oracleFaces: r.oracle.faces, nativeDigests: r.nativeDigests.length, cleanup: r.cleanup }, null, 2));
