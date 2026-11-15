import { createResourceLedger } from './resourceLedger';
import { createWorkerPoolCore } from './workerPool';
/** Legacy transports remain unbudgeted: an empty plan claims no payload accounting.
 * One application composition owns every compute/index/display constructor.
 * Existing adapters own their error listeners and pending-request settlement.
 * No source authority or ACTIVE entrypoint exists before G3.
 */
export type LegacyWorker = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'terminate'> & { postMessage(value: unknown, transfer: Transferable[]): void };
let mode: 'LEGACY' | 'CLOSING' = 'LEGACY';
const mainHolds = new Set<object>();
const bindings = new Map<() => void, () => void>();
const observers = new Set<() => void>();
const changed = () => { for (const notify of [...observers]) notify(); };
export function legacySnapshot() { return { mode, occupied: pool.snapshot().occupied, mainHolds: mainHolds.size }; }
/** Count real local continuation lifetimes, NOT payload bytes or ledger allocations. */
export function beginLegacyMain(): () => void {
  if (mode !== 'LEGACY' || mainHolds.size >= 2) throw Object.assign(new Error('Silnik zajęty: osiągnięto limit obliczeń.'), { code: 'BUSY' });
  const token = {}; mainHolds.add(token);
  return () => { if (mainHolds.delete(token)) changed(); };
}
/** Internal drain only. No ACTIVE/owner construction; caller must explicitly roll back. */
export function drainLegacy(): Promise<{ rollback(): void }> {
  if (mode !== 'LEGACY') return Promise.reject(Object.assign(new Error('Drain already active.'), { code: 'BUSY' }));
  mode = 'CLOSING';
  const deadline = performance.now() + 120_000;
  let rolledBack = false;
  const safe = () => pool.snapshot().occupied === 0 && mainHolds.size === 0;
  const rollback = () => {
    if (rolledBack) return;
    rolledBack = true;
    const reopen = () => { if (safe()) { observers.delete(reopen); mode = 'LEGACY'; } };
    observers.add(reopen); reopen();
  };
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: unknown) => {
      if (finished) return; finished = true;
      clearTimeout(timer); observers.delete(check);
      if (error) { rollback(); reject(error); } else resolve({ rollback });
    };
    const check = () => {
      if (performance.now() >= deadline) finish(new Error('Przekroczono czas drain.'));
      else if (safe()) finish();
    };
    const timer = setTimeout(() => finish(new Error('Przekroczono czas drain.')), Math.max(0, deadline - performance.now()));
    // Register after revoke iteration: no intermediate empty snapshot can complete drain.
    try { for (const revoke of [...bindings.values()]) revoke(); }
    catch (error) { finish(error); return; }
    observers.add(check); check();
  });
}
let captured: LegacyWorker | undefined;
let displayFactory: (() => LegacyWorker) | undefined;
const pool = createWorkerPoolCore(createResourceLedger(), kind => {
  try { captured = kind === 'display'
    ? displayFactory?.() ?? new Worker(new URL('../hooks/display.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch { throw new Error('Nie udało się uruchomić silnika Worker.'); }
  return captured as Worker;
}, undefined, false);
/** Synchronous early gate for bounded parameter validation before construction. */
export function assertLegacyAdmission(): void {
  if (mode !== 'LEGACY' || mainHolds.size >= 2 || pool.snapshot().occupied >= 2) throw Object.assign(new Error('Silnik zajęty: osiągnięto limit obliczeń.'), { code: 'BUSY' });
}
export function acquireLegacyWorker(kind: 'compute' | 'display' | 'index', factory?: () => LegacyWorker) {
  assertLegacyAdmission();
  captured = undefined;
  displayFactory = factory;
  try {
    const lease = pool.acquire(kind, []);
    if ('code' in lease) throw Object.assign(new Error('Silnik zajęty: osiągnięto limit obliczeń.'), { code: lease.code });
    const worker = captured!;
    const release = () => { pool.release(lease); bindings.delete(release); changed(); };
    bindings.set(release, () => { worker.onmessage = worker.onerror = worker.onmessageerror = null; release(); });
    return { worker, release, onRevoke: (revoke: () => void) => { if (bindings.has(release)) bindings.set(release, revoke); } };
  } finally { captured = undefined; displayFactory = undefined; }
}
