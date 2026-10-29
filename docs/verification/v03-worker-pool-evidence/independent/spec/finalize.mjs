import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const repo='C:/Users/sandr/OrthoSculptCAD', author=dir+'../v03-worker-pool-core/';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(name,v)=>writeFileSync(dir+name,JSON.stringify(v,null,2));
const commands=read(dir+'commands.json');
for(const [label,args] of [
 ['git-head',['rev-parse','HEAD']],
 ['git-protected-diff',['diff','--exit-code','--','src/compute/resourceLedger.ts','tests/v03-resource-ledger.test.ts']],
 ['git-index-diff',['diff','--cached','--exit-code']],
 ['git-status',['status','--short']]
]){
 const full=['--no-optional-locks','-C',repo,...args];
 const raw=readFileSync(dir+label+'.log','utf8');
 commands.push({label,command:['git',...full],cwd:'C:/Users/sandr',exit:0,verification:'Actual terminal bash && chain returned exit 0; Node spawnSync git EPERM avoided without config changes',log:dir+label+'.log'});
 if(label==='git-head'&&raw.trim()!=='2a586bd3abe3c801e7fe23764fecc77b8c770b50')throw Error('HEAD drift');
 if(label.includes('diff')&&raw!=='')throw Error('Unexpected git diff');
}
save('commands.json',commands);
const start=read(dir+'input-start.json');const end=Object.fromEntries(Object.keys(start).map(f=>[f,sha(repo+'/'+f)]));
save('input-end.json',end);
if(JSON.stringify(start)!==JSON.stringify(end))throw Error('Input drift');
const audit=read(dir+'evidence-audit.json'), tdd=read(dir+'tdd-details.json'), unit=read(dir+'witness-results.json');
if(commands.some(c=>c.exit!==0)||!unit.passed||unit.checks.length!==12||unit.model_steps!==360)throw Error('Witness mismatch');
if(audit.cycles.length!==14||audit.cycles.some(c=>!c.same_test_bytes||!c.assertion_failure||c.red_exit!==1||c.green_exit!==0))throw Error('TDD mismatch');
if(tdd.final_body_changes.some(c=>c.name!=='06 reuses exactly two logical domains for forty incarnations with maxRealms=3'||c.before.replace('maxRealms: 3 }','maxRealms: 3, maxLeases: 2, maxRefs: 2 }')!==c.after))throw Error('Unexplained test drift');
const n=read(author+'native-results.json');let live=0,peak=0;const made=new Set(),terminated=new Set();let attempts=0;
for(const e of n.result.events){
 if(e.type==='constructor-attempt')attempts++;
 if(e.type==='constructor-success'){if(made.has(e.ordinal))throw Error('duplicate constructor');made.add(e.ordinal);live++;peak=Math.max(peak,live);}
 if(e.type==='terminate-invoked'){if(!made.has(e.ordinal)||terminated.has(e.ordinal))throw Error('unexpected termination');terminated.add(e.ordinal);live--;}
 if(live<0||live>2)throw Error('native chronology cap');
}
if(live!==0||peak!==2||made.size!==49||terminated.size!==49||attempts!==50)throw Error('Native totals mismatch');
const source=readFileSync(repo+'/src/compute/workerPool.ts','utf8');
const staticScan={hardcoded_credentials:/(?:api[_-]?key|password|secret)\s*[:=]\s*["'][^"']{6,}/i.test(source),eval_exec:/\b(?:eval|exec)\s*\(/.test(source),external_process_network:/\b(?:fetch|XMLHttpRequest|child_process|WebSocket)\b/.test(source)};
if(Object.values(staticScan).some(Boolean))throw Error('Static scan requires investigation');
save('native-chronology-audit.json',{classification:'Inspection of completed author observations, not independent native execution',attempts,created:made.size,terminated:terminated.size,remaining:live,maximum_created_minus_terminated:peak,source_and_served_hashes_verified:audit.native_existing_observations.verified_hashes});
const redIDs=audit.cycles.map(c=>Number(c.id)),coverage=Array.from({length:24},(_,i)=>i+1).filter(i=>!redIDs.includes(i));
const report={
 passed:true,security_concerns:[],logic_errors:[],suggestions:[],
 summary:'PASS wyłącznie G1b1aPoolPrimitiveOnly: limit 2 na instancję, reserve/rollback i ownership/lifecycle zgodne; 12 własnych świadków real-API oraz 360 przejść PASS, 14 rzeczywistych par TDD autora sprawdzonych bez osłabienia testów.',
 scope:'G1b1aPoolPrimitiveOnly',
 evidence:{
  repository:repo,head:'2a586bd3abe3c801e7fe23764fecc77b8c770b50',normative_clauses:'§3 i pool w §8; transport ABI oceniany osobno',input_sha256_start:start,input_sha256_end:end,input_hashes_unchanged:true,
  report:dir+'REVIEW.md',commands_and_exit_codes:dir+'commands.json',raw_combined_log:dir+'run.log',
  strict_compile:{exit:0,actual_sources:['src/compute/workerPool.ts','src/compute/resourceLedger.ts'],strict:true,types:[],lib:['ES2022','DOM'],heapMiB:128,semiSpaceMiB:8,output:dir+'compiled'},
  independent_existing_behavior_UNIT:{passed:unit.checks_count,model_transitions:unit.model_steps,actual_pool_and_ledger:true,test_doubles:'Small EventTarget-backed UnitWorker; not native Worker evidence',new_TDD_claim:false,script:dir+'witnesses.mjs',results:dir+'witness-results.json'},
  TDD_author_evidence:{red_green_pairs:audit.cycles_count,red_exit:1,green_exit:0,all_pairs_test_bytes_identical:true,all_red_are_behavioral_assertions:true,ids:redIDs,existing_coverage_ids:coverage,existing_coverage_count:coverage.length,only_historical_existing_test_change:'Test 06 strengthens controls by adding maxLeases=2/maxRefs=2; assertions not weakened.',evidence_audit:dir+'evidence-audit.json',ast_inspection:dir+'tdd-details.json'},
  frozen_focused_suite:{G1a:16,new_pool:24,total:40,source:'Completed author final-green raw log, not rerun alongside parent serial regression',tests_sha_unchanged:true},
  author_native:{classification:'Existing completed evidence inspected as data; parent independently replays native path',checks:n.result.checks.length,constructors:made.size,terminate_invocations:terminated.size,constructor_attempts:attempts,maximum_created_minus_terminated:peak,source_and_served_hashes_verified:true,chronology:dir+'native-chronology-audit.json',independently_executed_in_this_review:false,global_App_cap_proven:false,physical_thread_join_GC_RSS_proven:false},
  source_review_locations:{occupancy_and_reserve:'workerPool.ts:64-86',terminal_and_dispose:'workerPool.ts:29-50',authentication_and_callbacks:'workerPool.ts:59-62,91-104',domains:'workerPool.ts:23-25',snapshot:'workerPool.ts:53-56',counter_overflow_and_nonce:'workerPool.ts:69-81'},
  counter_overflow:'Static inspection of safe-integer guards before increment; no dynamic exhaustion claim',static_scan:staticScan,
  scope_exclusions:['No global App cap until G1b2/migration','No transport/proxy/ACK/main-SHA/WAIT_MAIN/sourceOwner/source-admission requirement in G1b1a','No G2c/G3/full CAD/clinical/EXE/RSS acceptance','Diagnostic global pool generation is not future wire generation=1','Internal trusted factory is not user/file URL or arbitrary-JS sandbox'],
  concurrency:'No full tests, browser-heavy work, dependency installs or large allocations; parent serial regression/native replay not duplicated',
  write_scope:dir,repository_and_skills_readonly:true,other_reviewers_WIP_read:false,issues_encountered:['First finalization attempt exited 1 because child_process.spawnSync git was denied EPERM. Recovered using actual terminal bash git commands, all exit 0; original failure retained in finalize-attempt-1.json. No repository/config changes.'],
  artifact_manifest:dir+'artifact-manifest.json'
 }
};
if((report.security_concerns.length||report.logic_errors.length)&&report.passed)throw Error('Fail-closed schema');
save('review.json',report);
// Preserve the review workflow inside owned scratch; profile skill writes are forbidden.
writeFileSync(dir+'review-workflow.md','# Readonly pool review recipe\n\n1. Freeze actual source/test/G1a/plan SHA before execution.\n2. Compile actual modules with installed tsc and bounded heap into owned scratch.\n3. Exercise opaque handles, reentrant STARTING/dispose, failure-held charge and independent graph counters through actual public APIs; label EventTarget stand-ins UNIT.\n4. Audit raw author RED/GREEN commands, unchanged pair test bytes, and AST drift through final tests. Immediate GREEN is coverage, not new TDD.\n5. Recompute native chronology and source/served SHA from completed data without replaying browser concurrently. Never transfer isolated pool evidence to global App cap or RSS.\n6. Recheck SHA/HEAD/index and write fail-closed JSON plus artifact manifest.\n');
const manifest={};function collect(path,prefix=''){for(const name of readdirSync(path)){const p=path+'/'+name,k=prefix+name;if(statSync(p).isDirectory())collect(p,k+'/');else if(!['artifact-manifest.json','finalize.log'].includes(k))manifest[k]={sha256:sha(p),bytes:statSync(p).size};}}
collect(dir);save('artifact-manifest.json',{scope:'G1b1aPoolPrimitiveOnly',files:manifest,excludes:['artifact-manifest.json (self)','finalize.log (active command output)']});
console.log(JSON.stringify({passed:report.passed,scope:report.scope,witnesses:unit.checks_count,model_steps:unit.model_steps,TDD_pairs:audit.cycles_count,existing_coverage:coverage.length,focused_author_tests:40,native_author_checks:n.result.checks.length,source_hashes_unchanged:true,review:dir+'review.json',manifest_files:Object.keys(manifest).length},null,2));
