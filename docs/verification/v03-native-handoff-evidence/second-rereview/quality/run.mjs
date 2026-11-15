import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='C:/Users/sandr/OrthoSculptCAD',dir=new URL('.',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').replace(/\/$/,'');
const old='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-quality-review';
const files=['src/compute/resourceLedger.ts','src/compute/nativeHandoff.ts','src/compute/nativeHandoff.worker.ts','tests/v03-native-handoff.test.ts','src/compute/workerPool.ts','docs/plans/v03-native-broker-g1b-design.md','docs/plans/v03-source-admission-owner-design.md'];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const freeze=()=>Object.fromEntries(files.map(p=>[p,hash(root+'/'+p)]));
function run(name,args){let i=1;while(existsSync(`${dir}/${name}-${i}.command.json`))i++;name+='-'+i;const result=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8',timeout:90000,env:{...process.env,NODE_OPTIONS:''}});writeFileSync(dir+'/'+name+'.command.json',JSON.stringify({command:[process.execPath,...args],cwd:dir,actual_exit:result.status,signal:result.signal,error:String(result.error??'')},null,2));writeFileSync(dir+'/'+name+'.stdout.log',result.stdout??'');writeFileSync(dir+'/'+name+'.stderr.log',result.stderr??'');console.log(JSON.stringify({name,exit:result.status,signal:result.signal,error:String(result.error??'')}));return result.status??1;}
const phase=process.argv[2];
if(phase==='start'){
 if(existsSync(dir+'/input-start.json'))throw Error('already frozen');writeFileSync(dir+'/input-start.json',JSON.stringify(freeze(),null,2));
 mkdirSync(dir+'/source',{recursive:true});for(const f of files) {mkdirSync(dir+'/source/'+f.substring(0,f.lastIndexOf('/')),{recursive:true});copyFileSync(root+'/'+f,dir+'/source/'+f);}
 for(const f of ['witness.mjs','loader.mjs'])copyFileSync(old+'/'+f,dir+'/'+f);
 writeFileSync(dir+'/witness-original-hashes.json',JSON.stringify(Object.fromEntries(['witness.mjs','loader.mjs'].map(f=>[f,{original:hash(old+'/'+f),copy:hash(dir+'/'+f)}])),null,2));
 writeFileSync(dir+'/package.json',JSON.stringify({type:'module'}));
 writeFileSync(dir+'/tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',module:'ES2022',moduleResolution:'bundler',lib:['ES2022','DOM'],types:[],strict:true,noUnusedLocals:true,noUnusedParameters:true,skipLibCheck:true,outDir:dir+'/compiled',rootDir:root+'/src/compute'},files:files.filter(f=>f.startsWith('src/')).map(f=>root+'/'+f)},null,2));
 process.exitCode=run('strict128',['--max-old-space-size=128','--max-semi-space-size=8',root+'/node_modules/typescript/bin/tsc','-p',dir+'/tsconfig.json']);
 writeFileSync(dir+'/compiled-input-hashes.json',JSON.stringify(freeze(),null,2));
}else if(phase==='witness'||phase==='matrix'||phase==='repro'){
 process.exitCode=run(phase,['--max-old-space-size=128','--max-semi-space-size=8','--loader','file:///'+dir+'/loader.mjs',dir+'/'+(phase==='witness'?'witness.mjs':phase==='matrix'?'matrix.mjs':'repro.mjs')]);
 const p=dir+'/'+(phase==='witness'?'witness-results.json':phase==='matrix'?'matrix-results.json':'repro-results.json');if(existsSync(p)){const d=JSON.parse(readFileSync(p));console.log(JSON.stringify({total:d.total,passed:d.passed,failed:d.failed,failures:d.results.filter(r=>!r.passed).map(r=>({name:r.name,error:r.error.split('\n')[0]}))}));}
}else if(phase==='end'){const end=freeze(),start=JSON.parse(readFileSync(dir+'/input-start.json'));writeFileSync(dir+'/input-end.json',JSON.stringify(end,null,2));console.log(JSON.stringify({unchanged:JSON.stringify(start)===JSON.stringify(end),hashes:end}));process.exitCode=JSON.stringify(start)===JSON.stringify(end)?0:1;}else throw Error('phase');
