import { expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { export3MF, manufacturingAvailability } from '../src/manufacturing/index';
import { downloadBlob } from '../src/io/index';
const mesh = { name: 'Local <scan>', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]) };
it('exports genuine OPC 3MF zip with millimeter units, triangles, relationships and research metadata', async () => {
  const blob = export3MF(mesh); const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'].sort());
  const xml = strFromU8(files['3D/3dmodel.model']);
  expect(xml).toContain('unit="millimeter"'); expect(xml).toContain('http://schemas.microsoft.com/3dmanufacturing/core/2015/02');
  expect(xml.match(/<vertex /g)).toHaveLength(4); expect(xml.match(/<triangle /g)).toHaveLength(4);
  expect(xml).toContain('v1="0" v2="2" v3="1"'); expect(xml).toContain('Local &lt;scan&gt;');
  expect(xml).toMatch(/research|badawcz/i);
  expect(strFromU8(files['_rels/.rels'])).toContain('Target="/3D/3dmodel.model"');
  expect(strFromU8(files['[Content_Types].xml'])).toContain('application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
});
it('refuses an open surface rather than labeling a non-solid as a printable 3MF model', () => {
  expect(() => export3MF({ name: 'open', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) })).toThrow(/zamknięt|manifold/i);
});
it('blocks fictional adapter fabrication and machine-ready CNC', () => {
  expect(manufacturingAvailability.adapter.available).toBe(false);
  expect(manufacturingAvailability.adapter.reason).toMatch(/producent/i);
  expect(manufacturingAvailability.cnc.available).toBe(false);
  expect(manufacturingAvailability.cnc.reason).toMatch(/maszyn/i);
});
it('downloads locally with explicit filename and revokes temporary blob URL', () => {
  vi.useFakeTimers(); const click = vi.fn(); const remove = vi.fn();
  const a = { click, remove, href: '', download: '' };
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => a, body: { append: vi.fn() } });
  try {
    downloadBlob(new Blob(['data']), 'local.stl'); expect(a.download).toBe('local.stl'); expect(a.href).toBe('blob:local'); expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers(); expect(revoke).toHaveBeenCalledWith('blob:local'); expect(remove).toHaveBeenCalledOnce();
    expect(() => downloadBlob(new Blob(), '../unsafe.stl')).toThrow();
  } finally { create.mockRestore(); revoke.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
