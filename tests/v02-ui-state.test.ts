import { describe, expect, it } from 'vitest';
import { createTaskGate, workProtection, normalsUsable, changedCoordinates, strokeEvent, makeUndoSnapshot, pushUndoHistory, qualitySummary } from '../src/hooks/workbenchState';

describe('work protection', () => {
  it('does not treat generating a copy as durable disk confirmation', () => {
    expect(workProtection(true, 8, 8)).toEqual({ guard: true, copyCurrent: true });
    expect(workProtection(true, 9, 8)).toEqual({ guard: true, copyCurrent: false });
    expect(workProtection(false, 8, null)).toEqual({ guard: false, copyCurrent: false });
  });
});

describe('normal-dependent tools', () => {
  it('fails closed unless outward orientation has a passing winding check', () => {
    expect(normalsUsable(null)).toBe(false);
    expect(normalsUsable({ orientation: 'outward', checks: [{ id: 'winding', status: 'unknown' }] })).toBe(false);
    expect(normalsUsable({ orientation: 'inward', checks: [{ id: 'winding', status: 'pass' }] })).toBe(false);
    expect(normalsUsable({ orientation: 'outward', checks: [{ id: 'winding', status: 'pass' }, { id: 'outward', status: 'unknown' }] })).toBe(false);
    expect(normalsUsable({ orientation: 'outward', checks: [{ id: 'winding', status: 'pass' }, { id: 'outward', status: 'pass' }] })).toBe(true);
  });
});

describe('stroke history', () => {
  it('records one bounded journal event only for a changed completed stroke', () => {
    expect(changedCoordinates(new Float32Array([1, 2]), new Float32Array([1, 2]))).toBe(false);
    expect(changedCoordinates(new Float32Array([1, 2]), new Float32Array([1, 3]))).toBe(true);
    expect(strokeEvent('relief', 20, 1, 0)).toBeNull();
    expect(strokeEvent('relief', 20, 1, 7)).toEqual({ kind: 'brush-relief', label: 'Pociągnięcie pędzla', parameters: { mode: 'relief', radiusMm: 20, strength: 1, dabCount: 7 } });
    expect(strokeEvent('smooth', 20, 0.5, 2)?.kind).toBe('smooth');
  });
});

describe('physical undo snapshots', () => {
  it('retains independent baseline, tape and unit confirmation with geometry', () => {
    const input = { mesh: { name: 'raw', positions: new Float32Array([1,2,3]), indices: new Uint32Array([0]), colors: new Float32Array([1,0,0]) }, baseline: new Float32Array([4,5,6]), tapes: [{ z: 3, circumference: 10 }], unitsConfirmed: false, unit: 'cm' as const };
    const snapshot = makeUndoSnapshot(input);
    input.mesh.positions[0] = 9; input.mesh.colors[0] = 0; input.baseline[0] = 9; input.tapes[0].circumference = 20;
    expect(snapshot.mesh.positions[0]).toBe(1); expect(snapshot.mesh.colors![0]).toBe(1); expect(snapshot.baseline![0]).toBe(4);
    expect(snapshot.tapes[0].circumference).toBe(10); expect(snapshot.unitsConfirmed).toBe(false); expect(snapshot.unit).toBe('cm');
    expect(pushUndoHistory([snapshot], snapshot, 1, 1024)).toHaveLength(1);
    expect(pushUndoHistory([], snapshot, 20, 1)).toHaveLength(0);
  });
});

describe('quality summary', () => {
  it('does not call empty, partial or incomplete evidence PASS', () => {
    expect(qualitySummary(null)).toBe('unknown');
    expect(qualitySummary({ complete: true, checks: [] })).toBe('unknown');
    expect(qualitySummary({ complete: true, checks: [{ id: 'winding', status: 'pass' }] })).toBe('unknown');
    expect(qualitySummary({ complete: false, checks: [{ id: 'winding', status: 'fail' }] })).toBe('fail');
  });
});

describe('atomic asynchronous publication', () => {
  it('rejects overlap synchronously and invalidates cancelled results', () => {
    const gate = createTaskGate();
    const first = gate.begin()!;
    expect(gate.begin()).toBeNull();
    expect(gate.current(first)).toBe(true);
    gate.cancel();
    expect(first.signal.aborted).toBe(true);
    expect(gate.current(first)).toBe(false);
    const second = gate.begin()!;
    gate.finish(first);
    expect(gate.current(second)).toBe(true);
    expect(gate.begin()).toBeNull();
    gate.finish(second);
    expect(gate.begin()).not.toBeNull();
  });
});
