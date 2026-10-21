import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {dirname,extname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";
/** Static files only. No upload endpoint, patient persistence or remote listening. */
export function createStaticServer(root){
 const base=realpathSync(root);
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',CSP);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
  function fail(status,text){res.statusCode=status;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(req.method==='HEAD'?'':text);}
  const address=server.address();const port=address&&typeof address!=='string'?address.port:0;
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){fail(403,'Niedozwolony host.');return;}
  if(!['GET','HEAD'].includes(req.method??'')){res.setHeader('Allow','GET, HEAD');fail(405,'Dozwolony tylko odczyt plików.');return;}
  let pathname;try{pathname=decodeURIComponent((req.url??'').split('?')[0]);}catch{fail(400,'Nieprawidłowa ścieżka.');return;}
  if(!pathname.startsWith('/')||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').includes('..')){fail(403,'Niedozwolona ścieżka.');return;}
  let target;
  try{
   target=await realpath(resolve(base,'.'+(pathname==='/'?'/index.html':pathname)));
   const rel=relative(base,target);if(rel.startsWith('..')||isAbsolute(rel)){fail(403,'Niedozwolona ścieżka.');return;}
   const info=await stat(target);if(!info.isFile()||info.size>50*1024*1024){fail(404,'Plik niedostępny.');return;}
   const mime=MIME[extname(target).toLowerCase()];if(!mime){fail(404,'Plik niedostępny.');return;}
   const data=req.method==='HEAD'?null:await readFile(target);
   res.setHeader('Content-Type',mime);res.setHeader('Content-Length',info.size);res.end(data);
  }catch{if(!res.headersSent)fail(404,'Nie znaleziono pliku.');else res.destroy();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);const port=args.length===0?4174:args.length===2&&args[0]==='--port'?Number(args[1]):NaN;
 if(!Number.isInteger(port)||port<1||port>65535){console.error('Użycie: node scripts/server.mjs [--port 4174]');process.exitCode=1;}
 else{
  try{
   const server=createStaticServer(resolve(dirname(fileURLToPath(import.meta.url)),'../dist'));
   server.on('error',error=>{console.error(`Nie udało się uruchomić lokalnego serwera: ${error.code??'błąd'}`);process.exitCode=1;});
   server.listen(port,'127.0.0.1',()=>console.log(`OrthoSculpt CAD: http://127.0.0.1:${port} — tylko ten komputer. Ctrl+C kończy pracę.`));
  }catch{console.error('Brak gotowego katalogu dist. Uruchom npm ci i npm run build.');process.exitCode=1;}
 }
}
