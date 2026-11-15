import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='C:/Users/sandr/OrthoSculptCAD', dir='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-quality-review';
mkdirSync(dir,{recursive:true});
const files=['src/compute/resourceLedger.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts','src/compute/workerPool.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md'];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const freeze=()=>Object.fromEntries(files.map(p=>[p,hash(root+'/'+p)]));
const phase=process.argv[2]??'start';
function run(name,args,cwd=root){const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:90000,env:{...process.env,NODE_OPTIONS:''}});const command={command:[process.execPath,...args],cwd,actual_exit:result.status,signal:result.signal,error:result.error?String(result.error):null};writeFileSync(dir+'/'+name+'.command.json',JSON.stringify(command,null,2));writeFileSync(dir+'/'+name+'.stdout.log',result.stdout??'');writeFileSync(dir+'/'+name+'.stderr.log',result.stderr??'');console.log(JSON.stringify(command));if(name.startsWith('witness-') && existsSync(dir+'/witness-results.json')){const w=JSON.parse(readFileSync(dir+'/witness-results.json'));console.log(JSON.stringify({total:w.total,passed:w.passed,failed:w.failed,failures:w.results.filter(r=>!r.passed),observations:w.observations},null,2));}else console.log(result.stdout??'',result.stderr??'');return result.status;}
if(phase==='start'){
 if(existsSync(dir+'/input-start.json'))throw Error('start already frozen');writeFileSync(dir+'/input-start.json',JSON.stringify(freeze(),null,2));
 const config={compilerOptions:{target:'ES2022',module:'ES2022',moduleResolution:'bundler',lib:['ES2022','DOM'],types:[],strict:true,noUnusedLocals:true,noUnusedParameters:true,skipLibCheck:true,outDir:dir+'/compiled',rootDir:root+'/src/compute'},files:files.filter(p=>p.startsWith('src/')).map(p=>root+'/'+p)};
 writeFileSync(dir+'/tsconfig.json',JSON.stringify(config,null,2));writeFileSync(dir+'/package.json',JSON.stringify({type:'module'}));
 process.exitCode=run('strict128',['--max-old-space-size=128','--max-semi-space-size=8',root+'/node_modules/typescript/bin/tsc','-p',dir+'/tsconfig.json'])??1;
}else if(phase==='witness'){
 let attempt=1;while(existsSync(dir+'/witness-'+attempt+'.command.json'))attempt++;
 process.exitCode=run('witness-'+attempt,['--max-old-space-size=128','--max-semi-space-size=8','--loader','file:///'+dir+'/loader.mjs',dir+'/witness.mjs'],dir)??1;
}
else if(phase==='end'){
 const end=freeze(),start=JSON.parse(readFileSync(dir+'/input-start.json'));writeFileSync(dir+'/input-end.json',JSON.stringify(end,null,2));console.log(JSON.stringify({unchanged:JSON.stringify(end)===JSON.stringify(start),hashes:end},null,2));if(JSON.stringify(end)!==JSON.stringify(start))process.exitCode=1;
}else throw Error('unknown phase');
