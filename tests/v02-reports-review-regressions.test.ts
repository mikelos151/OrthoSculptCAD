import {describe,it,expect} from 'vitest';
import {buildReviewReport} from '../src/reports';
import {appendWorkspaceEvent,createWorkspace} from '../src/workspace';
import type {ReviewReportInput} from '../src/reports/types';
import type {MeshAudit} from '../src/geometry/auditTypes';
// Public synthetic markers only. These are not patient data or real credentials.
const fixture=():ReviewReportInput=>({
 mesh:{name:'synthetic-unit.ply',source:'synthetic',positions:new Float32Array([0,0,0,10,0,0,0,10,0]),indices:new Uint32Array([0,1,2])},
 workspace:createWorkspace({caseCode:'TT-UNIT',side:'right'},new Date(0).toISOString()),
 rows:[{z:10,circumference:100,ap:30,ml:25,area:500,valid:true,segmentVolume:null}],
 tapes:[],referenceRows:[],audit:null,measurementRevision:0,generatedAt:new Date(0).toISOString(),
});
const audit=():MeshAudit=>({checks:[],triangleCount:1,candidateTests:0,complete:true,elapsedMs:0,intersections:[],orientation:'unknown',signedVolume:0});
describe('review blockers reproduced by parent',()=>{
 it('does not expose arbitrary journal parameters in a plaintext report',async()=>{
  const input=fixture();input.workspace=appendWorkspaceEvent(input.workspace,{kind:'import',label:'Import',parameters:{originalFilename:'PRIVATE_SYNTHETIC_ORIGINAL.stl',password:'SYNTHETIC-TEST-NOT-A-CREDENTIAL',percent:-3}},new Date(0).toISOString());
  input.measurementRevision=input.workspace.revision;
  const html=await buildReviewReport(input);
  expect(html).not.toContain('PRIVATE_SYNTHETIC_ORIGINAL.stl');expect(html).not.toContain('SYNTHETIC-TEST-NOT-A-CREDENTIAL');
 });
 it('exports only bounded numeric geometric parameters and closed string enums',async()=>{
  const input=fixture();input.workspace=appendWorkspaceEvent(input.workspace,{kind:'scale-zone',label:'Etykieta <operatora>',parameters:{percent:-3,minZMm:0,maxZMm:100,source:'synthetic',side:'right',mode:'compress',sourceUnit:'mm',units:'mm',reason:'PRIVATE-REASON',token:'PRIVATE-TOKEN',secret:'PRIVATE-SECRET',radiusMm:'PRIVATE-NUMERIC-STRING',scale:true,vertices:null,triangles:1e12,strength:1001}},new Date(0).toISOString());
  input.workspace.caseDetails.technicalNote='Notatka <operatora>';
  input.measurementRevision=input.workspace.revision;
  const html=await buildReviewReport(input);
  for(const marker of ['PRIVATE-REASON','PRIVATE-TOKEN','PRIVATE-SECRET','PRIVATE-NUMERIC-STRING','&quot;scale&quot;','&quot;vertices&quot;','&quot;triangles&quot;','&quot;strength&quot;']) expect(html).not.toContain(marker);
  for(const marker of ['percent','-3','minZMm','maxZMm','synthetic','right','compress','sourceUnit']) expect(html).toContain(marker);
  expect(html).toContain('Etykieta &lt;operatora&gt;');expect(html).toContain('Notatka &lt;operatora&gt;');
  expect(html).toContain('Nie wszystkie parametry');expect(html).toContain('swobodnym tekstem operatora');
  const bad=fixture();bad.workspace=appendWorkspaceEvent(bad.workspace,{kind:'import',label:'Import',parameters:{source:'PRIVATE-SOURCE',side:'PRIVATE-SIDE',mode:'PRIVATE-MODE',sourceUnit:'PRIVATE-UNIT',units:'PRIVATE-UNITS'}},new Date(0).toISOString());bad.measurementRevision=bad.workspace.revision;
  expect(await buildReviewReport(bad)).not.toMatch(/PRIVATE-(SOURCE|SIDE|MODE|UNIT|UNITS)/);
 });
 it('rejects array-coerced positive status rather than printing SPRAWDZONO',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  input.audit.checks=[{id:'fixture',label:'Malformed enum',status:['pass'] as unknown as 'pass',detail:'Synthetic invalid input'}];
  await expect(buildReviewReport(input)).rejects.toThrow(/status|kontrol|audyt/i);
 });
 it('bounds audit checks before touching unused large audit fields',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  input.audit.checks=Array.from({length:65},()=>({id:'fixture',label:'Bounded',status:'pass' as const,detail:'Evidence'}));
  let unusedReads=0;Object.defineProperty(input.audit,'intersections',{enumerable:true,get(){unusedReads++;throw new Error('UNUSED AUDIT CLONED');}});
  await expect(buildReviewReport(input)).rejects.toThrow(/kontrol|limit/i);expect(unusedReads).toBe(0);
 });
 it('projects only required audit fields without cloning unused intersections',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  input.audit.checks=[{id:'watertight',label:'Topology',status:'pass',detail:'Evidence'}];
  let unusedReads=0;Object.defineProperty(input.audit,'intersections',{enumerable:true,get(){unusedReads++;throw new Error('UNUSED AUDIT CLONED');}});
  const html=await buildReviewReport(input);expect(html).toContain('Evidence');expect(unusedReads).toBe(0);
 });
 it('rejects duplicate check IDs and cannot complete an audit missing core checks',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  const check={id:'watertight',label:'Topology',status:'pass' as const,detail:'Evidence'};
  input.audit.checks=[check,check];await expect(buildReviewReport(input)).rejects.toThrow(/kontrol|powiel/i);
  input.audit.checks=[check];const html=await buildReviewReport(input);
  expect(html).not.toContain('Audyt zakończony');expect(html).toContain('Brak aktualnego wyniku audytu');
 });
 it('completes only a full core evidence set and preserves an immutable audit snapshot',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  input.audit.checks=['edge-manifold','watertight','vertex-manifold','components','degenerate-triangles','winding','self-intersections','outward'].map(id=>({id,label:id,status:'pass',detail:'Original evidence'}));
  const result=buildReviewReport(input);input.audit.checks[0].detail='MUTATED-EVIDENCE';
  const html=await result;expect(html).toContain('Audyt zakończony');expect(html).not.toContain('MUTATED-EVIDENCE');
 });
 it('does not call an empty evidence set a completed audit',async()=>{
  const input=fixture();input.audit=audit();input.auditRevision=0;
  const html=await buildReviewReport(input);
  expect(html).not.toContain('Audyt zakończony');expect(html).toContain('Brak aktualnego wyniku audytu');
 });
});
