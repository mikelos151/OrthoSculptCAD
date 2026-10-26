import {describe,it,expect} from 'vitest';
import {buildReviewReport} from '../src/reports';
import {createWorkspace,fingerprintMesh,appendWorkspaceEvent} from '../src/workspace';
import type {ReviewReportInput} from '../src/reports/types';
const fixture = (): ReviewReportInput => ({
 mesh:{name:'not-a-patient-name.ply',source:'synthetic',positions:new Float32Array([0,0,0,10,0,0,0,10,0]),indices:new Uint32Array([0,1,2])},
 workspace:createWorkspace({caseCode:'TT-TEST-01',side:'left'},new Date(0).toISOString()),
 rows:[{z:10,circumference:100,ap:30,ml:25,area:500,segmentVolume:null,valid:true}],
 referenceRows:[],tapes:[],audit:null,measurementRevision:0,generatedAt:new Date(0).toISOString(),
});
describe('v02 review report',()=>{
 it('uses a repeated print identity with reserved space and intentional date/value wrapping',async()=>{
  const input=fixture();input.workspace=appendWorkspaceEvent(input.workspace,{kind:'scale-zone',label:'Korekta',parameters:{percent:-3.123456789,minZ:0}},new Date(0).toISOString());input.measurementRevision=input.workspace.revision;
  const html=await buildReviewReport(input);
  expect(html).toContain('@bottom-left');expect(html).not.toContain('bottom:-16mm');
  expect(html).toContain('SHA-256 skrót:');expect(html).toContain('margin:12mm 12mm 24mm');
  expect(html).toContain('1970-01-01<br>00:00:00.000Z');expect(html).toContain('class="parameter-value">-3.123456789');
  expect(html).toMatch(/\.parameter-value[^}]*white-space:nowrap/);
 });
 it('gives known quality IDs Polish labels and brief meanings without changing technical identifiers',async()=>{
  const input=fixture();input.auditRevision=0;input.audit={checks:[{id:'edge-manifold',label:'Edge manifold',status:'pass',detail:'0 <synthetic> edge(s)'}],triangleCount:1,candidateTests:0,complete:true,elapsedMs:0,intersections:[],orientation:'unknown',signedVolume:0};
  const html=await buildReviewReport(input);
  expect(html).toContain('Rozmaitość krawędzi');expect(html).toContain('Najwyżej dwie ściany');
  expect(html).toContain('0 &lt;synthetic&gt; edge(s)');expect(html).not.toContain('<td>Edge manifold</td>');
 });
 it('labels a budget-limited audit as incomplete even when an independent topology check passed',async()=>{
  const input=fixture();input.auditRevision=0;input.audit={checks:[{id:'fixture',label:'Topology fixture',status:'pass',detail:'Only this check ran'}],triangleCount:1,candidateTests:0,complete:false,elapsedMs:0,intersections:[],orientation:'unknown',signedVolume:0};
  expect(await buildReviewReport(input)).toContain('Audyt niepełny — NIEUSTALONO');
 });

 it('records an operator threshold without presenting it as a clinical tolerance',async()=>{
  const html=await buildReviewReport({...fixture(),toleranceMm:1.5});
  expect(html).toContain('Próg roboczy operatora: 1,50 mm');expect(html).toContain('nie jest tolerancją kliniczną');
 });

 it('captures a single immutable snapshot across asynchronous hashing',async()=>{
  const input=fixture();const result=buildReviewReport(input);
  input.rows[0].circumference=9999;input.mesh.source='imported';input.workspace.caseDetails.technicalNote='CHANGED AFTER REQUEST';
  const html=await result;
  expect(html).toContain('<td>100,00</td>');expect(html).toContain('DANE SYNTETYCZNE');expect(html).not.toContain('CHANGED AFTER REQUEST');
 });

 it('does not carry a positive audit from a different revision into the report',async()=>{
  const input=fixture();input.audit={checks:[{id:'fixture',label:'PREVIOUS-REVISION-ONLY',status:'pass',detail:'Unit fixture'}],triangleCount:1,candidateTests:0,complete:true,elapsedMs:0,intersections:[],orientation:'outward',signedVolume:1};input.auditRevision=1;
  const html=await buildReviewReport(input);
  expect(html).not.toContain('PREVIOUS-REVISION-ONLY');expect(html).toContain('Brak aktualnego wyniku audytu');
 });

 it('is a self-contained script-free printable document with readable print type',async()=>{
  const html=await buildReviewReport(fixture());
  expect(html).toContain('Content-Security-Policy');expect(html).toContain("default-src 'none'");
  expect(html).toContain('@page');expect(html).toContain('12pt');
  expect(html).not.toMatch(/<script\b|<link\b|<iframe\b|https?:\/\//i);
 });

 it('includes the work journal with exact excerpt counts and escaped operation details',async()=>{
  const input=fixture();
  for(let i=0;i<21;i++) input.workspace=appendWorkspaceEvent(input.workspace,{kind:'case-update',label:`Review <${i}>`,parameters:{reason:'<script>not-executable</script>'}},new Date(0).toISOString());
  input.measurementRevision=input.workspace.revision;
  const html=await buildReviewReport(input);
  expect(html).toContain('Pokazano 20 z 22 wpisów');expect(html).toContain('Review &lt;20&gt;');
  expect(html).not.toContain('not-executable');expect(html).not.toContain('&quot;reason&quot;');expect(html).not.toContain('<script>');
  expect(html).toContain('nie jest pełnym archiwum');
 });

 it('keeps unknown quality and synthetic provenance explicit rather than issuing a manufacturing clearance',async()=>{
  const html=await buildReviewReport(fixture());
  for (const text of ['DANE SYNTETYCZNE','NIEUSTALONO','samoprzecięć','minimalnej grubości','NIE STANOWI ZWOLNIENIA DO WYTWARZANIA','nieszyfrowany']) expect(html).toContain(text);
 });

 it('includes pseudonymous side/context while escaping clinical notes and omitting the original filename',async()=>{
  const input=fixture();input.workspace.caseDetails.technicalNote='<img src=x onerror=alert(1)>';
  const html=await buildReviewReport(input);
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(html).not.toContain('<img');
  expect(html).toContain('Lewa');expect(html).not.toContain(input.mesh.name);
 });

 it('renders actual CAD/reference/tape values and signed differences in millimetres',async()=>{
  const input=fixture();input.referenceRows=[{...input.rows[0],circumference:95}];input.tapes=[{z:10,circumference:98}];
  const html=await buildReviewReport(input);
  for(const value of ['CAD [mm]','Baza [mm]','Taśma [mm]','100,00','95,00','98,00','+5,00','+2,00','A-P [mm]','Pole [mm²]']) expect(html).toContain(value);
 });

 it('rejects an invalid generated-at timestamp rather than printing it as a fact',async()=>{
  await expect(buildReviewReport({...fixture(),generatedAt:'not-a-date'})).rejects.toThrow(/dat|czas/i);
 });

 it('rejects measurements from another revision',async()=>{
  await expect(buildReviewReport({...fixture(),measurementRevision:null})).rejects.toThrow(/aktual|rewiz/i);
 });

 it('binds report identity to a real geometry fingerprint and the recorded revision',async()=>{
  expect(buildReviewReport,'Review report API is not implemented yet').toBeTypeOf('function');
  const input=fixture();const html=await buildReviewReport(input);
  expect(html).toContain('TT-TEST-01');expect(html).toContain('Rewizja 0');
  expect(html).toContain(await fingerprintMesh(input.mesh));
 });
});
