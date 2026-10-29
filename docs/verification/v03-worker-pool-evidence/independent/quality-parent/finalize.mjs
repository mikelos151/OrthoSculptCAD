import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo='C:/Users/sandr/OrthoSculptCAD';
const read=name=>JSON.parse(fs.readFileSync(path.join(here,name),'utf8'));
const review=read('review.json'), results=read('witness-results.json'), commands=read('commands.json'), start=read('input-start.json'), end=read('input-end.json');
assert.equal(review.passed,true);assert.deepEqual(review.security_concerns,[]);assert.deepEqual(review.logic_errors,[]);
assert.equal(results.tests,results.rows.length);assert.equal(results.passed,results.rows.filter(r=>r.passed).length);assert.equal(results.failed,0);assert.equal(results.assertions,results.rows.reduce((n,r)=>n+r.assertions,0));
for(const key of ['tests','passed','failed','assertions'])assert.equal(review.evidence.execution[key],results[key]);
assert.equal(commands.length,2);assert.ok(commands.every(c=>c.exit===0&&!c.signal&&!c.error));assert.deepEqual(start,end);assert.deepEqual(start,review.evidence.source_inputs);
for(const [file,sha]of Object.entries(end))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,file))).digest('hex'),sha);
const manifest={algorithm:'SHA256',excluded:['hashmanifest.json'],files:{}};
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){walk(file);continue;}const relative=path.relative(here,file).split(path.sep).join('/');if(relative==='hashmanifest.json')continue;const bytes=fs.readFileSync(file);manifest.files[relative]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}}
walk(here);fs.writeFileSync(path.join(here,'hashmanifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({verified:true,reviewPassed:true,tests:results.tests,assertions:results.assertions,inputFiles:Object.keys(end).length,artifactFiles:Object.keys(manifest.files).length}));
