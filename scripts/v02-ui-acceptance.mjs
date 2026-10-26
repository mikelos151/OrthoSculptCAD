import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Do not build here: the parent owns the final candidate and parallel production changes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(root, 'docs/screenshots/v02-e2e');
mkdirSync(folder, { recursive: true });
const reportName = process.env.E2E_REPORT_NAME ?? 'final';
if (!/^[a-z0-9-]+$/.test(reportName)) throw new Error('Invalid E2E_REPORT_NAME');
const reportFile = resolve(folder, `${reportName}.json`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function manifest(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? manifest(path) : [{ path: relative(root, path).replaceAll('\\', '/'), sha256: sha256(readFileSync(path)) }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}
const before = manifest(resolve(root, 'dist'));
const run = spawnSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--reporter=line,json', `--output=docs/screenshots/v02-e2e/${reportName}-results`, ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile },
});
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
function collect(suites = [], parents = []) {
  return suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => ({
      file: spec.file, line: spec.line, title: [...parents, spec.title].join(' / '), status: test.status,
      expectedStatus: test.expectedStatus, attempts: test.results.map(result => ({ status: result.status, durationMs: result.duration, errors: result.errors.map(error => error.message) })),
    }))),
    ...collect(suite.suites, [...parents, suite.title]),
  ]);
}
const tests = collect(report.suites), after = manifest(resolve(root, 'dist'));
const summary = {
  command: 'node scripts/v02-ui-acceptance.mjs ' + process.argv.slice(2).join(' '),
  gitHead: git('rev-parse', 'HEAD'), gitStatus: git('status', '--short'), nodeVersion: process.version,
  playwrightVersion: JSON.parse(readFileSync(resolve(root, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
  baseURL: 'http://127.0.0.1:4176', buildWasRunByThisScript: false,
  distUnchangedDuringTests: JSON.stringify(before) === JSON.stringify(after), distBefore: before, distAfter: after,
  stats: report.stats, collectedTests: tests.length, tests,
};
writeFileSync(resolve(folder, `${reportName}-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ stats: summary.stats, collectedTests: tests.length, distUnchangedDuringTests: summary.distUnchangedDuringTests }));
process.exitCode = run.status ?? 1;
if (!summary.distUnchangedDuringTests) process.exitCode = 1;
