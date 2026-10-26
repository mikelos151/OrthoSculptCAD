import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {spawnSync} from 'node:child_process';

// Real source modules and synthetic geometry; no invented manual tape measurements.
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
let browser;
try{
 const g=await vite.ssrLoadModule('/src/geometry/index.ts');
 const w=await vite.ssrLoadModule('/src/workspace/index.ts');
 const {buildReviewReport}=await vite.ssrLoadModule('/src/reports/index.ts');
 assert.equal(typeof g.auditMesh,'function','Geometry audit is not implemented yet');
 const base=g.repairMesh(g.createDemoMesh()).mesh;
 assert.equal(base.source,'synthetic');
 const bounds=g.getBounds(base);
 const mesh=g.scaleZone(base,-3,bounds.min[2],bounds.max[2]);
 const rows=g.measureMesh(mesh,10),referenceRows=g.measureMesh(base,10);
 assert(rows.length>3 && rows.some(row=>row.valid),'Real section computation is required');
 let workspace=w.createWorkspace({caseCode:'DEMO-TT-REVIEW',side:'right',technicalNote:'Dane syntetyczne. Próba raportu, nie przypadek kliniczny.',scanContext:'Syntetyczny model źródłowy aplikacji'});
 workspace=w.appendWorkspaceEvent(workspace,{kind:'import',label:'Otworzono model syntetyczny',parameters:{source:'synthetic',vertices:base.positions.length/3,triangles:base.indices.length/3}});
 workspace=w.appendWorkspaceEvent(workspace,{kind:'scale-zone',label:'Korekta strefowa w próbie syntetycznej',parameters:{percent:-3,minZ:bounds.min[2],maxZ:bounds.max[2]}});
 const audit=g.auditMesh(mesh);
 const html=await buildReviewReport({mesh,workspace,rows,referenceRows,tapes:[],audit,auditRevision:workspace.revision,measurementRevision:workspace.revision});
 // Independent Node crypto verification of the documented geometry fingerprint wire layout.
 const bytes=Buffer.alloc(8+mesh.positions.byteLength+mesh.indices.byteLength);
 bytes.writeUInt32LE(mesh.positions.length/3,0);bytes.writeUInt32LE(mesh.indices.length/3,4);
 let offset=8;for(const value of mesh.positions){bytes.writeFloatLE(value,offset);offset+=4;}
 for(const value of mesh.indices){bytes.writeUInt32LE(value,offset);offset+=4;}
 const hash=createHash('sha256').update(bytes).digest('hex');assert(html.includes(hash));
 await mkdir(resolve(root,'docs/verification'),{recursive:true});await mkdir(resolve(root,'docs/screenshots'),{recursive:true});
 await writeFile(resolve(root,'docs/verification/v02-review-example.html'),html,'utf8');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
 await page.setContent(html,{waitUntil:'load'});
 const table=page.locator('section').filter({has:page.getByRole('heading',{name:'Pomiary tej rewizji',exact:true})}).locator('tbody tr');
 assert.equal(await table.count(),rows.length);assert((await page.locator('.warning').innerText()).includes('DANE SYNTETYCZNE'));
 assert.equal(await page.locator('script,iframe,img,link').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'Report overflows the viewport');
 await page.screenshot({path:resolve(root,'docs/screenshots/v02-review-report.png'),fullPage:true});
 await page.pdf({path:resolve(root,'docs/verification/v02-review-example.pdf'),preferCSSPageSize:true,printBackground:true});
 // Inspect the actual Chromium print, not a Node-only header/footer template.
 const python=process.env.REPORT_PDF_PYTHON ?? 'python'; // Caller supplies an interpreter with PyMuPDF; no expiring developer path.
 const inspection=spawnSync(python,['-c',String.raw`
import sys,json,pathlib,pymupdf
pdf=pymupdf.open(sys.argv[1]); case,revision,short_hash=sys.argv[2:5]
out=pathlib.Path(sys.argv[5]);out.mkdir(parents=True,exist_ok=True)
pages=[]
for i,page in enumerate(pdf):
 text=page.get_text(); spans=[s for b in page.get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans'] if s['text'].strip()]
 assert case in text and 'Rewizja '+revision in text and short_hash in text, f'Page {i+1}: missing report identity'
 minimum=min(s['size'] for s in spans);assert minimum>=11.99, f'Page {i+1}: type below 12pt: {minimum}'
 footer=[s for s in spans if s['bbox'][1]>page.rect.height-65]
 footer_text=' '.join(s['text'] for s in footer)
 assert case in footer_text and 'Rewizja '+revision in footer_text and short_hash in footer_text, f'Page {i+1}: no repeated footer'
 footer_top=min(s['bbox'][1] for s in footer)
 body=[s for s in spans if s not in footer]
 assert max(s['bbox'][3] for s in body)<footer_top-5, f'Page {i+1}: footer overlaps body'
 words=page.get_text('words');assert not any(w[4] in ('NIEUSTA','LONO','Rewi','zja') for w in words), f'Page {i+1}: midword split'
 page.get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(out/f'page-{i+1}.png')
 pages.append({'page':i+1,'minimumFontPt':minimum,'identity':True,'footerTop':footer_top,'bodyBottom':max(s['bbox'][3] for s in body)})
print(json.dumps({'pageCount':len(pdf),'pages':pages}))
 `,resolve(root,'docs/verification/v02-review-example.pdf'),workspace.caseDetails.caseCode,String(workspace.revision),hash.slice(0,16),resolve(root,'docs/screenshots/v02-report-pages')],{encoding:'utf8'});
 assert.equal(inspection.status,0,inspection.stderr || inspection.stdout || inspection.error?.message);
 const pdfInspection=JSON.parse(inspection.stdout);
 const result={passed:true,synthetic:true,manualTapeCount:0,revision:workspace.revision,measurementRows:rows.length,validMeasurementRows:rows.filter(row=>row.valid).length,vertices:mesh.positions.length/3,triangles:mesh.indices.length/3,geometrySha256:hash,auditComplete:audit.complete,checks:audit.checks,pageErrors:errors,externalRequests:external,overflow,pdfInspection};
 await writeFile(resolve(root,'docs/verification/v02-report-acceptance.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await vite.close();}
