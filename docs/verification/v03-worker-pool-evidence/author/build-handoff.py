from pathlib import Path
import hashlib, json
s = Path(__file__).parent
root = Path('C:/Users/sandr/OrthoSculptCAD')
read = lambda name: json.loads((s / name).read_text())
audit, native, commands = read('source-end.json'), read('native-results.json'), read('final-commands.json')
start = read('source-start.json')
summary = {
 'scope': 'G1b1a isolated internal pool primitive only; parent replay and independent reviews pending',
 'repository': str(root), 'head_start': '2a586bd3abe3c801e7fe23764fecc77b8c770b50', 'head_end': (s / 'head-end.log').read_text().strip(),
 'created_repo_files': list(audit['new_file_hashes']), 'source_hashes': audit['new_file_hashes'],
 'protected': {'tracked_files_hashed': audit['protected_file_count'], 'changed': audit['changed_protected_files'],
   'resourceLedger_sha256_start_end': start['src/compute/resourceLedger.ts'], 'ledger_tests_sha256_start_end': start['tests/v03-resource-ledger.test.ts'],
   'tracked_and_index_diff_empty': (s / 'tracked-diff.log').stat().st_size == 0 and (s / 'index-diff.log').stat().st_size == 0,
   'canonical_plan': 'Read only relevant clauses. Another owner may change canonical transport clauses/evidence; not claimed unchanged and not edited here.'},
 'exports': {'runtime': ['createWorkerPool'], 'types': ['WorkerKind','InternalPlanEntry','InternalPlan','PoolLease','PoolRefusal','WorkerPool','WorkerPoolSnapshot']},
 'api': {'factory': 'createWorkerPool(sameRealResourceLedger, trustedInternalFactory(kind): Worker)',
   'acquire': 'acquire(kind, readonly plan) -> opaque PoolLease | {ok:false,code:BUSY|BUDGET}',
   'release': 'release(authentic pool-local lease): void; authentic retired no-op; no revoke/dispatch alias',
   'dispose': 'dispose(): void; revokes all public leases and closes acquire synchronously; repeated no-op',
   'snapshot': 'Frozen disposed/ownershipDomains/occupied plus 2 frozen ordinal/incarnation/generation/phase diagnostics; no Worker/Realm/Lease/Ref/nonce'},
 'limits': {'occupied_slots': 2, 'ownership_domains': 3, 'plan_entries': 16, 'key_length': 'same ledger maxKeyLength, default 128',
   'payload_policy_unchanged': {'job': 134217728, 'history': 134217728, 'managed': 402653184},
   'native_fixture': {'managed':1024,'job':768,'history':512,'maxRealms':3,'maxLeases':2,'maxRefs':2},
   'ordinals': 'Number.MAX_SAFE_INTEGER cutoff closes pool rather than wrapping; not wire uint32 ABI', 'nonce': 'private 128-bit native crypto.getRandomValues per admitted binding'},
 'errors': {'BUSY': 'return before reservation/nonce/native constructor if both logical slots occupied',
   'BUDGET': 'atomic ledger reservation refusal or >16 entries; composition realm/counter capacity can throw BUDGET',
   'INVALID_INPUT': 'foreign/JSON/structuredClone/diagnostic handles; invalid role, malformed plan delegated to real G1a validation; repeated exact Worker object from trusted factory',
   'CLOSED': 'acquire after synchronous dispose, including dispose during factory',
   'native_errors': 'constructor errors rethrown after own reservation cleanup; terminate errors leave FAILED slot/charge and revoked public auth; no retry; async error/messageerror uses captured exact binding'},
 'verification': {'unit': {'passed':40,'G1a_unchanged':16,'pool':24,'heapMiB':256,'semiSpaceMiB':8,'maxWorkers':1,'fileParallelism':False},
   'vertical_TDD_red_green_cycles': audit['red_green_cycles'], 'phases': 'phases/*/{command.json,output.log,workerPool.ts,v03-worker-pool.test.ts}',
   'TDD_note': 'Existing-behavior coverage that passed immediately is labelled as such. Each of 14 missing-behavior cycles has actual functional RED exit 1 followed by GREEN exit 0; missing module/import errors are not counted.',
   'tsc': {'exit':next(c['exit'] for c in commands if c['label']=='tsc-final'),'heapMiB':512,'incremental':False},
   'native': {'passed':native['passed'],'checks':len(native['result']['checks']),'metrics':native['result']['metrics'],'maxCreatedMinusTerminated':native['result']['maximumLiveObjects'],
     'browser':native['result']['browser'],'nativeConstructorFailure':'Actual new Worker invalid URL throws SyntaxError synchronously; no network',
     'expectedTrustedNativeWorkerErrors':native['result']['expectedErrors'],'pageErrors':native['pageErrors'],'externalRequests':native['externalRequests'],'closed':native['closed']},
   'source_and_served_hashes':native['hashes'], 'commands':commands, 'static_scan':audit['static_scan']},
 'boundaries': ['No App/WorkerClient/runDisplayTask migration, production singleton or global application cap claim.',
   'No transport, ACK, handoff/rebind, deadline wire, remote grants, main-SHA/WAIT_MAIN settlement or owner/audited-source capability.',
   'No native old-binding event after terminate was manufactured: late captured callback guard is explicitly TEST unit coverage.',
   'Physical Worker thread completion, GC, RSS, EXE, clinical readiness, G1b2, G2c/G3 mixed-positive and full CAD acceptance not claimed.',
   'Main ownership domain exists privately but no main continuations are created. External resource leases remain outside pool close scope.',
   'Multiple isolated helper instances are not a whole-App singleton; production constructor URLs/composition are a future G1b2 responsibility.',
   'Parent must replay full serial regression and two independent reviews before acceptance/stage/commit.'],
 'issues': ['Initial Python subprocess invocation of git failed with WinError 5; used shell git listing and Python hashing successfully. No source workaround or settings change.',
   'Full project suite intentionally not run concurrently; only focused 16+24 tests plus complete tsc and owned native fixture.'],
 'git_operations': 'No stage/commit/reset/stash. No dependency install or profile/skill/config/dist/ZIP edits.'
}
assert summary['head_start'] == summary['head_end']
(s / 'handoff.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
md = f'''# G1b1a — przekazanie do review

- Wynik: **izolowany prymityw działa; odbiór rodzica nadal wymagany**.
- Nowe pliki repo: `src/compute/workerPool.ts`, `tests/v03-worker-pool.test.ts`. Bez integracji App/legacy.
- API: `createWorkerPool(ledger, trustedFactory)` → `acquire`, `release`, `dispose`, `snapshot`. Autentyczne lease rozpoznaje wyłącznie lokalny WeakMap; retired h1 jest no-op, obce/klony/diagnostyka → INVALID_INPUT.
- Limit 2 obejmuje STARTING/IDLE/REVOKING/FAILED; pełny plan rezerwowany w tym samym prawdziwym G1a przed constructor. BUSY przed reserve/copy/constructor/send. BUDGET nie zostawia slotu.
- 3 prywatne domeny powstają raz; per-slot incarnation i global generation nie zawijają. Nonce 128-bit z native crypto jest prywatny, nie jest dowodem fizycznej tożsamości.
- Release/error/dispose: auth znika przed efektami; slot wraca dopiero po udanym wywołaniu `Worker.terminate()`. Throw → zajęty FAILED i zachowany charge, bez retry. Dispose zamyka acquire synchronicznie, także przy reentrancy factory.
- Żaden snapshot nie ujawnia Worker/Realm/resource Lease/Ref ani nonce. Zamknięcie dotyka tylko własnego lease zasobów.

## Faktyczna weryfikacja

- **40/40 testów**: 16 zamrożonych G1a + 24 nowych pool. Heap 256 MiB, semi-space 8 MiB, maxWorkers=1, fileParallelism=false.
- **{audit['red_green_cycles']} pionów RED→GREEN**: komendy, kody 1/0, raw output i snapshoty kodu w `phases/`. Natychmiastowe GREEN pozostałych przypadków jest coverage istniejącego zachowania, nie sfabrykowanym RED.
- Pełne `tsc --noEmit --incremental false`: exit 0, heap 512 MiB.
- Real Chromium **{native['result']['browser']['version']}**: **{len(native['result']['checks'])}/{len(native['result']['checks'])} checks PASS**, 50 prób native constructor, 49 rzeczywistych Workerów i 49 udanych terminate; peak created−terminated=2.
- 40 seryjnych inkarnacji przy maxRealms=3/maxLeases=2/maxRefs=2. Real native constructor SyntaxError bez sieci oraz 1 oczekiwany trusted worker error.
- 0 main postMessage, 0 payload allocator calls, 0 nieoczekiwanych pageerrors i 0 zewnętrznych requests. Idle fixture wysyła wyłącznie prawdziwy `idle-ready` z własnego natywnego skryptu — nie audyt ani udawany wynik produkcyjnego endpointu.
- 49/49 native close notifications jeszcze przed context teardown. Context/browser/server zamknięte; port rzeczywiście odmawia po zamknięciu. Nie jest to dowód thread join/GC/RSS.
- Vite transformuje rzeczywiste niezmienione moduły; `native-results.json`, `native-hashes.json` oraz `served/` wiążą source/served SHA.
- **{audit['protected_file_count']} istniejących tracked plików bez zmian**, tracked/index diff pusty, HEAD zachowany. Równoległych untracked docs/evidence nie edytowano; nie twierdzę, że canonical plan pozostał niezmieniony.

## Hash nowych źródeł

- workerPool.ts: `{audit['new_file_hashes']['src/compute/workerPool.ts']}`
- v03-worker-pool.test.ts: `{audit['new_file_hashes']['tests/v03-worker-pool.test.ts']}`

## Ograniczenia / następna bramka

Bez ACK/handoff/rebind/deadline ABI, remote grants, main-SHA/WAIT_MAIN, source ACTIVE, fake owner ani AuditedSource. Native opóźnionego starego eventu po terminate nie sfabrykowano — jawny TEST captured-callback pokrywa guard h1/h2. Niezmienione legacy ścieżki nadal omijają ten nowy helper; brak deklaracji globalnego cap aplikacji. Nie zmieniono G1a ani jego testów/defaultów 128/128/384 MiB. Full CAD/release 0.2/G2c+G3 pozostają poza zakresem.

Rodzic: serial full regression + dwa niezależne review przed akceptacją/commit. Nie stage'owano ani commitowano.

## Replay

```bash
node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-worker-pool-core/verify-final.mjs
```

`handoff.json` zawiera dokładne exports/limity/error contracts, komendy i hashe. `source-start.json` + `source-end.json` zapisują niezmienność istniejących plików. Jedyny problem środowiskowy: pierwszy Python→git subprocess dostał WinError 5; shell git + Python hash zadziałały, bez zmian ustawień.
'''
(s / 'HANDOFF.md').write_text(md, encoding='utf-8')
files = [p for p in s.rglob('*') if p.is_file() and 'vite-cache' not in p.parts and p.name != 'artifact-manifest.json']
manifest = {p.relative_to(s).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(s / 'artifact-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({'handoff': str(s / 'HANDOFF.md'),'artifacts_hashed':len(manifest),'unit':summary['verification']['unit'],'native':summary['verification']['native']['metrics'],'protected_files':audit['protected_file_count']}, indent=2))
