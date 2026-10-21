import { describe, expect, it } from 'vitest';
import { packMesh, unpackSlice } from '../src/nativeProtocol';
import type { MeshData } from '../src/types';
const triangle: MeshData = { name: 'triangle', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]) };
describe('native binary protocol', () => {
  it('packs the exact little endian header and typed arrays without JSON conversion', () => {
    const data = packMesh(triangle);
    expect(data.byteLength).toBe(64);
    const view = new DataView(data);
    expect(view.getUint32(0,true)).toBe(0x4f534344);
    expect(view.getUint32(4,true)).toBe(1);
    expect(view.getUint32(8,true)).toBe(3);
    expect(view.getUint32(12,true)).toBe(1);
    expect(view.getFloat32(28,true)).toBe(1);
    expect(view.getUint32(60,true)).toBe(2);
  });
  it('decodes an ordered square including metrics from the Rust response packet', () => {
    const result = unpackSlice(squarePacket());
    expect(result.valid).toBe(true);
    expect(result.z).toBe(20);
    expect(result.perimeter).toBe(8);
    expect(result.area).toBe(4);
    expect(result.ap).toBe(2);
    expect(result.ml).toBe(2);
    expect(result.queryMs).toBe(0.25);
    expect(result.loops[0].points).toEqual([[0,0],[2,0],[2,2],[0,2]]);
  });
  it('rejects malformed input rather than converting or allocating unbounded buffers', () => {
    expect(() => packMesh({...triangle,positions:new Float32Array([NaN,0,0,1,0,0,0,1,0])})).toThrow();
    expect(() => packMesh({...triangle,indices:new Uint32Array([0,1,9])})).toThrow();
    expect(() => packMesh({...triangle,positions:new Float32Array([0,0,0,1])})).toThrow();
    expect(() => unpackSlice(squarePacket().slice(0, 80))).toThrow();
    const extra = new Uint8Array(140); extra.set(new Uint8Array(squarePacket()));
    expect(() => unpackSlice(extra.buffer)).toThrow();
    const bad = squarePacket(); new DataView(bad).setFloat64(72,NaN,true);
    expect(() => unpackSlice(bad)).toThrow();
    const count = squarePacket(); new DataView(count).setUint32(36,0xffffffff,true);
    expect(() => unpackSlice(count)).toThrow();
    const flag = squarePacket(); new DataView(flag).setUint32(8,0,true);
    expect(unpackSlice(flag).valid).toBe(false);
    expect(unpackSlice(flag).perimeter).toBe(0);
  });
});
function squarePacket(): ArrayBuffer {
  const packet = new ArrayBuffer(136);
  const view = new DataView(packet);
  view.setUint32(0, 0x4f53534c, true); view.setUint32(4, 1, true);
  view.setUint32(8, 1, true); view.setUint32(12, 1, true);
  view.setFloat64(16,20,true); view.setFloat64(24,0.25,true);
  view.setUint32(32,1,true); view.setUint32(36,4,true);
  [8,4,2,2,0,0,2,0,2,2,0,2].forEach((value,i)=>view.setFloat64(40+i*8,value,true));
  return packet;
}
