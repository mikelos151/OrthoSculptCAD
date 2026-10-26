import { expect, it } from 'vitest';
import { parsePLY } from '../src/io/ply';
import { parseOBJ } from '../src/io/obj';
import { importFiles } from '../src/io/index';
import { loadProject, saveProject } from '../src/io/project';

const encode = (text: string) => new TextEncoder().encode(text);
function faceHeader(format = 'ascii', faces = 2, vertexProperties = '', faceProperties = 'property uchar red\nproperty uchar green\nproperty uchar blue\n') {
  return `ply\nformat ${format} 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\n${vertexProperties}element face ${faces}\nproperty list uchar int vertex_indices\n${faceProperties}end_header\n`;
}

it('rejects conflicting PLY face RGB with vertex export instructions rather than splitting shared topology', () => {
  const bytes = encode(faceHeader() + '0 0 0\n1 0 0\n1 1 0\n0 1 0\n3 0 1 2 255 0 0\n3 0 2 3 0 0 255\n');
  expect(() => parsePLY(bytes)).toThrow(/RGB.*(?:vertex|wierzchołk)/i);
});

it.each(['ascii', 'binary_little_endian', 'binary_big_endian'])('rejects ambiguous/unsupported RGB declarations in %s before reading data', format => {
  const rgb = 'property uchar red\nproperty uchar green\nproperty uchar blue\n';
  for (const [vertexProps, faceProps] of [
    [rgb, rgb],
    ['', 'property uchar red\n'],
    ['', 'property list uchar uchar red\nproperty uchar green\nproperty uchar blue\n'],
    ['', rgb + 'property uchar alpha\n'],
  ]) {
    expect(() => parsePLY(encode(faceHeader(format, 2, vertexProps, faceProps)))).toThrow(/RGB|alpha/i);
  }
});

it('bounds original face RGB vertex/triangle counts before allocation without a fictitious corner expansion', () => {
  expect(() => parsePLY(encode(faceHeader('ascii', 2_000_001)))).toThrow(/limit/i);
  expect(() => parsePLY(encode(faceHeader().replace('element vertex 4', 'element vertex 1000001')))).toThrow(/limit/i);
  // Original topology is retained: there is no longer a 333,333-face split cap.
  for (const faces of [333_333, 333_334, 2_000_000])
    expect(() => parsePLY(encode(faceHeader('ascii', faces)))).toThrow(/Rozmiar PLY/i);
});

const objVertices = 'v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 1 1 0 0 0 1\nv 0 1 0 1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n';
it.each(['f 1/1 2/2 3/3\nf 1 3 4\n', 'f 1/1 2 3/3\n'])('rejects partial OBJ UV rather than silently dropping all source UV (%s)', faces => {
  expect(() => parseOBJ(objVertices + faces)).toThrow(/UV.*komplet|komplet.*UV/i);
});

it('rejects Float32 overflow in an unused PLY vertex with face RGB', () => {
  const text = faceHeader('ascii', 1) + '0 0 0\n1 0 0\n1 1 0\n1e100 1 0\n3 0 1 2 255 0 0\n';
  expect(() => parsePLY(encode(text))).toThrow(/skończ|finite|Float32/i);
});

it.each(['ascii', 'binary_little_endian', 'binary_big_endian'])('retains face RGB for %s and every supported normalization family through import/project/reload', async format => {
  for (const [type, maximum, size] of [['uchar', 255, 1], ['ushort', 65535, 2], ['float', 1, 4]] as const) {
    const header = faceHeader(format, 2, '', ['red', 'green', 'blue'].map(name => `property ${type} ${name}\n`).join(''));
    const vertices = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    const faces = [[0, 1, 2, maximum, 0, 0], [0, 2, 3, maximum, 0, 0]];
    let bytes: Uint8Array<ArrayBuffer>;
    if (format === 'ascii') bytes = encode(header + vertices.map(row => row.join(' ')).join('\n') + '\n' + faces.map(row => '3 ' + row.join(' ')).join('\n'));
    else {
      const prefix = encode(header);
      bytes = new Uint8Array(prefix.length + 48 + 2 * (13 + 3 * size));
      bytes.set(prefix);
      const view = new DataView(bytes.buffer), little = format === 'binary_little_endian';
      let cursor = prefix.length;
      for (const row of vertices) for (const value of row) { view.setFloat32(cursor, value, little); cursor += 4; }
      for (const row of faces) {
        bytes[cursor++] = 3;
        for (const value of row.slice(0, 3)) { view.setInt32(cursor, value, little); cursor += 4; }
        for (const value of row.slice(3)) {
          if (size === 1) view.setUint8(cursor, value);
          else if (size === 2) view.setUint16(cursor, value, little);
          else view.setFloat32(cursor, value, little);
          cursor += size;
        }
      }
    }
    const mesh = (await importFiles([new File([bytes], 'face-rgb.ply')])).mesh;
    expect(Array.from(mesh.colors ?? [])).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
    expect(Array.from(mesh.positions)).toEqual(vertices.flat());
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    const loaded = loadProject(await saveProject(mesh, mesh.positions.slice(), []).text());
    expect(loaded.mesh.colors).toEqual(mesh.colors);
    expect(loaded.mesh.positions).toEqual(mesh.positions);
    expect(loaded.mesh.indices).toEqual(mesh.indices);
    // A colour seam must reject in every supported encoding/type, rather than
    // falling back to the old unwelded corner representation.
    let conflicting: Uint8Array<ArrayBuffer>;
    if (format === 'ascii') {
      const differentFaces = [faces[0], [0, 2, 3, 0, 0, maximum]];
      conflicting = encode(header + vertices.map(row => row.join(' ')).join('\n') + '\n' + differentFaces.map(row => '3 ' + row.join(' ')).join('\n'));
    } else {
      conflicting = bytes.slice();
      const view = new DataView(conflicting.buffer), little = format === 'binary_little_endian';
      let cursor = conflicting.length - 3 * size;
      for (const value of [0, 0, maximum]) {
        if (size === 1) view.setUint8(cursor, value);
        else if (size === 2) view.setUint16(cursor, value, little);
        else view.setFloat32(cursor, value, little);
        cursor += size;
      }
    }
    await expect(importFiles([new File([conflicting], 'face-rgb-seam.ply')])).rejects.toThrow(/RGB.*(?:vertex|wierzchołk)/i);
  }
});

it('preserves OBJ RGB and complete UV seams through the public import/project/reload path', async () => {
  const text = objVertices + 'f 1/1 2/2 3/3\nf 1/4 3/3 4/1\n';
  const mesh = (await importFiles([new File([text], 'rgb-uv.obj')])).mesh;
  expect(Array.from(mesh.colors!)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
  expect(Array.from(mesh.uvs!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 0, 0]);
  const loaded = loadProject(await saveProject(mesh, mesh.positions.slice(), []).text());
  expect(loaded.mesh.colors).toEqual(mesh.colors);
  expect(loaded.mesh.uvs).toEqual(mesh.uvs);
  expect(loaded.mesh.indices).toEqual(mesh.indices);
});

it('preserves source scalar vertex RGB through PLY import/project/reload without face splitting', async () => {
  const rgb = 'property uchar red\nproperty uchar green\nproperty uchar blue\n';
  const text = faceHeader('ascii', 1, rgb, '') + '0 0 0 255 0 0\n1 0 0 0 255 0\n1 1 0 0 0 255\n0 1 0 255 255 255\n3 0 1 2\n';
  const mesh = (await importFiles([new File([text], 'vertex-rgb.ply')])).mesh;
  expect(mesh.positions.length).toBe(12);
  expect(Array.from(mesh.colors!)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
  const loaded = loadProject(await saveProject(mesh, mesh.positions.slice(), []).text());
  expect(loaded.mesh.colors).toEqual(mesh.colors);
});

it('preserves a complete local OBJ/MTL/PNG appearance through project reload', async () => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII='), c => c.charCodeAt(0));
  const text = 'mtllib scan.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl scan\nf 1/1 2/2 3/3\n';
  const files = [new File([text], 'scan.obj'), new File(['newmtl scan\nKd 1 1 1\nmap_Kd scan.png\n'], 'scan.mtl'), new File([png], 'scan.png')];
  const mesh = (await importFiles(files)).mesh;
  expect(mesh.textureUrl).toMatch(/^data:image\/png;base64,/);
  expect(Array.from(mesh.uvs!)).toEqual([0, 0, 1, 0, 0, 1]);
  const loaded = loadProject(await saveProject(mesh, mesh.positions.slice(), []).text());
  expect(loaded.mesh.textureUrl).toEqual(mesh.textureUrl);
  expect(loaded.mesh.uvs).toEqual(mesh.uvs);
});


