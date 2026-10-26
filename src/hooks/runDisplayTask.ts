import type { DisplayResult, DisplayTask } from './displayTask';
type DisplayWorker = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'terminate'> & { postMessage(value: unknown, transfer: Transferable[]): void };
let active = false;
export function runDisplayTask(task: DisplayTask, options: { signal?: AbortSignal; factory?: () => DisplayWorker } = {}): Promise<DisplayResult> {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Anulowano', 'AbortError'));
  if (active) return Promise.reject(new Error('Obliczenie pędzla / mapy jest już aktywne.'));
  active = true;
  return new Promise((resolve, reject) => {
    let worker: DisplayWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: Error, result?: DisplayResult) => {
      if (settled) return;
      settled = true; active = false;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      if (error) reject(error); else resolve(result!);
    };
    const cancel = () => finish(new DOMException('Anulowano', 'AbortError'));
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      worker = options.factory?.() ?? new Worker(new URL('./display.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => {
        const message = event.data as { ok: boolean; result?: DisplayResult; message?: string };
        if (!message?.ok || message.result?.kind !== task.kind) { finish(new Error('Nie udało się obliczyć pociągnięcia / mapy. Model pozostał bez zmian.')); return; }
        finish(undefined, message.result);
      };
      worker.onerror = event => { event.preventDefault?.(); finish(new Error('Błąd silnika pędzla / mapy.')); };
      worker.onmessageerror = () => finish(new Error('Nieprawidłowa odpowiedź silnika pędzla / mapy.'));
      timer = setTimeout(() => finish(new Error('Przekroczono 120 s obliczenia. Skróć pociągnięcie lub uprość siatkę poza pracownią.')), 120_000);
      // Transfer only owned clones. Buffers used by Three and undo stay attached.
      const owned = structuredClone(task);
      const buffers = new Set<ArrayBuffer>();
      for (const array of [owned.mesh.positions, owned.mesh.indices, owned.mesh.colors, owned.mesh.uvs, owned.kind === 'heatmap' ? owned.baseline : undefined]) if (array) buffers.add(array.buffer as ArrayBuffer);
      worker.postMessage(owned, [...buffers]);
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
