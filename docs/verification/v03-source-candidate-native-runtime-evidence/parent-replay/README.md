# SourceCandidate — niezależny native Chromium Worker harness (TEST ONLY)

## Wynik

`cli.mjs` i `acceptance.mjs`: rzeczywiste exit 0. Pięć ograniczonych kontroli zachowania:

1. Nietknięty niezależny oracle: 31 przypadków / wszystkie 121 ścian. Node-observer porównuje pełny digest, stamp, kolejność vertexIDs, raw F32 bits i literalne exact `n`/`d`. Worker sprawdza głębokie frozen i brak publicznych buforów PRZED postMessage. Wszystkie fixture uint32 (włącznie z oczekiwanymi polami) walidowane przed TypedArray conversion. Publiczne obiekty po structuredClone nie muszą pozostawać frozen.
2. Mutacja lokalnych tablic callera WEWNĄTRZ Workera po `capture()` i przed `await`: wszystkie cztery ordinary subviews, offset 8, shadow getters/iterator/slice; getterTouches=0. Zmiana metadanych i stamp callera nie zmienia private S.
3. Pending-dispose: test-only gate zwraca wyłącznie bajty faktycznego native SHA. Zaobserwowano fulfillment native Promise, potem dispose przy nadal zamkniętym gate; brak publikacji handle, po otwarciu `STALE_SOURCE`. To test granicy async continuation, NIE pomiar zakończenia wewnętrznego wątku crypto, anulowania native SHA ani GC.
4. `structuredClone`, JSON, rzeczywisty foreign-store handle i native postMessage roundtrip pustego opaque handle: nie uwierzytelniają się. Osobno sprawdzone priorytety open/retired/closed i release.
5. Prawdziwy `bindFaceCubic`: exact controls, ordering, triangle i deep freeze; jeden wspólny kumulacyjny ctx przez oracle/resolve/bind, bez resetów. Dodatkowy osobny tiny ctx pozostaje wyczerpany po odmowie.

36 prawdziwych native SHA-256; wszystkie przechwycone preimage bytes i wyniki porównane w Node z niezależnym LE assemblerem i Node SHA; 31 digestów także bezpośrednio z literalnym Python oracle. Nie stosowano hash stubów ani generatora odpowiedzi Workera.

Chromium `156.0.8078.4`, Playwright `1.64.1`, Vite `8.3.5`. Świeży context, jeden rzeczywisty module Worker. Domyślne uruchomienie headless bez dodawania security flags. Node limit `256 MiB` old-space / `8 MiB` semi-space dotyczy wyłącznie procesu harnessu, nie całkowitego RAM ani Chromium.

## Replay

Z bash (wszystkie zapisy tylko w tym katalogu):

```bash
NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-native-runtime/cli.mjs
NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-candidate-native-runtime/acceptance.mjs
```

CLI korzysta wyłącznie z już zainstalowanych `vite.build` i Playwright znalezionych względem repo `package.json`; nie instaluje zależności i nie czyta repo konfiguracji Vite. Weryfikuje zamrożone hashe przed/po, buduje faktyczne źródła do `bundle/`, dodatkowo porównuje źródła w sourcemap bajtowo przez SHA. Serwer binduje wyłącznie 127.0.0.1 na porcie ephemeral i obsługuje tylko dokładne GET `/` oraz `/worker.js`. Żaden App server ani dist nie jest używany.

Cleanup w `finally`: native terminate, potwierdzony Playwright Worker close JESZCZE PRZED context.close, browser disconnect, server.close, odmowa połączenia z zamkniętym portem. Dowody pokazują 0 zewnętrznych żądań, 0 pageerrors i 0 workererrors. Rejestrowane są native constructor/postMessage/message/terminate oraz Worker-local digest chronology.

## Artefakty i provenance

- `cli.mjs`, `worker.ts`, `index.html`: pełny wykonywalny test-only harness.
- `acceptance.mjs`: weryfikacja wyniku, cleanup oraz aktualnych hashy źródeł/artefaktów względem manifestu.
- `acceptance-red.log`: początkowa rzeczywista odmowa z powodu brakującego browser evidence; nie jest to sfabrykowany RED istniejącego modułu produkcyjnego.
- `acceptance-green.log`, `run.log`: rzeczywiste logi zakończone exit 0.
- `raw-results.json`: nieprzetłumaczone dane wyników, poza konwersją native BigInt → literalny string `n`/`d` wymaganą do JSON; payload oczekiwań oracle pozostaje nietknięty.
- `results.json`: asercje, wszystkie preimages/hashes, native chronology, UA, requesty i cleanup.
- `manifest.json`, `handoff.json`: hashe źródeł, modułów, bundle i głównych artefaktów, replay i granice.
- `bundle/worker.js`, `bundle/worker.js.map`: faktycznie obsłużony bundle i byte-identical sourcesContent.

Zamrożony SourceCandidate SHA-256:
`983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b`

Worker bundle SHA-256:
`9fb389d3260a92ad812774f862970dbc19fd265bb0776ffa8dd263b85111d6dd`

## Granice

Wyłącznie syntetyczne TESTDATA; przypadek `TESTDATA-source-imported-metadata-only` jest metadanymi testu, nie prawdziwym importem/PHI. Brak testu SAB (`crossOriginIsolated=false`, SAB niedostępny); nie raportujemy PASS takiego przypadku. Bez claimu całego RSS/GC, audytu/admission, product retained-owner/proxy capability, pool integration, cut/shell/UI ani fences aplikacji. Budżety i cały zakres produktu bez zmian. Zero zapisów w repo, konfiguracji, profilach/skills lub zależnościach; brak git stage/commit/reset. Nie uruchamiano całych zestawów projektu.
