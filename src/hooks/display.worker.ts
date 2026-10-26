/// <reference lib="webworker" />
import { executeDisplayTask } from './displayTask';
import type { DisplayTask } from './displayTask';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<DisplayTask>) => {
  try {
    const result = executeDisplayTask(event.data);
    const arrays = result.kind === 'heatmap' ? [result.colors] : [result.mesh.positions, result.mesh.indices, result.mesh.colors, result.mesh.uvs];
    const buffers = new Set<ArrayBuffer>();
    arrays.forEach(array => { if (array) buffers.add(array.buffer as ArrayBuffer); });
    scope.postMessage({ ok: true, result }, [...buffers]);
  } catch { scope.postMessage({ ok: false }); }
};
