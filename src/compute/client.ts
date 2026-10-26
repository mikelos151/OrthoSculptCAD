import { ownedMeshTransfers } from './copy';
import { WORKER_FAILURE_MESSAGE, ZONE_NO_CHANGE_MESSAGE, type WorkerCommand, type WorkerResponse } from './protocol';

export const WORKER_TIMEOUT_MS = 120_000;
export const MAX_WORKERS = 2;
let activeWorkers = 0;
let generation = 0;

/** Each client owns one worker and at most one in-flight request. No hidden queue. */
export class WorkerClient {
  private worker: Worker;
  private readonly generation = ++generation;
  private nextId = 0;
  private closed = false;
  private startupTimer: ReturnType<typeof setTimeout>;
  private pending?: { id: number; allowNoChange: boolean; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  constructor() {
    if (activeWorkers >= MAX_WORKERS) throw new Error('Silnik zajęty: osiągnięto limit obliczeń.');
    try { this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); }
    catch { throw new Error('Nie udało się uruchomić silnika Worker.'); }
    activeWorkers++;
    this.startupTimer = setTimeout(() => this.dispose(new Error('Przekroczono czas inicjalizacji Worker.')), WORKER_TIMEOUT_MS);
    this.worker.onmessage = event => {
      const response = event.data as WorkerResponse;
      if (this.closed || !this.pending || !response || response.generation !== this.generation || response.id !== this.pending.id) return;
      const pending = this.pending!;
      this.pending = undefined;
      clearTimeout(pending.timer);
      if (response.ok === true) pending.resolve(response.result);
      else {
        const message = response.ok === false && pending.allowNoChange && response.code === 'ZONE_NO_CHANGE' ? ZONE_NO_CHANGE_MESSAGE : WORKER_FAILURE_MESSAGE;
        pending.reject(new Error(message));
        this.dispose();
      }
    };
    this.worker.onerror = event => { event.preventDefault?.(); this.dispose(new Error('Błąd silnika Worker.')); };
    this.worker.onmessageerror = () => this.dispose(new Error('Nieprawidłowa odpowiedź silnika Worker.'));
  }
  request(command: WorkerCommand): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Silnik Worker został zamknięty.'));
    if (this.pending) return Promise.reject(new Error('Silnik Worker jest zajęty.'));
    clearTimeout(this.startupTimer);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => this.dispose(new Error('Przekroczono czas obliczenia.')), WORKER_TIMEOUT_MS);
      this.pending = { id, allowNoChange: command.kind === 'task' && command.op === 'zone', resolve, reject, timer };
      try {
        // Request parameters are untrusted: never recursively discover transferables in them.
        const transfers = command.kind === 'slice' ? [] : ownedMeshTransfers(command.kind === 'init' ? command.mesh : command.payload.mesh);
        this.worker.postMessage({ ...command, id, generation: this.generation }, transfers);
      }
      catch { this.dispose(new Error('Nie udało się przesłać zadania do Worker.')); }
    });
  }
  dispose(error = new Error('Silnik Worker został zamknięty.')): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.startupTimer);
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
    this.worker.terminate();
    activeWorkers--;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
  }
}
