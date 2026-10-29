import { describe, expect, it } from 'vitest';
import { createResourceLedger } from '../src/compute/resourceLedger';
import type { Lease, PlanEntry, Refusal } from '../src/compute/resourceLedger';
const caps = { managed: 1024, job: 768, history: 512 };
function accepted(value: Lease | Refusal): Lease {
  expect(value).not.toHaveProperty('code');
  return value as Lease;
}
function tuple(l: ReturnType<typeof createResourceLedger>) {
  const { managed, job, history } = l.snapshot();
  return [managed, job, history];
}
describe('G1a resource ledger', () => {
  it('04 reclassifies only one owning ref and rolls back all categories on refusal', () => {
    for (const bytes of [256, 768]) {
      const l = createResourceLedger(caps), owner = l.createRealm();
      const a = accepted(l.reserve([{ key: 'a', bytes, category: 'job', owner }]));
      const r = a.ref('a'); a.allocateBuffer(r);
      const b = accepted(l.reserve([])); const r2 = b.retain(r, 'job', owner);
      expect(r2).not.toHaveProperty('code');
      const before = l.snapshot(), result = a.reclassify(r, 'history');
      if (bytes === 768) { expect(result).toEqual({ ok: false, code: 'BUDGET' }); expect(l.snapshot()).toEqual(before); }
      else { expect(result).toBeUndefined(); expect(tuple(l)).toEqual([256, 256, 256]); }
      expect(() => a.reclassify(r2 as never, 'resident')).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });
  it('03 retains materialized backing once per category with atomic history refusal', () => {
    for (const history of [512, 768]) {
      const l = createResourceLedger({ ...caps, history }), owner = l.createRealm();
      const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'resident', owner }]));
      const b = accepted(l.reserve([])), r = a.ref('a');
      const before = l.snapshot();
      expect(() => b.retain(r, 'job', owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(l.snapshot()).toEqual(before);
      a.allocateBuffer(r);
      const r2 = b.retain(r, 'resident', owner);
      expect(r2).not.toBe(r);
      expect(r2).not.toHaveProperty('code');
      expect(tuple(l)).toEqual([768, 0, 0]);
      expect(() => b.allocateBuffer(r2 as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      const live = l.snapshot();
      const h = b.retain(r, 'history', owner);
      if (history === 512) { expect(h).toEqual({ ok: false, code: 'BUDGET' }); expect(l.snapshot()).toEqual(live); }
      else { expect(h).not.toHaveProperty('code'); expect(tuple(l)).toEqual([768, 0, 768]); }
    }
  });
  it('02 atomically refuses managed/category excess and malformed plans before allocation', () => {
    let allocations = 0;
    const l = createResourceLedger(caps, { allocate: n => { allocations++; return new ArrayBuffer(n); } });
    const owner = l.createRealm();
    const plan = (bytes: number, category: PlanEntry['category'] = 'resident'): PlanEntry[] => [{ key: 'x', bytes, category, owner }];
    accepted(l.reserve(plan(768, 'job')));
    const before = l.snapshot();
    expect(l.reserve(plan(257))).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.reserve([...plan(1), { key: 'y', bytes: 256, category: 'resident', owner }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.snapshot()).toEqual(before);
    for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => l.reserve(plan(bad))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
    expect(() => l.reserve([...plan(1), ...plan(2)])).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => l.reserve([{ ...plan(1)[0], owner: {} as never }])).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(l.snapshot()).toEqual(before);
    accepted(l.reserve(plan(256)));
    expect(tuple(l)).toEqual([1024, 768, 0]);
    expect(l.reserve(plan(1))).toEqual({ ok: false, code: 'BUDGET' });
    expect(allocations).toBe(0);
    const huge = createResourceLedger({ managed: Number.MAX_SAFE_INTEGER, job: Number.MAX_SAFE_INTEGER, history: Number.MAX_SAFE_INTEGER });
    const r = huge.createRealm();
    expect(huge.reserve([{ key: 'a', bytes: Number.MAX_SAFE_INTEGER, category: 'resident', owner: r }, { key: 'b', bytes: 1, category: 'resident', owner: r }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(tuple(huge)).toEqual([0, 0, 0]);
  });
  it('01 reserves before a real exact-limit native allocation', () => {
    const l = createResourceLedger(caps), owner = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'job', owner }]));
    expect(tuple(l)).toEqual([768, 768, 0]);
    const backing = a.allocateBuffer(a.ref('a'));
    expect(backing).toBeInstanceOf(ArrayBuffer);
    expect(backing.byteLength).toBe(768);
    expect(tuple(l)).toEqual([768, 768, 0]);
  });
});
