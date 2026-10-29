import { spawnSync } from 'node:child_process';
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const repo = 'C:/Users/sandr/OrthoSculptCAD';
for (const file of ['native-results.json','native-hashes.json','native-cli.log']) if (existsSync(dir + '/' + file)) copyFileSync(dir + '/' + file, dir + '/initial-' + file);
const commands = [];
for (const [label, args] of [
  ['unit-final', [dir + '/phase.mjs', 'final-green']],
  ['tsc-final', ['--max-old-space-size=512', repo + '/node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
  ['native-final', ['--max-old-space-size=256', '--max-semi-space-size=8', dir + '/native-cli.mjs']],
]) {
  const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 120000 });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(dir + '/' + label + '.log', output);
  commands.push({ label, command: [process.execPath, ...args], exit: result.status, signal: result.signal, error: String(result.error ?? '') });
  writeFileSync(dir + '/final-commands.json', JSON.stringify(commands, null, 2));
  console.log(label, 'ACTUAL_EXIT', result.status, output);
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
