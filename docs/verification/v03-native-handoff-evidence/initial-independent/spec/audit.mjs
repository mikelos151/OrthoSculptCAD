import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
const out='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-spec-review';
const root='C:/Users/sandr/OrthoSculptCAD';
const evidence='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core';
const files=['src/compute/resourceLedger.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts','src/compute/workerPool.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const stamp=process.argv[2]??'start';
fs.writeFileSync(path.join(out,stamp+'-hashes.json'),JSON.stringify(hashes,null,2));
if(stamp==='end'){console.log(JSON.stringify({hashes,unchanged:JSON.stringify(hashes)===JSON.stringify(JSON.parse(fs.readFileSync(path.join(out,'start-hashes.json'),'utf8')))},null,2));process.exit(0);}
const g={stdout:fs.readFileSync(path.join(out,'original-resourceLedger.ts'),'utf8')};
const phases=JSON.parse(fs.readFileSync(path.join(evidence,'phase-index.json'),'utf8'));
const summary=phases.map(p=>({phase:p.phase,exit:p.exit,hashes:p.sourceTestHashes,files:fs.readdirSync(path.join(evidence,'phases',p.phase)),stdout:fs.existsSync(p.stdout)?fs.readFileSync(p.stdout,'utf8'):'',stderr:fs.existsSync(p.stderr)?fs.readFileSync(p.stderr,'utf8'):''}));
fs.writeFileSync(path.join(out,'phase-audit-raw.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({hashes,baselineSha:sha(g.stdout),phases:summary.map(p=>({phase:p.phase,exit:p.exit,files:p.files,stdoutTail:p.stdout.slice(-500),stderrTail:p.stderr.slice(-700)}))},null,2));
