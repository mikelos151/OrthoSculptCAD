import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('C:/Users/sandr/OrthoSculptCAD/node_modules/typescript');
const base='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-worker-pool-core/phases/';
const audit=JSON.parse(readFileSync(new URL('./evidence-audit.json',import.meta.url),'utf8'));
function tests(path){const text=readFileSync(path,'utf8');const sf=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);const out={};function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='it'&&ts.isStringLiteral(n.arguments[0]))out[n.arguments[0].text]=n.arguments[1].getText(sf);ts.forEachChild(n,visit);}visit(sf);return out;}
const final=tests(base+'final-green/v03-worker-pool.test.ts');const changed=[];
for(const p of audit.phases){const old=tests(base+p.phase+'/v03-worker-pool.test.ts');for(const [name,body] of Object.entries(old))if(final[name]!==body)changed.push({phase:p.phase,name,before:body,after:final[name]});}
const short=audit.phases.map(p=>({phase:p.phase,exit:p.command.exit,tests:p.test_names.length,summary:p.summary}));
writeFileSync(new URL('./tdd-details.json',import.meta.url),JSON.stringify({phases:short,final_body_changes:changed},null,2));
console.log(JSON.stringify({phases:short,changed_test_names:[...new Set(changed.map(c=>c.name))]},null,2));
