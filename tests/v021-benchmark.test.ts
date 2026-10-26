import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateMesh } from '../src/geometry/core';
import { SliceIndex } from '../src/geometry/slicing';
import { copyMeshForWorker } from '../src/compute/copy';
// @ts-expect-error Standalone browser/Node benchmark intentionally has no package/types dependency.
import { createCylinder, planCase, DEFAULT_CASES, summarizeSamples, assessResponse, boundedOperation, parseOptions, readRepositoryCommit, summarizeRun } from '../scripts/benchmark-geometry.mjs';

describe('v0.2.1 synthetic benchmark geometry', () => {
  it('creates a deterministic closed indexed RGB cylinder with an exact Float32 polygon reference', async () => {
    const options = { rings: 7, sides: 13, radius: 40, height: 300 };
    const { mesh, reference } = createCylinder(options);
    expect(mesh.source).toBe('synthetic');
    expect(mesh.name).toContain('SYNTHETIC');
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.colors).toBeInstanceOf(Float32Array);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(createCylinder(options).mesh).toEqual(mesh);
    expect(mesh.positions.length / 3).toBe(93);
    expect(mesh.indices.length / 3).toBe(182);
    const topology = validateMesh(mesh);
    expect(topology).toMatchObject({ watertight: true, boundaryEdges: 0, nonManifoldEdges: 0, degenerateTriangles: 0, inconsistentEdges: 0 });
    expect(topology.signedVolume).toBeGreaterThan(0);
    const slice = new SliceIndex(mesh).slice(123.4567);
    expect(slice.valid).toBe(true);
    for (const key of ['perimeter', 'area', 'ap', 'ml'] as const) expect(slice[key]).toBeCloseTo(reference[key], 7);
    // Polygon reference is NOT substituted with the ideal-circle formula.
    expect(reference.perimeter).toBeLessThan(2 * Math.PI * options.radius);
    const imported = { ...mesh, source: 'imported' as const };
    expect((await copyMeshForWorker(mesh, true)).source).toBe('synthetic');
    expect((await copyMeshForWorker(imported, true)).source).toBe('imported');
  });

  it('retains raw finite durations and calculates median and nearest-rank p95 without reordering samples', () => {
    const samples = [5, 1, 3, 2];
    expect(summarizeSamples(samples)).toEqual({ count: 4, samplesMs: [5, 1, 3, 2], medianMs: 2.5, p95Ms: 5 });
    expect(samples).toEqual([5, 1, 3, 2]);
    expect(summarizeSamples([])).toEqual({ count: 0, samplesMs: [], medianMs: null, p95Ms: null });
    expect(() => summarizeSamples([NaN])).toThrow();
    expect(() => summarizeSamples([-1])).toThrow();
  });

  it('checks response validity before numeric errors and retains failed physical results', () => {
    const { mesh, reference } = createCylinder({ rings: 7, sides: 13 });
    const slice = new SliceIndex(mesh).slice(123.4567);
    expect(assessResponse(slice, reference, 123.4567)).toMatchObject({ status: 'ok', reportedValid: true });
    expect(assessResponse(slice, reference, 123.4567).absoluteErrors.area).toBeLessThan(1e-8);
    const missingSide = new Uint32Array([...mesh.indices.slice(0, 156), ...mesh.indices.slice(159)]);
    const bad = new SliceIndex({ ...mesh, indices: missingSide }).slice(123.4567);
    // The removed side triangle makes this real contour open.
    expect(bad.valid).toBe(false);
    expect(assessResponse(bad, reference, 123.4567)).toMatchObject({ status: 'invalid', reportedValid: false, absoluteErrors: null });
    expect(assessResponse({ ...slice, area: NaN }, reference, 123.4567)).toMatchObject({ status: 'invalid', absoluteErrors: null });
    expect(assessResponse(slice, reference, 124)).toMatchObject({ status: 'invalid', absoluteErrors: null });
    const row = { z: slice.z, valid: slice.valid, circumference: slice.perimeter, ap: slice.ap, ml: slice.ml, area: slice.area };
    expect(assessResponse(row, reference, slice.z, 'measureAt').absoluteErrors).toEqual(assessResponse(slice, reference, slice.z).absoluteErrors);
  });

  it('bounds hung operations, aborts native work and preserves the original timeout outcome', async () => {
    let observedSignal: AbortSignal | undefined;
    await expect(boundedOperation((signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    }, 10)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(observedSignal?.aborted).toBe(true);
    const external = new AbortController();
    external.abort();
    let called = false;
    await expect(boundedOperation(() => { called = true; return Promise.resolve(); }, 100, external.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(called).toBe(false);
    await expect(boundedOperation(() => Promise.resolve(42), 100)).resolves.toBe(42);
    await expect(boundedOperation(() => Promise.resolve(), 0)).rejects.toThrow();
  });

  it('validates bounded CLI configuration, keeps default cases and labels smoke separately', () => {
    expect(parseOptions([])).toMatchObject({ port: 4182, headless: true, coldRuns: 3, warmSamples: 10, warmups: 2, mode: 'serial-performance' });
    expect(parseOptions([]).cases).toEqual(DEFAULT_CASES);
    expect(parseOptions(['--smoke'])).toMatchObject({ coldRuns: 1, warmSamples: 3, warmups: 1, mode: 'correctness-smoke', cases: [DEFAULT_CASES[0]] });
    expect(parseOptions(['--cases=7x13,10k', '--warm-samples=4', '--headed']).cases).toEqual([{ id: '7x13', rings: 7, sides: 13 }, DEFAULT_CASES[1]]);
    expect(parseOptions(['--budget-control']).cases.at(-1)).toMatchObject({ id: '400k-budget-control', rings: 2000, sides: 200 });
    for (const args of [['--port=4176'], ['--warm-samples=0'], ['--cold-runs=1000'], ['--timeout-ms=120001'], ['--cases=1kx'], ['--unknown'], ['--max-vertices=-1'], ['--cases=1k,1k']]) expect(() => parseOptions(args)).toThrow();
  });

  it('reads optional repository provenance from controlled files without requiring a live checkout or child process', async () => {
    const base = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'ortho-benchmark-provenance-'));
    const expected = 'a'.repeat(40); // Synthetic Git fixture, not an asserted real project commit.
    try {
      expect(await readRepositoryCommit(base)).toBeNull();
      await mkdir(join(base, '.git', 'refs', 'heads'), { recursive: true });
      await writeFile(join(base, '.git', 'HEAD'), 'ref: refs/heads/test\n');
      await writeFile(join(base, '.git', 'refs', 'heads', 'test'), expected + '\n');
      expect(await readRepositoryCommit(base)).toBe(expected);
      await rm(join(base, '.git', 'refs', 'heads', 'test'));
      await writeFile(join(base, '.git', 'packed-refs'), expected + ' refs/heads/test\n');
      expect(await readRepositoryCommit(base)).toBe(expected);
      await writeFile(join(base, '.git', 'HEAD'), expected + '\n');
      expect(await readRepositoryCommit(base)).toBe(expected);
      await writeFile(join(base, '.git', 'HEAD'), 'ref: refs/../outside\n');
      expect(await readRepositoryCommit(base)).toBeNull();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('does not claim successful coverage for missing, failed or unexpectedly budget-skipped cases', () => {
    expect(summarizeRun([{ id: '1k', status: 'ok' }], [DEFAULT_CASES[0]])).toMatchObject({ complete: true, successful: 1 });
    expect(summarizeRun([], [DEFAULT_CASES[0]])).toMatchObject({ complete: false, requested: 1, recorded: 0 });
    expect(summarizeRun([{ id: '1k', status: 'skipped-budget' }], [DEFAULT_CASES[0]])).toMatchObject({ complete: false, unexpectedBudgetSkips: 1 });
    expect(summarizeRun([{ id: '1k', status: 'timed-out' }], [DEFAULT_CASES[0]])).toMatchObject({ complete: false, unsuccessful: 1 });
    expect(summarizeRun([{ id: '1k', status: 'ok' }, { id: '1k', status: 'ok' }], DEFAULT_CASES.slice(0, 2)).complete).toBe(false);
    expect(summarizeRun([{ id: '400k-budget-control', status: 'skipped-budget' }], [{ id: '400k-budget-control' }])).toMatchObject({ complete: true, skippedBudget: 1, successful: 0 });
  });

  it('plans actual counts and refuses allocation outside explicit resource limits', () => {
    expect(DEFAULT_CASES.map((c: { rings: number; sides: number }) => planCase(c).vertices)).toEqual([1026, 10002, 50002, 100002]);
    expect(planCase({ rings: 500, sides: 200 }, { maxVertices: 100000 })).toMatchObject({ admitted: false, vertices: 100002, triangles: 200000 });
    expect(planCase({ rings: 500, sides: 200 }, { maxInputBytes: 1024 }).admitted).toBe(false);
    expect(planCase({ rings: 500, sides: 200 }, { maxEstimatedWorkingBytes: 1024 }).admitted).toBe(false);
    expect(() => createCylinder({ rings: 1, sides: 8 })).toThrow();
    expect(() => createCylinder({ rings: 10.5, sides: 8 })).toThrow();
    expect(() => createCylinder({ rings: 1000000, sides: 1000000 })).toThrow();
    expect(() => createCylinder({ rings: 4, sides: 8, source: 'imported' })).toThrow(/synthetic/i);
    expect(() => createCylinder({ rings: 4, sides: 8, radius: Infinity })).toThrow();
  });
});
