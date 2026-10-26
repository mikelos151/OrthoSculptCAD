import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {chromium,type Browser} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildReviewReport} from '../src/reports';
import {appendWorkspaceEvent,createWorkspace} from '../src/workspace';
import {auditMesh,createDemoMesh,getBounds,measureMesh,repairMesh,scaleZone} from '../src/geometry';
import type {ReviewReportInput} from '../src/reports/types';

const at='2026-10-26T12:00:00.000Z';
const codes=['DEMO-TT-REVIEW','W'.repeat(39),'W'.repeat(40)];
const fixture=(caseCode:string):ReviewReportInput=>({
 mesh:{name:'synthetic-only.ply',source:'synthetic',positions:new Float32Array([0,0,0,10,0,0,0,10,0]),indices:new Uint32Array([0,1,2])},
 workspace:createWorkspace({caseCode,side:'right'},at),
 rows:[{z:10,circumference:100,ap:30,ml:25,area:500,segmentVolume:null,valid:true}],
 tapes:[],referenceRows:[],audit:null,measurementRevision:0,generatedAt:at,
});

describe('legal case identifiers remain literal and wrap without shrinking print',()=>{
 it.each(codes)('preserves %s and permits wrapping the 28pt heading',async caseCode=>{
  const html=await buildReviewReport(fixture(caseCode));
  expect(html).toContain(`<h1>${caseCode}</h1>`);
  expect(html).toContain(`${caseCode} · Rewizja 0`);
  expect(html).toMatch(/h1\{[^}]*overflow-wrap:anywhere/);
  expect(html).toMatch(/h1\{[^}]*font-size:28pt/);
  expect(html).toContain("body{font:12pt/1.48");
  expect(html).not.toMatch(/text-overflow|zoom:|transform:scale/);
 });
});

// Opt-in: exercises Chromium's actual print scaling and the PDF glyph layer, not CSS declarations.
// REPORT_PDF_PYTHON must name an interpreter with PyMuPDF; artifacts never overwrite checked-in examples.
describe.skipIf(process.env.ORTHO_REAL_REPORT_PDF!=='1')('actual long-code Chromium PDF regression',()=>{
 let browser:Browser;
 let standard:ReviewReportInput;
 let hash:string;
 const out=resolve(process.env.REPORT_PDF_ARTIFACT_DIR ?? resolve(process.env.TMPDIR ?? tmpdir(),'ortho-report-long-code'));
 beforeAll(async()=>{
  const base=repairMesh(createDemoMesh()).mesh,bounds=getBounds(base);
  const mesh=scaleZone(base,-3,bounds.min[2],bounds.max[2]);
  let workspace=createWorkspace({caseCode:codes[0],side:'right',technicalNote:'Dane syntetyczne. Próba raportu, nie przypadek kliniczny.',scanContext:'Syntetyczny model źródłowy aplikacji'},at);
  workspace=appendWorkspaceEvent(workspace,{kind:'import',label:'Otworzono model syntetyczny',parameters:{source:'synthetic',vertices:base.positions.length/3,triangles:base.indices.length/3}},at);
  workspace=appendWorkspaceEvent(workspace,{kind:'scale-zone',label:'Korekta strefowa w próbie syntetycznej',parameters:{percent:-3,minZ:bounds.min[2],maxZ:bounds.max[2]}},at);
  standard={mesh,workspace,rows:measureMesh(mesh,10),referenceRows:measureMesh(base,10),tapes:[],audit:auditMesh(mesh),auditRevision:workspace.revision,measurementRevision:workspace.revision,generatedAt:at};
  expect(standard.rows).toHaveLength(25);expect(standard.rows.filter(row=>row.valid)).toHaveLength(24);
  const bytes=Buffer.alloc(8+mesh.positions.byteLength+mesh.indices.byteLength);
  bytes.writeUInt32LE(mesh.positions.length/3,0);bytes.writeUInt32LE(mesh.indices.length/3,4);
  let offset=8;for(const value of mesh.positions){bytes.writeFloatLE(value,offset);offset+=4;}
  for(const value of mesh.indices){bytes.writeUInt32LE(value,offset);offset+=4;}
  hash=createHash('sha256').update(bytes).digest('hex');
  await mkdir(out,{recursive:true});browser=await chromium.launch({headless:true});
 },60_000);
 afterAll(async()=>{await browser?.close();});
 it.each([
  {name:'normal',caseCode:codes[0],single:false,pages:6},
  {name:'wide39',caseCode:codes[1],single:false,pages:6},
  {name:'wide40',caseCode:codes[2],single:false,pages:6},
  {name:'normal-one-row',caseCode:codes[0],single:true,pages:3},
 ])('$name: no overflow, every PDF glyph >=12pt, complete identity on every page',async({name,caseCode,single,pages})=>{
  const input=single ? fixture(caseCode) : {...standard,workspace:{...standard.workspace,caseDetails:{...standard.workspace.caseDetails,caseCode}}};
  // The small control is intentionally the original one-row report, not fabricated extra rows.
  const expectedHash=single ? await (await import('../src/workspace')).fingerprintMesh(input.mesh) : hash;
  const html=await buildReviewReport(input);
  expect(html).toContain(expectedHash);
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
  try{
   await page.setContent(html,{waitUntil:'load'});
   await expect(page.locator('h1').textContent()).resolves.toBe(caseCode);
   expect(await page.locator('script,iframe,img,link').count()).toBe(0);
   expect(await page.locator('.measurement-table tbody tr').count()).toBe(input.rows.length);
   expect(html).toContain("default-src 'none'");
   const overflow=[];
   for(const width of [1400,1032]){
    await page.setViewportSize({width,height:1000});
    await page.emulateMedia({media:width===1032?'print':'screen'});
    overflow.push(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1})));
   }
   await writeFile(resolve(out,`${name}.html`),html,'utf8');
   await page.pdf({path:resolve(out,`${name}.pdf`),preferCSSPageSize:true,printBackground:true});
   const inspection=spawnSync(process.env.REPORT_PDF_PYTHON ?? 'python',['-c',String.raw`
import sys,json,pathlib,pymupdf
pdf=pymupdf.open(sys.argv[1]);case,revision,short_hash=sys.argv[2:5]
result=[];issues=[]
for i,page in enumerate(pdf):
 spans=[s for b in page.get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans'] if s['text'].strip()]
 text=page.get_text();minimum=min(s['size'] for s in spans)
 footer=[s for s in spans if s['bbox'][1]>page.rect.height-65]
 footer_text=' '.join(s['text'] for s in footer)
 body=[s for s in spans if s not in footer]
 gap=min(s['bbox'][1] for s in footer)-max(s['bbox'][3] for s in body) if footer and body else -1
 identity=all(v in footer_text for v in [case,'Rewizja '+revision,short_hash])
 bounds=all(s['bbox'][0]>=-0.5 and s['bbox'][2]<=page.rect.width+0.5 and s['bbox'][1]>=-0.5 and s['bbox'][3]<=page.rect.height+0.5 for s in spans)
 bad_glyphs=[list(c[:2]) for run in page.get_texttrace() for c in run['chars'] if not chr(c[0]).isspace() and (c[0] in (0,65533) or c[1]==0)]
 if minimum<11.99:issues.append(f'Page {i+1}: font below 12pt: {minimum}')
 if not identity:issues.append(f'Page {i+1}: incomplete footer identity')
 if gap<=5:issues.append(f'Page {i+1}: footer-body gap {gap}')
 if not bounds:issues.append(f'Page {i+1}: out-of-page text')
 if bad_glyphs or chr(65533) in text:issues.append(f'Page {i+1}: invalid source PDF glyphs')
 result.append({'page':i+1,'minimumFontPt':minimum,'identity':identity,'footerBodyGapPt':gap,'inPageBounds':bounds,'badGlyphs':len(bad_glyphs)})
heading=''.join(s['text'] for b in pdf[0].get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans'] if s['size']>27)
if heading!=case:issues.append('First-page heading is not the complete literal case code')
for index in [0,len(pdf)-1]:pdf[index].get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(pathlib.Path(sys.argv[1]).with_name(pathlib.Path(sys.argv[1]).stem+f'-page-{index+1}.png'))
print(json.dumps({'pageCount':len(pdf),'pages':result,'issues':issues,'literalHeading':heading==case}))
`,resolve(out,`${name}.pdf`),caseCode,String(input.workspace.revision),expectedHash.slice(0,16)],{encoding:'utf8'});
   expect(inspection.status,inspection.stderr || inspection.error?.message).toBe(0);
   const pdf=JSON.parse(inspection.stdout);
   const evidence={browser:browser.version(),caseCode,measurementRows:input.rows.length,validMeasurementRows:input.rows.filter(row=>row.valid).length,manualTapeCount:input.tapes.length,geometrySha256:expectedHash,overflow,errors,external,pdf};
   await writeFile(resolve(out,`${name}.json`),JSON.stringify(evidence,null,2));
   console.log(`REAL_REPORT_PDF ${JSON.stringify(evidence)}`);
   expect(pdf.issues).toEqual([]);expect(pdf.pageCount).toBe(pages);
   expect(overflow.every(result=>!result.overflow)).toBe(true);
   expect(errors).toEqual([]);expect(external).toEqual([]);
  }finally{await page.close();}
 },60_000);
});
