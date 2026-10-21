import {describe,it,expect} from 'vitest';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {request} from 'node:http';
import {createStaticServer} from '../scripts/server.mjs';

describe('local static application delivery',()=>{
 it('serves only the chosen static root with privacy and rebinding protections',async()=>{
  const server=createStaticServer(resolve('tests/fixtures/web'));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw Error('No address');
  const port=address.port;
  async function get(path:string,host=`127.0.0.1:${port}`,method='GET'){
   return await new Promise<{status:number;headers:Record<string,unknown>;body:string}>((done,fail)=>{const req=request({host:'127.0.0.1',port,path,method,headers:{Host:host}},response=>{let body='';response.setEncoding('utf8');response.on('data',data=>body+=data);response.on('end',()=>done({status:response.statusCode!,headers:response.headers,body}));});req.on('error',fail);req.end();});
  }
  try{
   const home=await get('/');expect(home.status).toBe(200);expect(home.body).toContain('Local fixture only');
   expect(home.headers['content-security-policy']).toContain("connect-src 'self'");
   expect(home.headers['x-content-type-options']).toBe('nosniff');
   expect((await get('/%2e%2e/%2e%2e/package.json')).status).toBe(403);
   expect((await get('/','evil.invalid')).status).toBe(403);
   expect((await get('/','127.0.0.1:'+port,'POST')).status).toBe(405);
   expect((await get('/missing.js')).status).toBe(404);
   expect((await get('/','127.0.0.1:'+port,'HEAD')).body).toBe('');
  }finally{await new Promise<void>((done,fail)=>server.close(error=>error?fail(error):done()));}
 });
});
