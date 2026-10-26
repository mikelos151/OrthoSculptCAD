import type { ComputePayloads, ComputeResults, TaskOptions } from './types';
import { executeGeometry } from './execute';
import { WorkerClient } from './client';
export type { ComputePayloads, ComputeResults, TaskOptions } from './types';
export { createWorkerSliceEngine } from './sliceEngine';
export type { WorkerSliceEngine } from './sliceEngine';

import { abortError } from './protocol';
import { copyMeshForWorker, copyParameters, needsAppearance, preflightMesh } from './copy';
export async function runGeometryTask<K extends keyof ComputePayloads>(op: K, payload: ComputePayloads[K], opts?: TaskOptions): Promise<ComputeResults[K]> {
  const signal = opts?.signal;
  if (signal?.aborted) throw abortError();
  const appearance = needsAppearance(op);
  preflightMesh(payload.mesh, appearance);
  const parameters = copyParameters(op, payload);
  const nodeOnly = typeof window === 'undefined' && typeof Worker === 'undefined';
  // Reserve the worker before allocating any copies: at most two cold uploads/jobs.
  const client = nodeOnly ? undefined : new WorkerClient();
  const abort = () => client?.dispose(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const mesh = await copyMeshForWorker(payload.mesh, appearance, signal);
    if (signal?.aborted) throw abortError();
    const owned = { ...parameters, mesh } as ComputePayloads[K];
    if (!client) return await executeGeometry(op, owned);
    return await client.request({ kind: 'task', op, payload: owned }) as ComputeResults[K];
  } finally { signal?.removeEventListener('abort', abort); client?.dispose(); }
}
