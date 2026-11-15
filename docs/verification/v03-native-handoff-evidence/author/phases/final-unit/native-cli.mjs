import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {createRequire} from 'node:module';
const root='C:/Users/sandr/OrthoSculptCAD',dir='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core';
const phase=process.argv[2],out=dir+'/phases/'+phase; await mkdir(out+'/served',{recursive:true});
const require=createRequire(root+'/package.json'),ts=require('typescript'),{chromium}=require('@playwright/test');
const sha=b=>createHash('sha256').update(b).digest('hex');
const served=new Map(),hashes={source:{},served:{}};
for(const name of ['resourceLedger','workerPool','nativeHandoff','nativeHandoff.worker']){
 let b;try{b=await readFile(root+'/src/compute/'+name+'.ts');}catch{continue;}
 hashes.source[name+'.ts']=sha(b);
 const code=ts.transpileModule(b.toString(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(m,p)=>`from '${p}.js'`);
 served.set('/'+name+'.js',code);if(name.endsWith('.worker'))served.set('/'+name+'.ts',code);
 hashes.served[name+'.js']=sha(code);await writeFile(out+'/served/'+name+'.js',code);
}
const fixture=await readFile(dir+'/fixture-matrix.mjs','utf8');served.set('/fixture.mjs',fixture);await writeFile(out+'/fixture.mjs',fixture);hashes.served['fixture.mjs']=sha(fixture);
const baseFixture=await readFile(dir+'/fixture-roundtrip.mjs','utf8');served.set('/fixture-base.mjs',baseFixture);await writeFile(out+'/served/fixture-base.mjs',baseFixture);hashes.served['fixture-base.mjs']=sha(baseFixture);
served.set('/','<!doctype html><title>G1b1b native input handoff</title>');
let browser,context,server,addr,result,failure;const errors=[],workers=[],responses=[],external=[],workerConsole=[],servedVariants=[];let mode='normal';const closed={context:false,browser:false,server:false,portRefuses:false};
try{
 server=createServer((req,res)=>{
  if(req.url.startsWith('/__mode/')){const m=req.url.slice(8);if(!['normal','return-reserved','return-envelope','return-bytes','return-nonce'].includes(m)){res.writeHead(400);res.end();return;}mode=m;res.end('ok');return;}
  if(!served.has(req.url)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.setHeader('Cache-Control','no-store');
  let body=served.get(req.url);
  if(req.url==='/nativeHandoff.worker.ts'){
   const prefix=`const __mode=${JSON.stringify(mode)},__nativePost=self.postMessage; self.postMessage=function(frame,transfer){const type=new DataView(frame.header).getUint32(8,true),before=frame.buffers.map(b=>b.byteLength);if(type===3){if(__mode==='return-reserved')new DataView(frame.header).setUint32(56,1,true);if(__mode==='return-envelope')frame.extra=0;if(__mode==='return-bytes')new DataView(frame.descriptors).setUint32(8,before[0]+1,true);if(__mode==='return-nonce')new DataView(frame.header).setUint32(40,new DataView(frame.header).getUint32(40,true)^1,true);}console.info('NATIVE-WORKER-OBS '+JSON.stringify({mode:__mode,stage:'before-post',type,lengths:before}));const r=__nativePost.call(this,frame,transfer);console.info('NATIVE-WORKER-OBS '+JSON.stringify({mode:__mode,stage:'after-post',type,lengths:frame.buffers.map(b=>b.byteLength),detached:frame.buffers.map(b=>{try{new Uint8Array(b,0,0);return false;}catch{return true;}})}));return r;};\n`;
   body=prefix+body;const name='worker-'+mode+'.js';servedVariants.push({name,sha256:sha(body)});writeFile(out+'/served/'+name,body).catch(e=>errors.push(String(e)));
  }
  res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));addr=server.address();
 browser=await chromium.launch({headless:true}); context=await browser.newContext();const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.text().startsWith('NATIVE-WORKER-OBS '))workerConsole.push(JSON.parse(m.text().slice(18)));});page.on('worker',w=>{const id=workers.filter(x=>x.type==='created').length+1;workers.push({type:'created',id,url:w.url()});w.on('close',()=>workers.push({type:'closed',id}));});
 page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${addr.port}/`)&&!r.url().startsWith('blob:'))external.push(r.url());});
 page.on('response',r=>responses.push({url:r.url(),status:r.status()}));await page.goto(`http://127.0.0.1:${addr.port}/`);
 try{result=await page.evaluate(async()=>{const{run}=await import('/fixture.mjs');return await run();});}catch(e){failure=String(e.stack??e);result=await page.evaluate(()=>globalThis.evidence);}
 await page.waitForTimeout(100);
 if(workers.filter(x=>x.type==='created').length!==workers.filter(x=>x.type==='closed').length)throw Error('Workers not closed before context');
 if(errors.length||external.length)throw Error('unexpected page errors/network');
 if(!failure&&result?.metrics){
  const add=(name,pass)=>result.checks.push({name,pass:!!pass});
  const returns=workerConsole.filter(x=>x.type===3&&x.stage==='after-post');
  const incoming=result.events.filter(x=>x.native==='receive'&&x.type===3);
  add('every observed native RETURN has a worker-side intrinsic detach observation',returns.length===incoming.length&&returns.length>0);
  add('all native worker returned fixed ABs are intrinsically detached including zero-byte',returns.every(x=>x.detached.length>0&&x.detached.every(Boolean)&&x.lengths.every(n=>n===0)));
  add('all actual native constructor invocations matched one terminate invocation',result.metrics.constructors===result.metrics.terminates&&result.metrics.live===0);
  add('all DevTools-observed Workers closed before context teardown',workers.filter(x=>x.type==='created').length===workers.filter(x=>x.type==='closed').length);
  add('no unexpected native page errors or external network',errors.length===0&&external.length===0);
  add('four malformed RETURN fault variants executed through native endpoint',new Set(returns.filter(x=>x.mode!=='normal').map(x=>x.mode)).size===4);
 }
 if(!failure&&result?.checks?.some(x=>!x.pass))throw Error('failed checks');
 for(const [name,h]of Object.entries(hashes.source))if(sha(await readFile(root+'/src/compute/'+name))!==h)throw Error('source changed');
 result.browserVersion=browser.version();
}catch(e){failure??=String(e.stack??e);}finally{
 if(context){await context.close();closed.context=true;}if(browser){await browser.close();closed.browser=true;}
 if(server){await new Promise(r=>server.close(r));closed.server=true;}if(addr)closed.portRefuses=await new Promise(r=>{const s=connect(addr.port,'127.0.0.1');s.once('error',()=>r(true));s.once('connect',()=>{s.destroy();r(false);});});
}
const data={passed:!failure&&Object.values(closed).every(Boolean),failure,hashes,result,errors,external,workers,responses,workerConsole,servedVariants,closed};await writeFile(out+'/native-results.json',JSON.stringify(data,null,2));
console.log(JSON.stringify({passed:data.passed,failure,checks:result?.checks?.length,workers:workers.length/2,closed},null,2));process.exitCode=data.passed?0:1;
