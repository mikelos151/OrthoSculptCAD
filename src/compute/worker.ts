import { createWorkerService } from './service';
import { transferBuffers } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';
// No DOM, network, persistence, telemetry or data-bearing diagnostics in this worker.
const scope = self as unknown as { onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null; postMessage(message: WorkerResponse, transfer: Transferable[]): void };
const service = createWorkerService();
scope.onmessage = async event => {
  const response = await service.handle(event.data);
  // Copy result arrays before transfer: no cached/service-owned input gets detached.
  const owned = structuredClone(response);
  scope.postMessage(owned, transferBuffers(owned));
};
