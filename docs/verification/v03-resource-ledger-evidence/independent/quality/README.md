# Niezależny review G1a — zakres i odtwarzanie

## Wynik

PASS wyłącznie dla prymitywu G1a w zadanym modelu zaufania: 12 niezależnych scenariuszy, 4254 asercje; w tym deterministyczny graf 1600 kroków porównywany po każdej operacji z rzeczywistym API. Nie skopiowano testów autora ani nie użyto jego oceny jako dowodu. Testy autora i zamrożony kontrakt przeczytano; handoff autora potraktowano wyłącznie jako dane.

Weryfikowano dokładnie niezmieniony `resourceLedger.ts`, kompilowany lokalnie zainstalowanym TypeScript. Nie modyfikowano repozytorium, testów, dokumentacji, konfiguracji, profili ani skills. Cały materiał tego review zapisano tylko w bieżącym katalogu scratch. Inni wykonawcy mogą równolegle dodawać własne pliki; potwierdzenie niezmienności dotyczy trzech zahashowanych wejść i HEAD, nie całego współdzielonego drzewa.

## Odtwarzanie

Z terminala Git Bash:

```bash
python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-quality-review/replay.py
```

Runner sprawdza trzy zamrożone SHA-256 przed i po pracy, kompiluje rzeczywisty moduł do lokalnego `compiled/`, uruchamia `witness.cjs`, zapisuje polecenia/stdout/stderr/kody wyjścia i czyta HEAD z lokalnych metadanych Git. Nie instaluje pakietów, nie uruchamia pełnego suite ani przeglądarki. Kompilator i witness mają `--max-old-space-size=128 --max-semi-space-size=8`.

Sam witness po kompilacji:

```bash
node --max-old-space-size=128 --max-semi-space-size=8 C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-quality-review/witness.cjs
```

## Dowody

- `review.json`: werdykt z zakresem i ograniczeniami.
- `witness.cjs`, `tsconfig.json`, `replay.py`: uruchamialny, niezależny harness.
- `witness-results.json`: rzeczywiste wyniki wszystkich 12 scenariuszy i natywne provenance.
- `witness-run.json`, `witness.log`: pierwszy przebieg witnessa, exit 0.
- `replay-run.json`, `replay.log`, `replay-compile.json`, `replay-witness.json`, `replay-verification.json`: pełne skuteczne odtworzenie, exit 0.
- `compile.json`: zachowana pierwsza, zbyt szeroka kompilacja — exit 134, rzeczywisty fatal heap-limit kompilatora. To błąd operacyjnego doboru harnessu, nie wynik próby alokacji payloadu ani reprodukcja błędu ledgeru.
- `compile-isolated.json`: skuteczna kompilacja z `types: []` i tylko biblioteką ES2022, przy tym samym 128/8 limicie; exit 0.
- `operational-issues.json`: jawne środowiskowe problemy i naprawy harnessu.
- `inputs-before.json`, `inputs-after.json`, `hashmanifest.json`: wejścia, niezmienność i integralność artefaktów.
- `static-scan.json`: własny skan obu nowych plików; brak dopasowań dla wskazanych wzorców sekretów, dynamic exec, sieci/procesów i IO. Nie jest to dowód całkowitego braku podatności.

## Interpretacja granic

- Runtime capabilities opierają się na ledger-local WeakMap, nie na TS brandzie, key, JSON, klonie ani numerze z diagnostyki. Lease/ref/realm i borrowed receivers sprawdzono niezależnie.
- Weryfikowano reserved/live/retired/closed, cross-lease ownership, idempotent cleanup, kontrolowany ref brokera i priorytety `INVALID_INPUT`/`CLOSED`.
- Preflight BUDGET porównywano z całym grafem, nie samymi sumami. Błąd alokatora zgodnie z kontraktem usuwa wyłącznie odpowiedni niezmaterializowany ref, zachowując inne reserved/live/controlled refs.
- Realne backing tests obejmują intrinsic length z getterami rzucającymi wyjątek, natywny bufor z innego realm, widoki, SAB/RAB, detached 0/7 B, zły rozmiar, obiekt niebędący AB i duplicate backing.
- Po zaobserwowanym zewnętrznym detach odmowy zachowują charge; jawny release/close odzyskuje stan. Nie obiecuje to kontroli nad cudzym detach.
- Sprawdzono recykling control slots przy zerowych bajtach i pustych lease, deep freeze i brak buffers/native authority w snapshotach. 32 rejestracje realm to limit lifetime, nie błąd resetowania licznika.
- `allocate` i controls są zaufanym seam composition/testing. Wrogie callbacki, nadpisane globalne intrinsics i dowolny kod JS tego samego realm nie są modelem niezaufanego pliku. `reserve` używa zwykłego iteratora/getterów JS; nie przedstawiam go jako sanitizera dla arbitrary JS i nie wykazano reentrancy osiągalnej z dozwolonych zwykłych danych.
- Domyślne limity 128/128/384 MiB pozostają niezmienione; sprawdzono je bez materializowania cap-sized buforów. Największy natywny payload witnessa wynosił 32 B.

Brak dowodu i brak deklaracji PASS dla: whole-object source admission/audit, integracji App/CAD, G1b native transfer/rebinding/ACK/terminate/main-SHA hold, przeglądarkowych Workers, RSS/GC, clinical/native EXE lub pełnej regresji rodzica. Logiczny transfer zmienia tylko metadane owner realm; zachowany byteLength jawnie odróżnia go od native transport.

To niezależne pokrycie istniejącego zachowania, nie nowe cykle TDD RED/GREEN. Nie wprowadzano defektów do produkcji ani sztucznych worker/hash odpowiedzi w celu wygenerowania RED.
