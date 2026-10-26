import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PROTECTED_PROJECT_LIMITS } from '../io/cryptoLimits';

export function Modal({ title, onCancel, children }: { title: string; onCancel(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="project-dialog" aria-label={title} onCancel={event => { event.preventDefault(); cancel.current(); }}>
    <h2>{title}</h2>{children}
  </dialog>;
}

export function FileProtectionDialog({ mode, busy, error, onCancel, onSubmit }: { mode: 'save' | 'open'; busy: boolean; error: string; onCancel(): void; onSubmit(password: string, encrypted: boolean): void }) {
  const [encrypted, setEncrypted] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [plaintextAcknowledged, setPlaintextAcknowledged] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  return <Modal title={mode === 'save' ? 'Zapisz kopię projektu' : 'Otwórz szyfrowany projekt'} onCancel={onCancel}>
    <form onSubmit={event => {
      event.preventDefault();
      if (mode === 'save' && encrypted && password !== confirmation) { setMismatch(true); return; }
      if (!encrypted && !plaintextAcknowledged) return;
      onSubmit(password, encrypted); setPassword(''); setConfirmation(''); setMismatch(false);
    }}>
      <p className="muted small">Projekt może zawierać dane zdrowotne. Pseudonim nie oznacza anonimizacji.</p>
      {mode === 'save' && <label className="field"><span>Ochrona pliku</span><select aria-label="Ochrona pliku" value={encrypted ? 'encrypted' : 'plain'} disabled={busy} onChange={event => { setEncrypted(event.target.value === 'encrypted'); setPassword(''); setConfirmation(''); }}><option value="encrypted">Szyfrowany — zalecany</option><option value="plain">Nieszyfrowany JSON — jawna kopia</option></select></label>}
      {encrypted ? <>
        <label className="field"><span>Hasło — minimum 12 znaków</span><input aria-label="Hasło — minimum 12 znaków" type="password" autoComplete={mode === 'save' ? 'new-password' : 'current-password'} minLength={12} maxLength={PROTECTED_PROJECT_LIMITS.passwordMaxChars} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        {mode === 'save' && <label className="field"><span>Powtórz hasło</span><input aria-label="Powtórz hasło" type="password" autoComplete="new-password" minLength={12} maxLength={PROTECTED_PROJECT_LIMITS.passwordMaxChars} required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>}
        <p className="muted small">Wpisz hasło samodzielnie. Nie jest zapisywane ani wysyłane. Bez hasła nie odzyskasz projektu. JavaScript nie gwarantuje wyzerowania pamięci.</p>
      </> : <>
        <p className="warning-text">Nieszyfrowany plik zawiera geometrię i może zawierać dane zdrowotne mimo pseudonimu. Chroń folder, kopie i sposób przekazania.</p>
        <label className="checkbox-label"><input type="checkbox" checked={plaintextAcknowledged} onChange={event => setPlaintextAcknowledged(event.target.checked)} /><span>Rozumiem ryzyko jawnego zapisu</span></label>
      </>}
      {mode === 'save' && <p className="muted small">Limit treści szyfrowanego projektu: {(PROTECTED_PROJECT_LIMITS.plaintextBytes / 1024 / 1024).toFixed(1)} MiB. Pobranie kopii nie potwierdza trwałego zapisu na dysku. Sprawdź plik przed zamknięciem pracowni.</p>}
      {(error || mismatch) && <p className="warning-text" role="alert">{error || 'Hasła nie są jednakowe.'}</p>}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onCancel}>Anuluj</button><button type="submit" className="primary" disabled={busy || (!encrypted && !plaintextAcknowledged)}>{busy ? 'Przetwarzanie…' : mode === 'open' ? 'Odszyfruj i otwórz' : encrypted ? 'Pobierz szyfrowaną kopię' : 'Pobierz nieszyfrowany JSON'}</button></div>
    </form>
  </Modal>;
}

export function ConfirmDiscardDialog({ onCancel, onDiscard }: { onCancel(): void; onDiscard(): void }) {
  return <Modal title="Ochrona bieżącej pracy" onCancel={onCancel}>
    <p>Projekt ma zmiany od otwarcia. Pobranie kopii nie potwierdza trwałego zapisu. Kontynuacja zastąpi bieżący projekt i usunie lokalne cofanie.</p>
    <p className="muted small">Wybierz „Zostań”, aby najpierw zapisać i sprawdzić kopię.</p>
    <div className="dialog-actions"><button autoFocus className="primary" onClick={onCancel}>Zostań w projekcie</button><button className="secondary" onClick={onDiscard}>Zastąp bieżący projekt</button></div>
  </Modal>;
}
