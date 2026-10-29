import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'C:/Users/sandr/OrthoSculptCAD/node_modules/typescript/lib/typescript.js';
const source='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts/phases';
const out=new URL('./historical/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const manifest=[];
for(let i=1;i<=14;i++)for(const color of ['RED','GREEN']){
 const phase=i===12&&color==='RED'?'12b-RED':String(i).padStart(2,'0')+'-'+color;
 const input=fs.readFileSync(source+'/'+phase+'/resourceLedger.ts');
 const output=ts.transpileModule(input.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},fileName:'resourceLedger.ts'}).outputText;
 fs.writeFileSync(new URL(phase+'.mjs',out),output);
 manifest.push({phase,sourceSha256:crypto.createHash('sha256').update(input).digest('hex'),emittedSha256:crypto.createHash('sha256').update(output).digest('hex')});
}
fs.writeFileSync(new URL('historical-transpile-manifest.json',import.meta.url),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({emitted:manifest.length,unchangedHistoricalTS:true,typechecked:false,kind:'TRANSPILE_ONLY_HISTORICAL_RUNTIME_REPLAY'}));
