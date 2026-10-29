"""Assemble the review and hash manifest from real local run artifacts."""
from pathlib import Path
import hashlib
import json

OUT = Path(__file__).resolve().parent
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')

def load(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')

before = load('inputs-before.json')
after = {name: {'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest(),
                'bytes': (ROOT / name).stat().st_size} for name in before}
save('inputs-after.json', after)
assert before == after, 'Review input changed'
w = load('witness-results.json')
r = load('replay-verification.json')
compile_failed = load('compile.json')
assert compile_failed['exit_code'] == 134
assert w['passed'] and w['failed'] == 0 and len(w['results']) == w['tests'] == 12
assert sum(x['assertions'] for x in w['results']) == w['assertions'] == 4254
assert r['compile_exit'] == r['witness_exit'] == load('replay-run.json')['exit_code'] == 0
assert r['unchanged'] and r['expected_match']
assert r['git_head'] == 'f288ffccb0d1eb2f2f901d9a03e1daa408b289db'

save('operational-issues.json', [
    {
        'id': 'HARNESS-01', 'blocking': False,
        'finding': 'Pierwsza kompilacja tsc bez izolacji ambient types przekroczyła ustawiony limit heap 128 MiB; exit 134. Nie był to test fizycznego OOM ledgeru.',
        'raw_command_and_output': 'compile.json',
        'correction': 'Izolowany tsconfig: tylko ES2022, types: [], strict zachowany. Limitów Node 128/8 ani byte caps ledgeru nie podniesiono.',
        'verified_recovery': ['compile-isolated.json: exit 0', 'replay-compile.json: exit 0']
    },
    {
        'id': 'HARNESS-02', 'blocking': False,
        'finding': 'Pierwsze odtworzenie ukończyło compile/witness z exit 0, ale Python subprocess nie mógł uruchomić spakowanego git.exe: PermissionError [WinError 5] Odmowa dostępu. Cały pierwszy replay: exit 1. Osobny probe z pełną ścieżką git.exe także exit 1.',
        'provenance': 'Rzeczywiste wyniki terminal tool w tej sesji; poniższy excerpt nie jest rekonstrukcją pełnego raw logu.',
        'error_excerpt': 'PermissionError: [WinError 5] Odmowa dostępu',
        'first_command': 'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-quality-review/replay.py',
        'correction': 'Replay odczytuje lokalne metadane Git readonly i nadal porównuje HEAD z zamrożonym hashem; git rev-parse uruchomiony oddzielnie w Git Bash także potwierdził ten HEAD z exit 0.',
        'verified_recovery': ['replay-run.json: exit 0', 'replay-verification.json: HEAD zgodny']
    }
])

report = {
    'passed': True,
    'security_concerns': [],
    'logic_errors': [],
    'suggestions': [
        {
            'id': 'NB-G1B-01', 'severity': 'info',
            'location': 'src/compute/resourceLedger.ts:147-149; przyszła kompozycja G1b',
            'finding': '32 rejestracje realm są świadomie limitem lifetime ledgeru. Przyszły broker powinien ponownie używać tożsamości native realm zamiast rejestrować nową przy każdym job.',
            'blocking': False, 'scope': 'Przyszła integracja, nie wymagana poprawka G1a.'
        },
        {
            'id': 'NB-BOUNDARY-02', 'severity': 'info',
            'location': 'src/compute/resourceLedger.ts:22-24,151-162,171-181',
            'finding': 'Zachować prywatną granicę composition. reserve używa iteratora i odczytu pól JS, allocate/controls są zaufanym seam; ten moduł nie jest sanitizatorem dowolnych same-realm JS obiektów ani authority dla plików/JSON. Nie wykazano nieoczekiwanej reentrancy osiągalnej z dozwolonych zwykłych danych.',
            'blocking': False, 'scope': 'Przypomnienie granicy zaufania przed późniejszym udostępnieniem adapterów.'
        }
    ],
    'summary': 'PASS dla niezależnego security/quality review prymitywu G1a: brak odtworzonych błędów blokujących; 12/12 real-API scenariuszy i 4254 asercje PASS, w tym graf 1600 kroków. Nie jest to akceptacja G1b ani source admission.',
    'scope': {
        'repo': str(ROOT), 'branch': 'feature/trimline-v03', 'head': r['git_head'],
        'reviewed_files': ['src/compute/resourceLedger.ts', 'tests/v03-resource-ledger.test.ts'],
        'normative_contract': 'docs/plans/v03-source-admission-owner-design.md §5.1.1, lines 144-191',
        'input_hashes': after,
        'author_handoff': 'v03-resource-ledger-ts/handoff.json przeczytany wyłącznie jako dane, bez zaufania do samooceny; cudzych niezakończonych review nie czytano.',
        'writes': 'Wyłącznie C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-quality-review/',
        'readonly_input_confirmation': 'Trzy hashe wejściowe i HEAD identyczne przed/po. Nie twierdzę, że inne aktywne osoby nie dodały plików w repo.',
        'trust_model': [
            'Opaque ref/lease/realm mają ledger-local runtime WeakMap auth; numery i key są diagnostyką/lookup, nie capabilities.',
            'allocate oraz controls są zaufanym composition/testing seam; arbitralny JS/sandbox i dalsze użycie bufora po release nie są obiecane.',
            'Observed detached backing odmawia nowych przejść bez zdjęcia charge; cleanup jest jawny.',
            'Kontrole ograniczają aktywne logiczne rekordy; weak bookkeeping/caller-retained capabilities nie są deklaracją bound RSS.'
        ],
        'not_verified_or_claimed': [
            'Full suite/serial regression rodzica', 'Browser/native Worker transport i rebinding',
            'G1b ACK/terminate/timeout i main-SHA pending hold', 'Whole-object source admission/audit',
            'App/full CAD integration', 'RSS/heap/GC/physical RAM guarantee', 'Clinical/native EXE acceptance'
        ]
    },
    'evidence': {
        'tests': w['tests'], 'failed': w['failed'], 'assertions': w['assertions'],
        'graph_steps': w['results'][-1]['detail']['steps'],
        'scenario_results': w['results'], 'native_runtime': w['runtime'], 'payload': w['payload'],
        'installed_typescript_version': json.loads((ROOT / 'node_modules/typescript/package.json').read_text())['version'],
        'static_scan': 'static-scan.json: własny skan obu nowych plików, zero dopasowań wskazanych wzorców; nie jest to pełny dowód bezpieczeństwa.',
        'replay_command': 'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-quality-review/replay.py',
        'runnable_witness': 'witness.cjs + tsconfig.json + replay.py',
        'actual_exit_codes': {'initial_broad_compile': 134, 'isolated_compile': 0, 'first_witness': 0, 'initial_replay_environment_git_failure': 1, 'final_replay': 0, 'final_compile': 0, 'final_witness': 0},
        'raw_logs': ['compile.json', 'compile-isolated.json', 'witness-run.json', 'witness.log', 'replay-run.json', 'replay.log', 'replay-compile.json', 'replay-witness.json'],
        'hash_checks': ['inputs-before.json', 'inputs-after.json', 'replay-verification.json', 'hashmanifest.json'],
        'operational_issues': 'operational-issues.json: jawnie zachowane OOM kompilatora i WinError 5 Git/Python, oba rozwiązane bez zmian produkcji/limitów.',
        'tdd_claim': 'Niezależne pokrycie istniejącego zachowania; nie przypisuję tym przebiegom nowych cykli RED/GREEN.'
    }
}
save('review.json', report)

# Manifest covers every artifact present except its own self-referential digest.
files = sorted(p for p in OUT.rglob('*') if p.is_file() and p.name != 'hashmanifest.json')
manifest = {
    'algorithm': 'SHA-256', 'root': str(OUT), 'excludes_self': True,
    'inputs': after,
    'artifacts': [{'path': p.relative_to(OUT).as_posix(), 'bytes': p.stat().st_size,
                   'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
}
save('hashmanifest.json', manifest)
for item in manifest['artifacts']:
    assert hashlib.sha256((OUT / item['path']).read_bytes()).hexdigest() == item['sha256']
print(json.dumps({'passed': report['passed'], 'tests': w['tests'], 'assertions': w['assertions'],
                  'graph_steps': report['evidence']['graph_steps'], 'artifact_files_hashed': len(files),
                  'inputs_unchanged': before == after, 'blocking_findings': 0,
                  'report': str(OUT / 'review.json')}, indent=2))
