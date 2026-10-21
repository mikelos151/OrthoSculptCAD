const messages: Record<string, string> = {
  "Open contour": "Otwarty kontur przekroju.",
  "Open boundary edges": "Siatka ma otwarte krawędzie brzegowe.",
  "Branched/ambiguous contour":
    "Rozgałęziony lub niejednoznaczny kontur przekroju.",
  "Expected exactly one contour":
    "Do pomiaru wymagany jest dokładnie jeden zamknięty kontur.",
  "Coincident/collinear projected landmarks":
    "Punkty po rzutowaniu pokrywają się lub leżą na jednej prostej. Wskaż rozdzielone punkty przedni i boczny.",
  "Collinear transverse landmarks":
    "Punkty poprzeczne leżą na jednej prostej. Wybierz inny punkt boczny.",
  "Principal axis is ambiguous: insufficient elongation for proximal-axis inference":
    "Oś główna jest niejednoznaczna — model nie jest dostatecznie wydłużony, aby ustalić kierunek proksymalny.",
  "Distal pick does not resolve the principal proximal direction":
    "Punkt dystalny nie określa kierunku proksymalnego. Wskaż rzeczywisty koniec modelu.",
  "Incompatible landmark chirality/laterality: right-handed X lateral / Y anterior / Z proximal required; no automatic reflection":
    "Punkty nie tworzą prawoskrętnego układu X bocznie / Y do przodu / Z proksymalnie. Sprawdź stronę i położenie punktów. Aplikacja nie wykonuje automatycznego odbicia lustrzanego.",
};
/** Unknown diagnostic details remain visible, never converted into a success message. */
export function polishDiagnostic(message: string): string {
  return messages[message.replace(/^Error: /, "")] ?? message;
}
