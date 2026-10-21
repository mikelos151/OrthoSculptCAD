import { expect, it } from 'vitest';
import { loadProject, saveProject, exportMeasurements, parseSTL } from '../src/io/index';
import { exportSTL, export3MF } from '../src/manufacturing';
import { strFromU8, unzipSync } from 'fflate';
import type { MeshData } from '../src/types';
const mesh: MeshData = { name: 'Skan lokalny', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), colors: new Float32Array([1, 0.5, 0, 0, 1, 0, 0, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 0, 1]), textureUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=' };
it('roundtrips versioned project including typed arrays, baseline, tapes and embedded texture', async () => {
  const baseline = new Float32Array(mesh.positions); baseline[0] = 2;
  const saved = saveProject(mesh, baseline, [{ z: 3, circumference: 123 }]);
  const result = loadProject(await saved.text());
  expect(result.mesh).toEqual(mesh); expect(result.originalPositions).toEqual(baseline);
  expect(result.mesh.positions).toBeInstanceOf(Float32Array); expect(result.mesh.indices).toBeInstanceOf(Uint32Array);
  expect(result.tapes).toEqual([{ z: 3, circumference: 123 }]);
});
it('rejects every-field corruption, schema extras, wrong versions, unsafe texture and array mismatch', async () => {
  const text = await saveProject(mesh, mesh.positions, []).text(); const value = JSON.parse(text);
  for (const mutate of [
    (x: any) => { x.version = 999; }, (x: any) => { x.patient = 'not allowed'; },
    (x: any) => { x.mesh.indices[0] = -1; }, (x: any) => { x.mesh.positions[0] = null; },
    (x: any) => { x.originalPositions.pop(); }, (x: any) => { x.mesh.colors.pop(); },
    (x: any) => { x.mesh.uvs = [0]; }, (x: any) => { x.mesh.textureUrl = 'https://evil.test/a.png'; },
    (x: any) => { x.tapes = [{ z: 0, circumference: -1 }]; }, (x: any) => { x.mesh.name = 42; },
  ]) { const x = structuredClone(value); mutate(x); expect(() => loadProject(JSON.stringify(x))).toThrow(); }
  expect(() => saveProject({ ...mesh, positions: new Float32Array([NaN, ...mesh.positions.slice(1)]) }, mesh.positions, [])).toThrow();
});
it('preserves validated provenance and labels synthetic STL, 3MF and CSV exports', async () => {
  const synthetic: MeshData = { ...mesh, source: 'synthetic' };
  expect(loadProject(await saveProject(synthetic, mesh.positions, []).text()).mesh.source).toBe('synthetic');
  const data = JSON.parse(await saveProject(synthetic, mesh.positions, []).text());
  data.mesh.source = 'clinical-approved'; expect(() => loadProject(JSON.stringify(data))).toThrow();
  const stl = new Uint8Array(await exportSTL(synthetic).arrayBuffer());
  expect(new TextDecoder().decode(stl.subarray(0, 80))).toContain('SYNTHETIC');
  expect(parseSTL(stl).source).toBe('imported');
  const solid = { name: synthetic.name, source: synthetic.source, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]) };
  const zip = unzipSync(new Uint8Array(await export3MF(solid).arrayBuffer()));
  expect(strFromU8(zip['3D/3dmodel.model'])).toContain('SYNTHETIC');
  const csv = await exportMeasurements([{ z: 0, circumference: 1, ap: 1, ml: 1, area: 1, segmentVolume: null, valid: true }], [], 'Dane syntetyczne').text();
  expect(csv).toContain('source'); expect(csv).toContain('Dane syntetyczne');
});
it('rejects raw fractional indices, pre-Float32 overflow and RGB outside range before rounding', async () => {
  const data = JSON.parse(await saveProject(mesh, mesh.positions, []).text());
  data.mesh.indices[0] = 0.5; expect(() => loadProject(JSON.stringify(data))).toThrow(/Indeks/);
  data.mesh.indices[0] = 0; data.mesh.colors[0] = -1e-50;
  expect(() => loadProject(JSON.stringify(data))).toThrow(/RGB/);
  data.mesh.colors[0] = 1; data.mesh.positions[0] = 1e100;
  expect(() => loadProject(JSON.stringify(data))).toThrow(/Float32/);
});
it('exports actual measurement rows, matched tape delta and missing invalid values as empty cells', async () => {
  const csv = await exportMeasurements([
    { z: 10, circumference: 100, ap: 30, ml: 40, area: 900, segmentVolume: null, valid: true },
    { z: 20, circumference: NaN, ap: NaN, ml: NaN, area: NaN, segmentVolume: null, valid: false },
  ], [{ z: 10, circumference: 98 }]).text();
  const lines = csv.trim().split(/\r?\n/).map(s => s.split(','));
  expect(lines).toHaveLength(3);
  expect(lines[1]).toEqual(['10', '100', '30', '40', '900', '', '98', '2', 'true']);
  expect(lines[2]).toEqual(['20', '', '', '', '', '', '', '', 'false']);
  expect(csv).not.toContain('NaN');
});
