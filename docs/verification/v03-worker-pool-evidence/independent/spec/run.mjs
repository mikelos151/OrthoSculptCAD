import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const commands=[
 ['strict-compile',process.execPath,['--max-old-space-size=128','--max-semi-space-size=8','C:/Users/sandr/OrthoSculptCAD/node_modules/typescript/bin/tsc','--project',dir+'tsconfig.json']],
 ['actual-api-witnesses',process.execPath,['--max-old-space-size=128','--max-semi-space-size=8',dir+'witnesses.mjs']],
 ['evidence-audit','python',[dir+'audit-evidence.py']],
 ['tdd-ast-inspection',process.execPath,['--max-old-space-size=128','--max-semi-space-size=8',dir+'inspect-tdd.mjs']]
];
const records=[];
for(const [label,exe,args] of commands){
 const r=spawnSync(exe,args,{cwd:dir,encoding:'utf8',maxBuffer:2*1024*1024});
 const log=(r.stdout??'')+(r.stderr??'');writeFileSync(dir+label+'.log',log);
 records.push({label,command:[exe,...args],cwd:dir,exit:r.status,signal:r.signal,error:r.error?.message??null,log:dir+label+'.log'});
 writeFileSync(dir+'commands.json',JSON.stringify(records,null,2));console.log(label+': exit '+r.status);console.log(log);
 if(r.status!==0){process.exitCode=1;break;}
}
