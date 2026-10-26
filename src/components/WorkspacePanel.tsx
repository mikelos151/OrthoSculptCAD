import type { MeshAudit } from '../geometry/auditTypes';
import type { CaseDetails, WorkspaceState } from '../workspace/types';
import { useEffect, useState } from 'react';

export function WorkspacePanel({ workspace, busy, dirty, copyCurrent, onApply, onNew }: { workspace: WorkspaceState; busy: boolean; dirty: boolean; copyCurrent: boolean; onApply(details: CaseDetails): void; onNew(): void }) {
  const [draft, setDraft] = useState(workspace.caseDetails);
  useEffect(() => setDraft(workspace.caseDetails), [workspace.caseDetails]);
  return <section className="inspector-section workspace-panel" aria-label="Przestrzeń przypadku">
    <div className="section-title"><h3>Przypadek TT · r{workspace.revision}</h3><button className="text-button" disabled={busy} onClick={onNew}>Nowy projekt</button></div>
    <p className="muted small">{dirty ? (copyCurrent ? 'Pobrano kopię tej rewizji — sprawdź plik na dysku.' : 'Zmiany od otwarcia; brak kopii bieżącej rewizji.') : 'Projekt otwarty. Brak nowych zmian.'}</p>
    <form onSubmit={event => { event.preventDefault(); onApply(draft); }}>
      <label className="field"><span>Kod przypadku — pseudonim</span><input aria-label="Kod przypadku — pseudonim" value={draft.caseCode} maxLength={40} pattern="[A-Za-z0-9_-]{1,40}" required onChange={event => setDraft({ ...draft, caseCode: event.target.value })} /></label>
      <label className="field"><span>Strona kończyny</span><select aria-label="Strona kończyny" value={draft.side} onChange={event => setDraft({ ...draft, side: event.target.value as CaseDetails['side'] })}><option value="unspecified">Nieokreślona</option><option value="left">Lewa</option><option value="right">Prawa</option></select></label>
      <details><summary>Kontekst techniczny (opcjonalny)</summary>
        <label className="field"><span>Liner podczas skanu</span><select aria-label="Liner podczas skanu" value={draft.liner} onChange={event => setDraft({ ...draft, liner: event.target.value as CaseDetails['liner'] })}><option value="unknown">Brak informacji</option><option value="with-liner">Z linerem</option><option value="without-liner">Bez linera</option></select></label>
        <label className="field"><span>Kontekst skanu</span><input aria-label="Kontekst skanu" maxLength={200} value={draft.scanContext} onChange={event => setDraft({ ...draft, scanContext: event.target.value })} /></label>
        <label className="field"><span>Uwaga techniczna — bez danych osobowych</span><input aria-label="Uwaga techniczna — bez danych osobowych" maxLength={500} value={draft.technicalNote} onChange={event => setDraft({ ...draft, technicalNote: event.target.value })} /></label>
      </details>
      <button className="secondary full" type="submit" disabled={busy || JSON.stringify(draft) === JSON.stringify(workspace.caseDetails)}>Zastosuj dane przypadku</button>
    </form>
    <p className="muted small">Bez nazwiska i daty urodzenia. Pseudonim nie oznacza pełnej anonimizacji. Zmiana strony unieważnia rejestrację; nie odbija siatki.</p>
    <details className="revision-journal"><summary>Dziennik · {workspace.events.length} zdarzeń</summary>
      <p className="muted small">Dziennik nie jest archiwum siatek ani podpisem operatora. Cofanie działa tylko w bieżącej sesji (do 20 kopii / 128 MiB).</p>
      <ol>{workspace.events.slice().reverse().map(event => <li key={event.revision}><strong>r{event.revision} · {event.label}</strong><small>{event.at}</small>{event.kind === 'migration' && <span>Historia wcześniejsza: nieznana.</span>}</li>)}</ol>
    </details>
  </section>;
}

const qualityLabels: Record<string, string> = {
  'edge-manifold': 'Manifold krawędzi', watertight: 'Zamknięta topologia krawędzi',
  'vertex-manifold': 'Manifold wierzchołków', components: 'Spójność powierzchni',
  'degenerate-triangles': 'Ściany niezdegenerowane', winding: 'Spójność orientacji ścian',
  'self-intersections': 'Samoprzecięcia 3D', outward: 'Normalne na zewnątrz',
  'minimum-thickness': 'Minimalna grubość',
};

export function QualityPanel({ audit, busy, onAnalyze, onOrient }: { audit: MeshAudit | null; busy: boolean; onAnalyze(): void; onOrient(): void }) {
  return <section className="inspector-section quality-panel" aria-label="Bramki jakości">
    <h3>Jakość bieżącej geometrii</h3>
    {audit ? <ul className="quality-list">{audit.checks.map(check => <li key={check.id}>
      <span className={`quality-status ${check.status}`}>{check.status.toUpperCase()}</span>
      <div><strong>{qualityLabels[check.id] ?? check.label}</strong><small>{check.detail}</small></div>
    </li>)}</ul> : <p className="muted small"><strong>UNKNOWN</strong> · brak aktualnego audytu. Brak wyniku nie oznacza poprawności.</p>}
    {audit && <p className="muted small">Audyt {audit.complete && audit.checks.length > 0 ? "wykonany w swoim zakresie" : "niepełny — UNKNOWN"} · {audit.candidateTests.toLocaleString("pl-PL")} prób par · {audit.elapsedMs.toFixed(1)} ms. Zakres i ograniczenia podano przy kontrolach.</p>}
    <div className="button-row"><button className="secondary" disabled={busy} onClick={onAnalyze}>Sprawdź jakość</button><button className="secondary" disabled={busy} onClick={onOrient}>Uporządkuj normalne</button></div>
    <p className="muted small">Nie jest zwolnieniem klinicznym. Minimalna grubość: UNKNOWN — parametr offsetu jej nie potwierdza.</p>
  </section>;
}
