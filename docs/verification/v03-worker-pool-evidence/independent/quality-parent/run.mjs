import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Users/sandr/OrthoSculptCAD';
const expected={
  'src/compute/workerPool.ts':'b5a7457bde19616b61247ca690bf2b1bc5f387cd3067db3ad56cb9c115878e64',
  'tests/v03-worker-pool.test.ts':'0f977cb7b128492ec33667f805c553de074d1417c60c08bacd6316c0190bc5a7',
  'src/compute/resourceLedger.ts':'f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109',
  'docs/plans/v03-native-broker-g1b-design.md':'45cc11a03a92218670bff1fdf77d5fcd1c8f089a318044bdfe9269cecd1285a3'
};
function hashes(){return Object.fromEntries(Object.keys(expected).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,f))).digest('hex')]));}
function check(h){for(const [f,sha]of Object.entries(expected))if(h[f]!==sha)throw Error('FROZEN INPUT CHANGED '+f+' actual='+h[f]);}
const start=hashes();check(start);fs.writeFileSync(path.join(here,'input-start.json'),JSON.stringify(start,null,2)+'\n');
const commands=[];
function run(label,args){const r=spawnSync(process.execPath,args,{cwd:here,encoding:'utf8',maxBuffer:8*1024*1024});const raw=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(here,label+'.log'),raw);const row={label,command:[process.execPath,...args],cwd:here,exit:r.status,signal:r.signal,error:r.error?.message??null};commands.push(row);console.log(JSON.stringify(row));console.log(raw);return r.status===0;}
const patterns={hardcoded_secret:/\b(?:api_key|secret|password|passwd|token)\s*[:=]\s*['\"][^'\"]{6,}['\"]/ig,dynamic_eval:/\b(?:eval|Function)\s*\(/g,direct_network_or_process:/\b(?:fetch|XMLHttpRequest|WebSocket|exec|execSync|spawn|spawnSync)\s*\(/g};
const scan={};
for (const f of ['src/compute/workerPool.ts','tests/v03-worker-pool.test.ts']) {
  const text=fs.readFileSync(path.join(repo,f),'utf8');
  scan[f]=Object.fromEntries(Object.entries(patterns).map(([key,re]) => [
    key,
    [...text.matchAll(re)].map(m => ({line:text.slice(0,m.index).split('\n').length,match:m[0]}))
  ]));
}
const staticReport={note:'Read-only lexical scan, supplemental to manual full-file review; not a complete security proof',typescript:JSON.parse(fs.readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8')).version,files:scan};fs.writeFileSync(path.join(here,'static-scan.json'),JSON.stringify(staticReport,null,2)+'\n');
let passed=run('compile',['--max-old-space-size=128','--max-semi-space-size=8',path.join(repo,'node_modules/typescript/bin/tsc'),'-p',path.join(here,'tsconfig.json')]);
if(passed)passed=run('unit-witnesses',['--max-old-space-size=128','--max-semi-space-size=8',path.join(here,'witnesses.cjs')]);
fs.writeFileSync(path.join(here,'commands.json'),JSON.stringify(commands,null,2)+'\n');const end=hashes();fs.writeFileSync(path.join(here,'input-end.json'),JSON.stringify(end,null,2)+'\n');check(end);console.log('INPUT HASHES UNCHANGED');process.exitCode=passed?0:1;
