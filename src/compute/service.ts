import { assertMesh } from '../geometry/core';
import { executeGeometry } from './execute';
import { WORKER_FAILURE_MESSAGE, ZONE_NO_CHANGE_MESSAGE, type WorkerRequest, type WorkerResponse } from './protocol';
import type { SliceIndex } from '../geometry/slicing';

/** One service and cached index per actual Worker. Never stores a UI-owned buffer. */
export function createWorkerService() {
  let index: SliceIndex | undefined;
  return { async handle(request: WorkerRequest): Promise<WorkerResponse> {
    const { id, generation } = request;
    try {
      if (!Number.isSafeInteger(id) || !Number.isSafeInteger(generation)) throw new Error();
      let result: Extract<WorkerResponse, { ok: true }>['result'];
      switch (request.kind) {
        case 'task': assertMesh(request.payload.mesh); result = await executeGeometry(request.op, request.payload); break;
        case 'init': {
          if (index) throw new Error();
          assertMesh(request.mesh);
          const { SliceIndex } = await import('../geometry/slicing');
          index = new SliceIndex(request.mesh); result = null; break;
        }
        case 'slice': {
          if (!index || !Number.isFinite(request.z)) throw new Error();
          result = index.slice(request.z); break;
        }
        default: throw new Error();
      }
      return { id, generation, ok: true, result };
    } catch (error) {
      if (request.kind === 'task' && request.op === 'zone' && error instanceof Error && error.message === ZONE_NO_CHANGE_MESSAGE) {
        return { id, generation, ok: false, error: ZONE_NO_CHANGE_MESSAGE, code: 'ZONE_NO_CHANGE' };
      }
      return { id, generation, ok: false, error: WORKER_FAILURE_MESSAGE };
    }
  } };
}
