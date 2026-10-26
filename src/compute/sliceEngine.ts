import type { MeshData, SliceResult } from '../types';
import type { TaskOptions } from './types';
import { WorkerClient, WORKER_TIMEOUT_MS } from './client';
import { abortError } from './protocol';
import { copyMeshForWorker, preflightMesh } from './copy';
export interface WorkerSliceEngine { kind: 'worker'; slice(z: number, opts?: TaskOptions): Promise<SliceResult>; dispose(): void; }
type Read = { z: number; resolve(value: SliceResult): void; reject(error: Error): void; cleanup(): void };
/** Read-only latest-pending policy. Mutation jobs never use coalescing. */
export async function createWorkerSliceEngine(mesh: MeshData, opts?: TaskOptions): Promise<WorkerSliceEngine> {
  if (opts?.signal?.aborted) throw abortError();
  preflightMesh(mesh, false);
  const client = new WorkerClient();
  let closed = false, active: Read | undefined, pending: Read | undefined;
  const reject = (read: Read | undefined, error: Error) => { read?.cleanup(); read?.reject(error); };
  const dispose = (error = abortError()) => {
    if (closed) return;
    closed = true;
    reject(active, error); reject(pending, error);
    active = pending = undefined;
    opts?.signal?.removeEventListener('abort', abort);
    client.dispose(error);
  };
  const abort = () => dispose(abortError());
  opts?.signal?.addEventListener('abort', abort, { once: true });
  const start = (read: Read) => {
    active = read;
    void client.request({ kind: 'slice', z: read.z }).then(result => {
      if (closed) return;
      read.cleanup(); read.resolve(result as SliceResult);
      active = undefined;
      if (pending) { const next = pending; pending = undefined; start(next); }
    }, () => dispose(new Error('Nie udało się odczytać przekroju.')));
  };
  try {
    const owned = await copyMeshForWorker(mesh, false, opts?.signal);
    if (opts?.signal?.aborted) throw abortError();
    await client.request({ kind: 'init', mesh: owned });
    return { kind: 'worker', slice: (z, readOptions) => {
      if (closed) return Promise.reject(new Error('Silnik Worker został zamknięty.'));
      if (!Number.isFinite(z) || Math.abs(z) > 1e6) return Promise.reject(new Error('Nieprawidłowa wysokość przekroju.'));
      if (readOptions?.signal?.aborted) return Promise.reject(abortError());
      return new Promise<SliceResult>((resolve, rejectRead) => {
        const signal = readOptions?.signal;
        // Covers pending wait AND execution. No unbounded message queue.
        const timer = setTimeout(() => dispose(new Error('Przekroczono czas odczytu przekroju.')), WORKER_TIMEOUT_MS);
        const cancel = () => dispose(abortError());
        signal?.addEventListener('abort', cancel, { once: true });
        const read: Read = { z, resolve, reject: rejectRead, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } };
        if (active) {
          reject(active, abortError()); // in-flight computation may finish, but cannot publish
          reject(pending, abortError());
          pending = read;
        } else start(read);
      });
    }, dispose: () => dispose() };
  } catch (error) { dispose(); throw error; }
}
