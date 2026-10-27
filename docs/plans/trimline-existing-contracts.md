# Istniejące kontrakty a ręczna linia obrzeża

Aktualny stan: powłoka korzysta z pojedynczego płaskiego pierścienia proksymalnego i parametrów wywinięcia. Poniższe ograniczenia wynikają z odczytanych typów i funkcji.

| Istniejąca funkcja/typ | Ścieżka | Obecne ograniczenie istotne dla ręcznej linii obrzeża |
|---|---|---|
| `Vec3`, `MeshData` | `src/types.ts` | Współrzędne są w mm, w układzie X/Y/Z z osią Z proksymalną; `MeshData` nie zawiera osobnego pola linii obrzeża. |
| `TopologyReport` | `src/types.ts` | Pętle graniczne są tablicami indeksów wierzchołków, a nie osobnym zapisem ręcznej linii. |
| `ShellOptions` | `src/types.ts` | Zawiera tylko grubość, kąt i promień wywinięcia; nie przyjmuje linii obrzeża. |
| `ProximalPlane`, `readProximalPlane` | `src/manufacturing/proximal.ts` | Pierścień musi być płaski w tolerancji, blisko proksymalnego końca, na płaszczyźnie podpierającej i z normalną odchyloną najwyżej o 30° od +Z. |
| `removeProximalCap` | `src/manufacturing/proximal.ts` | Usuwa wyłącznie rozpoznaną szeroką, spójną płaską pokrywę; nie wycina dowolnego obrzeża. |
| `buildShell` — wejście | `src/manufacturing/shell.ts` | Akceptuje jedną otwartą pętlę proksymalną albo zamkniętą siatkę z rozpoznawalną płaską pokrywą, usuwaną wewnętrznie; dalej wymaga zamkniętego końca dystalnego oraz przejścia kontroli topologii i audytu. |
| `buildShell` — wywinięcie i wynik | `src/manufacturing/shell.ts` | Wywinięcie działa na istniejących wierzchołkach, nie dodaje geometrii linii obrzeża; wynik musi przejść kontrolę i audyt. Offset nie gwarantuje minimalnej grubości. |
| `WorkspaceEventKind`, `WorkspaceEvent` | `src/workspace/types.ts` | Lista rodzajów zdarzeń nie zawiera operacji linii obrzeża; parametry zdarzenia mają wartości proste. |
| `WorkspaceState` | `src/workspace/types.ts` | Ten typ nie zawiera pola linii obrzeża; dziennik nie jest pełnym archiwum stanów siatki do odtworzenia. |

Braki: macierz wymagań wskazuje, że swobodna anatomiczna linia obrzeża i przymiarki nie są zaimplementowane. Parametr wywinięcia ani płaska granica ich nie zastępują.
