import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { appendWorkspaceEvent, createWorkspace, validateWorkspace } from '../src/workspace';
import { loadProject, saveProject } from '../src/io/project';
import { protectProject } from '../src/io/protectedProject';

const now = '2026-10-22T10:00:00.000Z';
function mesh() {
  return { name: 'synthetic workspace regression', source: 'synthetic' as const, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
}
function threeEvents() {
  const first = createWorkspace({}, now);
  const second = appendWorkspaceEvent(first, { kind: 'tape-update', label: 'Synthetic tape' }, now);
  return appendWorkspaceEvent(second, { kind: 'undo', label: 'Synthetic undo' }, now);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('workspace review regressions through public functions', () => {
  it.skipIf(process.env.ORTHO_REAL_WORKER !== '1')('rejects the original sparse journal in actual Chromium before Blob/KDF and roundtrips a dense control', async () => {
    const server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(), errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.resolvedUrls!.local[0]}tests/fixtures/web/index.html`);
      const result = await page.evaluate(async () => {
        const browserImport = new Function('p', 'return import(p)');
        const { createWorkspace, appendWorkspaceEvent, validateWorkspace } = await browserImport('/src/workspace/index.ts');
        const { saveProject, loadProject } = await browserImport('/src/io/project.ts');
        const { protectProject } = await browserImport('/src/io/protectedProject.ts');
        const model = { name: 'synthetic Chromium journal fixture', source: 'synthetic', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
        const now = '2026-10-22T10:00:00.000Z';
        let state = createWorkspace({}, now);
        for (let i = 0; i < 2; i++) state = appendWorkspaceEvent(state, { kind: 'undo', label: 'Synthetic event' }, now);
        const denseRoundtrip = JSON.stringify(loadProject(await saveProject(model, model.positions.slice(), [], state).text()).workspace) === JSON.stringify(state);
        delete state.events[1];
        const OriginalBlob = window.Blob, originalDerive = crypto.subtle.deriveKey;
        let blobs = 0, kdfs = 0, validateRejected = false, appendRejected = false, saveRejected = false;
        window.Blob = class extends OriginalBlob { constructor(parts?: BlobPart[], options?: BlobPropertyBag) { super(parts, options); blobs++; } };
        crypto.subtle.deriveKey = ((...args: Parameters<SubtleCrypto['deriveKey']>) => { kdfs++; return originalDerive.apply(crypto.subtle, args); }) as SubtleCrypto['deriveKey'];
        try {
          try { validateWorkspace(state); } catch { validateRejected = true; }
          try { appendWorkspaceEvent(state, { kind: 'undo', label: 'Must reject' }, now); } catch { appendRejected = true; }
          try { await protectProject(saveProject(model, model.positions.slice(), [], state), 'synthetic-test-only-password'); } catch { saveRejected = true; }
        } finally { window.Blob = OriginalBlob; crypto.subtle.deriveKey = originalDerive; }
        return { denseRoundtrip, validateRejected, appendRejected, saveRejected, blobs, kdfs, length: state.events.length, keys: Object.keys(state.events), revision: state.revision };
      });
      process.stdout.write(`REAL_CHROMIUM_SPARSE_WORKSPACE ${JSON.stringify(result)}\n`);
      expect(result).toEqual({ denseRoundtrip: true, validateRejected: true, appendRejected: true, saveRejected: true, blobs: 0, kdfs: 0, length: 3, keys: ['0', '2'], revision: 2 });
      expect(errors).toEqual([]);
    } finally { await browser.close(); await server.close(); }
  }, 30_000);
  it.each(['landmark slot', 'landmark coordinate', 'inherited landmark coordinate'] as const)('rejects a missing own %s before project serialization', path => {
    const state = appendWorkspaceEvent(createWorkspace({ side: 'right' }, now), { kind: 'register', label: 'Synthetic registration', registration: {
      side: 'right', landmarks: [[0, 1, 0], [1, 0, 0], [0, 0, 0]],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flexionDegrees: 0, sourceRevision: 0,
    } }, now);
    if (path === 'landmark slot') Reflect.deleteProperty(state.registration!.landmarks, 0);
    else {
      Reflect.deleteProperty(state.registration!.landmarks[0], 1);
      if (path === 'inherited landmark coordinate') Object.setPrototypeOf(state.registration!.landmarks[0], Object.assign(Object.create(Array.prototype), { 1: 1 }));
    }
    const model = mesh();
    expect(() => validateWorkspace(state)).toThrow();
    expect(() => saveProject(model, model.positions.slice(), [], state)).toThrow();
  });
  it('rejects inherited registration matrix slots as missing own data', () => {
    const state = appendWorkspaceEvent(createWorkspace({ side: 'right' }, now), { kind: 'register', label: 'Synthetic registration', registration: {
      side: 'right', landmarks: [[0, 1, 0], [1, 0, 0], [0, 0, 0]],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flexionDegrees: 0, sourceRevision: 0,
    } }, now);
    const matrix = state.registration!.matrix;
    Reflect.deleteProperty(matrix, 0);
    Object.setPrototypeOf(matrix, Object.assign(Object.create(Array.prototype), { 0: 1 }));
    expect(() => validateWorkspace(state)).toThrow();
  });
  it('rejects an inherited journal slot, not only an empty hole', () => {
    const state = threeEvents(), inherited = state.events[1];
    delete state.events[1];
    Object.setPrototypeOf(state.events, Object.assign(Object.create(Array.prototype), { 1: inherited }));
    expect(() => validateWorkspace(state)).toThrow();
  });
  it('rejects a middle journal hole before producing a project Blob or starting encryption/KDF', async () => {
    const state = threeEvents(), model = mesh();
    delete state.events[1]; // length=3, own keys 0/2, revision=2: the original review repro.
    const NativeBlob = Blob;
    let blobs = 0;
    vi.stubGlobal('Blob', class extends NativeBlob { constructor(parts?: BlobPart[], options?: BlobPropertyBag) { super(parts, options); blobs++; } });
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    const attempts = [
      () => validateWorkspace(state),
      () => appendWorkspaceEvent(state, { kind: 'undo', label: 'Must reject' }, now),
      () => saveProject(model, model.positions.slice(), [], state),
    ];
    for (const attempt of attempts) expect(attempt).toThrow();
    await expect((async () => protectProject(saveProject(model, model.positions.slice(), [], state), 'synthetic-test-only-password'))()).rejects.toThrow();
    expect(blobs).toBe(0); expect(derive).not.toHaveBeenCalled();
    expect(state.events.length).toBe(3); expect(Object.keys(state.events)).toEqual(['0', '2']);
  });

  it('keeps a valid dense journal exactly roundtrippable through saveProject/loadProject', async () => {
    const state = threeEvents(), model = mesh();
    const loaded = loadProject(await saveProject(model, model.positions.slice(), [], state).text());
    expect(loaded.workspace).toEqual(state);
    expect(loaded.workspace!.events.every((_, i) => Object.hasOwn(loaded.workspace!.events, i))).toBe(true);
  });
});
