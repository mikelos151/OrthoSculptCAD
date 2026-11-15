import { afterEach, expect, it, vi } from 'vitest';
import { createGracefulNativeHandoff as createNativeHandoff, decodeInputPacket, encodeInputPacket } from '../src/compute/nativeHandoff';
import type { Lease, } from '../src/compute/resourceLedger';
class Transport extends EventTarget {
  static all: Transport[] = [];
  packets: ReturnType<typeof encodeInputPacket>[] = [];
  terminates = 0;
  constructor() { super(); Transport.all.push(this); }
  postMessage(p: ReturnType<typeof encodeInputPacket>, transfer: Transferable[] = []) { this.packets.push(structuredClone(p, { transfer })); }
  terminate() { this.terminates++; }
  reply(type: number, change?: (h: DataView) => void) {
    const start = this.packets[0], p = { header: start.header.slice(0), descriptors: type >= 4 ? new ArrayBuffer(0) : start.descriptors.slice(0), buffers: [] };
    const h = new DataView(p.header); h.setUint32(8, type, true); if (type >= 4) h.setUint32(32, 0, true); change?.(h);
    this.dispatchEvent(new MessageEvent('message', { data: p }));
  }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); Transport.all = []; });
function setup() {
  vi.useFakeTimers(); vi.stubGlobal('Worker', Transport);
  const c = createNativeHandoff();
  function submit() {
    const l = c.ledger.reserve([{ key: 'a', bytes: 16, category: 'job', owner: c.mainRealm }]) as Lease;
    const ref = l.ref('a'), b = l.allocateBuffer(ref), h = c.submit(l, [{ ref, role: 1 }]);
    if ('code' in h) throw Error(h.code); l.close();
    return { h, b, w: Transport.all.at(-1)! };
  }
  return { c, submit };
}
it('public release after RECEIVED retains slot/charge until correlated RELEASED then terminates exactly once', async () => {
  const { c, submit } = setup(), { h, b, w } = submit(); w.reply(2);
  c.release(h);
  expect(w.terminates).toBe(0);
  expect(decodeInputPacket(w.packets[1]).type).toBe(4);
  expect(b.byteLength).toBe(0); expect(c.ledger.snapshot().managed).toBe(16);
  expect(c.snapshot().pool.occupied).toBe(1);
  const consumer = c.ledger.reserve([]) as Lease;
  expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
  w.reply(5); await expect(c.wait(h)).rejects.toMatchObject({ code: 'RELEASED' });
  expect(w.terminates).toBe(1); expect(c.ledger.snapshot().managed).toBe(0); expect(c.snapshot().pool.occupied).toBe(0);
  w.reply(5); c.release(h); expect(w.terminates).toBe(1); consumer.close(); c.dispose();
});

it('two occupied slots reject third before touching inputs; one RELEASED cannot retire the other', async () => {
  const { c, submit } = setup(), a = submit(), b = submit(); a.w.reply(2); b.w.reply(2);
  let reads = 0;
  const input = Object.defineProperty([], '0', { get() { reads++; throw Error('copy'); } });
  expect(c.submit({} as Lease, input)).toEqual({ ok: false, code: 'BUSY' }); expect(reads).toBe(0);
  c.release(a.h); expect(c.ledger.snapshot().managed).toBe(32);
  a.w.reply(5); await expect(c.wait(a.h)).rejects.toMatchObject({ code: 'RELEASED' });
  expect(c.ledger.snapshot().managed).toBe(16); expect(b.w.terminates).toBe(0);
  const d = submit(), before = c.ledger.snapshot(); a.w.reply(5); c.release(a.h);
  expect(c.ledger.snapshot()).toEqual(before); expect(d.w.terminates).toBe(0);
  c.dispose(); expect(decodeInputPacket(b.w.packets[1]).type).toBe(6);
  b.w.reply(5); d.w.reply(5); expect(c.ledger.snapshot().managed).toBe(0);
});
it('no RELEASED has a fixed one-second bound despite duplicate public revokes', async () => {
  const { c, submit } = setup(), a = submit(); a.w.reply(2); c.release(a.h);
  vi.advanceTimersByTime(999); c.release(a.h); expect(a.w.terminates).toBe(0);
  vi.advanceTimersByTime(1); expect(a.w.terminates).toBe(1);
  await expect(c.wait(a.h)).rejects.toMatchObject({ code: 'RELEASED' }); expect(c.ledger.snapshot().managed).toBe(0); c.dispose();
});
it.each(['nonce', 'future', 'unissued', 'malformed', 'active-ack'])('current cleanup %s faults without extending grace or touching other slot', kind => {
  const { c, submit } = setup(), a = submit(), b = submit(); a.w.reply(2); b.w.reply(2); c.release(a.h);
  if (kind === 'malformed') a.w.dispatchEvent(new MessageEvent('message', { data: {} }));
  else a.w.reply(kind === 'active-ack' ? 2 : 5, h => {
    if (kind === 'nonce') h.setUint32(40, h.getUint32(40, true) ^ 1, true);
    if (kind === 'future') h.setUint32(16, 2, true);
    if (kind === 'unissued') h.setUint32(28, 2, true);
  });
  expect(a.w.terminates).toBe(1); expect(b.w.terminates).toBe(0); expect(c.ledger.snapshot().managed).toBe(16);
  c.dispose(); b.w.reply(5);
});
it('main deadline clips cleanup even when the timer task has not run', () => {
  const { c, submit } = setup(); let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const a = submit(); a.w.reply(2); now = 119900; c.release(a.h);
  now = 120001; a.w.reply(5); expect(a.w.terminates).toBe(1); expect(c.ledger.snapshot().managed).toBe(0);
  vi.restoreAllMocks(); c.dispose();
});
it('release at the original deadline terminates synchronously without issuing cleanup control', () => {
  const { c, submit } = setup(); let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const a = submit(); a.w.reply(2); now = 120000; c.release(a.h);
    expect(a.w.terminates).toBe(1); expect(a.w.packets).toHaveLength(1);
    expect(c.ledger.snapshot().managed).toBe(0);
  } finally { vi.restoreAllMocks(); c.dispose(); }
});
it('cleanup correlation exists before synchronous RELEASED delivery inside native send (UNIT reentry)', async () => {
  const { c, submit } = setup(), a = submit(); a.w.reply(2);
  const send = a.w.postMessage.bind(a.w);
  a.w.postMessage = (p, transfer) => { send(p, transfer); a.w.reply(5); };
  c.release(a.h); expect(a.w.terminates).toBe(1);
  await expect(c.wait(a.h)).rejects.toMatchObject({ code: 'RELEASED' }); expect(c.snapshot().pool.occupied).toBe(0); c.dispose();
});
