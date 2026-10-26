import { describe, expect, it } from 'vitest';
import { createStrokeFence } from '../src/hooks/workbenchState';
import type { MeshData } from '../src/types';

const mesh = (): MeshData => ({ name: 'PUBLIC SYNTHETIC', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]) });
const source = () => ({ projectEpoch: 1, revision: 3, mesh: mesh(), unit: 'mm' as const, unitsConfirmed: true });

describe('recorded gesture source fence (before dispatch AND publication)', () => {
  it('accepts the same confirmed source until finished, only once', () => {
    const fence = createStrokeFence(), origin = source(), ticket = fence.begin(origin)!;
    expect(ticket).not.toBeNull();
    expect(fence.current(ticket, origin)).toBe(true);
    expect(fence.begin(origin)).toBeNull(); // synchronous, no React render needed
    fence.finish(ticket);
    expect(fence.current(ticket, origin)).toBe(false);
  });
  it.each([
    ['undo/revision', (s: ReturnType<typeof source>) => ({ ...s, revision: s.revision + 1 })],
    ['new project with reused case code/revision/mesh', (s: ReturnType<typeof source>) => ({ ...s, projectEpoch: s.projectEpoch + 1 })],
    ['mesh replacement at the same revision', (s: ReturnType<typeof source>) => ({ ...s, mesh: mesh() })],
    ['cleared mesh', (s: ReturnType<typeof source>) => ({ ...s, mesh: null })],
    ['unit confirmation revoked', (s: ReturnType<typeof source>) => ({ ...s, unitsConfirmed: false })],
    ['physical source units changed', (s: ReturnType<typeof source>) => ({ ...s, unit: 'cm' as const })],
  ])('rejects stale %s before either boundary', (_name, change) => {
    const fence = createStrokeFence(), origin = source(), ticket = fence.begin(origin)!;
    expect(fence.current(ticket, origin)).toBe(true);
    expect(fence.current(ticket, change(origin))).toBe(false);
  });
  it('cancels synchronously and old finish/callback cannot consume a newer gesture', () => {
    const fence = createStrokeFence(), origin = source(), old = fence.begin(origin)!;
    fence.cancel();
    expect(fence.current(old, origin)).toBe(false);
    const newer = fence.begin(origin)!;
    fence.finish(old);
    expect(fence.current(old, origin)).toBe(false);
    expect(fence.current(newer, origin)).toBe(true);
  });
  it('does not begin without a current mesh and confirmed physical units', () => {
    const fence = createStrokeFence(), origin = source();
    expect(fence.begin({ ...origin, mesh: null })).toBeNull();
    expect(fence.begin({ ...origin, unitsConfirmed: false })).toBeNull();
    expect(fence.begin(origin)).not.toBeNull();
  });
});
