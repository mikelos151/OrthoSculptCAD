import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repo='C:/Users/sandr/OrthoSculptCAD',dir='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-parent-red',fix='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix',quality='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-quality-review';
const paths=['src/compute/resourceLedger.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts','src/compute/workerPool.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md'];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const freeze=()=>Object.fromEntries(paths.map(p=>[p,hash(repo+'/'+p)]));
function save(name,data){writeFileSync(dir+'/'+name,typeof data==='string'?data:JSON.stringify(data,null,2));}
function run(name,args){const r=spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,NODE_OPTIONS:''},encoding:'utf8',timeout:90000});save(name+'.stdout.log',r.stdout??'');save(name+'.stderr.log',r.stderr??'');const meta={command:[process.execPath,...args],cwd:repo,actual_exit:r.status,signal:r.signal,error:r.error?String(r.error):null};save(name+'.command.json',meta);console.log(JSON.stringify(meta));return r.status;}
if(process.argv[2]==='init'){
 save('hashes-before.json',freeze());
 const config={compilerOptions:{target:'ES2022',module:'ES2022',moduleResolution:'bundler',lib:['ES2022','DOM'],types:[],strict:true,noUnusedLocals:true,noUnusedParameters:true,skipLibCheck:true,outDir:dir+'/compiled',rootDir:repo+'/src/compute'},files:paths.filter(p=>p.startsWith('src/')).map(p=>repo+'/'+p)};
 save('tsconfig.json',config);save('package.json',{type:'module'});
 for(const f of ['witness.mjs','loader.mjs'])copyFileSync(quality+'/'+f,dir+'/'+f);
 save('witness-copy-proof.json',{source:quality,files:Object.fromEntries(['witness.mjs','loader.mjs'].map(f=>[f,{source:hash(quality+'/'+f),copy:hash(dir+'/'+f)}]))});
 process.exitCode=run('strict128',['--max-old-space-size=128','--max-semi-space-size=8',repo+'/node_modules/typescript/bin/tsc','-p',dir+'/tsconfig.json'])??1;
}else if(process.argv[2]==='quality')process.exitCode=run('quality87',['--max-old-space-size=128','--max-semi-space-size=8','--loader','file:///'+dir+'/loader.mjs',dir+'/witness.mjs'])??1;
else if(process.argv[2]==='boundary')process.exitCode=run('boundary',['--max-old-space-size=128','--max-semi-space-size=8','--loader','file:///'+dir+'/loader.mjs',dir+'/boundary.mjs'])??1;
else if(process.argv[2]==='focused')process.exitCode=run('focused33',['--max-old-space-size=128','--max-semi-space-size=8',repo+'/node_modules/vitest/vitest.mjs','run','--config',dir+'/vitest.config.mjs','--configLoader','native','--reporter=verbose','--reporter=json','--outputFile.json='+dir+'/focused33-results.json'])??1;
else if(process.argv[2]==='audit'){
 const audit={};
 const read=(run,f)=>readFileSync(fix+'/runs/'+run+'/'+f,'utf8');
 for(const q of ['q1','q2']){
  const red=read(q+'-red','v03-native-handoff.test.ts'),green=read(q+'-green','v03-native-handoff.test.ts');
  audit[q]={identical_whole_tests:red===green,red_tests_sha256:hash(fix+'/runs/'+q+'-red/v03-native-handoff.test.ts'),green_tests_sha256:hash(fix+'/runs/'+q+'-green/v03-native-handoff.test.ts'),red_result:JSON.parse(read(q+'-red','result.json')),green_result:JSON.parse(read(q+'-green','result.json')),red_production_sha256:hash(fix+'/runs/'+q+'-red/nativeHandoff.ts'),green_production_sha256:hash(fix+'/runs/'+q+'-green/nativeHandoff.ts')};
 }
 const orig=readFileSync(fix+'/runs/baseline/v03-native-handoff.test.ts','utf8'),final=readFileSync(repo+'/tests/v03-native-handoff.test.ts','utf8');
 audit.old28={body_identical_except_import:final.startsWith(orig.replace("import { describe, expect, it } from 'vitest';","import { afterEach, describe, expect, it, vi } from 'vitest';")+'\n'),original_sha256:hash(fix+'/runs/baseline/v03-native-handoff.test.ts')};
 const report=JSON.parse(readFileSync(fix+'/focused-final-results.json','utf8'));
 audit.final_counts={total:report.numTotalTests,passed:report.numPassedTests,failed:report.numFailedTests,files:Object.fromEntries(report.testResults.map(t=>[t.name.split(/[\\/]/).at(-1),t.assertionResults.length]))};
 audit.coverage_only={classification:'existing-behavior coverage, not additional TDD',actual_exit:JSON.parse(read('failure-controls-existing-coverage','result.json')).actual_exit,production_unchanged_from_q2green:hash(fix+'/runs/q2-green/nativeHandoff.ts')===hash(fix+'/runs/failure-controls-existing-coverage/nativeHandoff.ts')};
 audit.vertical={q1green_equals_q2red:hash(fix+'/runs/q1-green/nativeHandoff.ts')===hash(fix+'/runs/q2-red/nativeHandoff.ts')};
 save('tdd-audit.json',audit);console.log(JSON.stringify(audit,null,2));
}else if(process.argv[2]==='end'){
 const end=freeze(),before=JSON.parse(readFileSync(dir+'/hashes-before.json'));save('hashes-after.json',end);console.log(JSON.stringify({unchanged:JSON.stringify(before)===JSON.stringify(end),hashes:end},null,2));
}else throw Error('phase');
