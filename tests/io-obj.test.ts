import { expect, it } from 'vitest';
import { importFiles, parseOBJ } from '../src/io/index';
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII='), c => c.charCodeAt(0));
const obj = 'mtllib scan.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl scan\nf 1/1 2/2 3/3 4/4\n';
const assets = () => new Map([['scan.mtl', new TextEncoder().encode('newmtl scan\nKd 1 1 1\nmap_Kd scan.png')], ['scan.png', png]]);
it('imports OBJ + MTL + provided PNG only, preserves UV and triangulates quads', async () => {
  const result = parseOBJ(obj, assets());
  expect(result.mesh.indices.length).toBe(6);
  expect(result.mesh.uvs?.length).toBe(8);
  expect(Array.from(result.mesh.uvs!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  expect(result.mesh.textureUrl).toMatch(/^data:image\/png;base64,/);
  const files = [new File([obj], 'scan.obj'), new File([assets().get('scan.mtl')!], 'scan.mtl'), new File([png], 'scan.png')];
  expect((await importFiles(files)).mesh.textureUrl).toBe(result.mesh.textureUrl);
});
it.each(['https://evil.test/a.png', '../scan.png', '/scan.png', 'C:\\scan.png', '%2e%2e/scan.png', '//evil/a.png'])('rejects unsafe MTL image reference %s', ref => {
  const a = assets(); a.set('scan.mtl', new TextEncoder().encode(`newmtl scan\nmap_Kd ${ref}`));
  expect(() => parseOBJ(obj, a)).toThrow();
});
it('rejects missing assets, missing UV and multiple textures rather than silently discarding', () => {
  expect(() => parseOBJ(obj, new Map())).toThrow();
  expect(() => parseOBJ(obj.replace('1/1 2/2 3/3 4/4', '1 2 3 4'), assets())).toThrow();
  const a = assets(); a.set('scan.mtl', new TextEncoder().encode('newmtl scan\nmap_Kd scan.png\nnewmtl b\nmap_Kd other.png'));
  a.set('other.png', png);
  expect(() => parseOBJ(obj + 'usemtl b\nf 1/1 2/2 3/3', a)).toThrow(/tekstur/i);
});
it('preserves genuine JPEG asset bytes and normalized UV without remote loading', () => {
  // Real 1px red JPEG encoded by Windows System.Drawing; no network fixture.
  const base64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9Uz/2Q==';
  const a = new Map([['scan.mtl', new TextEncoder().encode('newmtl scan\nmap_Kd scan.jpg')], ['scan.jpg', Uint8Array.from(atob(base64), c => c.charCodeAt(0))]]);
  const result = parseOBJ(obj, a);
  expect(result.mesh.textureUrl).toBe('data:image/jpeg;base64,' + base64);
  expect(Array.from(result.mesh.uvs!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
});
it('preserves clockwise OBJ polygon winding when triangulating negative indices', () => {
  const result = parseOBJ('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -1 -2 -3 -4');
  const p = result.mesh.positions; const ix = result.mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(i => i * 3);
    const crossZ = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
    expect(crossZ).toBeLessThan(0);
  }
});
it('bounds file counts, declared bytes and rejects multiple mesh files', async () => {
  await expect(importFiles(Array.from({ length: 17 }, () => new File(['x'], 'a.obj')))).rejects.toThrow();
  await expect(importFiles([new File([obj], 'a.obj'), new File([obj], 'b.obj')])).rejects.toThrow();
  await expect(importFiles([{ name: 'a.obj', size: 999999999, arrayBuffer: () => { throw new Error('must not allocate'); } } as unknown as File])).rejects.toThrow(/limit/i);
});
