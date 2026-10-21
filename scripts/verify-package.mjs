import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from '@playwright/test';

// Acceptance driver runs from the development checkout, against an EXTRACTED package.
const root=resolve(process.argv[2]??'');
assert(process.argv[2]&&existsSync(join(root,'dist','index.html')),'Provide extracted package root');
assert(!existsSync(join(root,'node_modules')),'Package must run without node_modules');
const port=4178,url=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[join(root,'scripts/server.mjs'),'--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser;let log='';
try{
 await new Promise((done,fail)=>{
  const timer=setTimeout(()=>fail(Error('Packaged server readiness timeout: '+log)),15000);
  child.stdout.on('data',data=>{log+=data;if(log.includes(url)){clearTimeout(timer);done();}});
  child.stderr.on('data',data=>log+=data);
  child.on('error',fail);child.on('exit',code=>{clearTimeout(timer);fail(Error('Packaged server exited '+code+': '+log));});
 });
 const response=await fetch(url);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(url+'/'))external.push(request.url());});
 await page.goto(url);await page.getByRole('button',{name:'Otwórz przykład',exact:true}).click();
 await page.getByRole('button',{name:'Potwierdź i przelicz na mm'}).click();
 await page.locator('.step-button').nth(2).click();await page.getByRole('button',{name:'Oblicz tabelę przekrojów'}).click();
 await page.locator('tbody tr').first().waitFor();
 const renderer=await page.locator('.renderer-status').innerText(),rows=await page.locator('tbody tr').count();
 assert.match(renderer,/WebGPU|WebGL2/);assert(rows>3);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/packaged-offline.png',fullPage:true});
 console.log(JSON.stringify({root,nodeModulesAbsent:true,server:'native Node stdlib',renderer,measurementRows:rows,pageErrors:errors,externalRequests:external,syntheticLabel:await page.getByText('Dane syntetyczne',{exact:true}).isVisible(),passed:true},null,2));
}finally{
 await browser?.close();
 if(child.exitCode===null){const exited=new Promise(done=>child.once('exit',done));child.kill();await Promise.race([exited,new Promise(done=>setTimeout(done,5000))]);}
}
