import earcut from 'earcut';
import type { ImportResult } from '../types';
import { embedImage, localName } from './assets';
import { assertMesh, count, finite, LIMITS, requireCondition as check } from './validation';

type Material = { color: number[]; texture?: string };
const decode = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);
function* lines(text: string): Generator<string[]> {
  check(text.length <= LIMITS.bytes, 'Limit pliku tekstowego.');
  let start = 0; let count = 0;
  while (start < text.length) {
    check(++count <= 4_000_000, 'Limit linii tekstu.');
    const newline = text.indexOf('\n', start); const end = newline < 0 ? text.length : newline;
    check(end - start <= 65536, 'Zbyt długa linia.');
    const line = text.slice(start, end).replace(/#.*$/, '').trim();
    if (line) yield line.split(/\s+/);
    start = end + 1;
  }
}
function materials(text: string): Map<string, Material> {
  const result = new Map<string, Material>(); let current: Material | undefined;
  for (const [op, ...args] of lines(text)) {
    if (!op) continue;
    if (op === 'newmtl') {
      const name = args.join(' '); check(name && name.length <= 200 && result.size < 128 && !result.has(name), 'Nieprawidłowy materiał.');
      current = { color: [1, 1, 1] }; result.set(name, current);
    } else {
      check(current, 'Deklaracja MTL bez newmtl.');
      if (op === 'map_Kd') { check(!current.texture && args.length === 1, 'Nieobsługiwane opcje lub wiele tekstur MTL.'); current.texture = localName(args[0]); }
      else if (op === 'Kd') { check(args.length === 3, 'Nieprawidłowy Kd.'); current.color = args.map(x => { const n = finite(Number(x)); check(n >= 0 && n <= 1, 'Kd poza 0–1.'); return n; }); }
      else if (op === 'd' || op === 'Tr') check(Number(args[0]) === (op === 'd' ? 1 : 0), 'Przezroczystość MTL nie jest obsługiwana.');
      else check(['Ka', 'Ks', 'Ke', 'Ns', 'Ni', 'illum'].includes(op), 'Nieobsługiwana mapa/właściwość MTL; import przerwany bez utraty tekstury.');
    }
  }
  return result;
}
export function parseOBJ(text: string, assets: ReadonlyMap<string, Uint8Array> = new Map(), name = 'OBJ'): ImportResult {
  check(assets.size <= LIMITS.files, 'Limit zasobów.'); let assetBytes = 0;
  for (const [key, value] of assets) { localName(key); assetBytes += value.length; check(assetBytes <= LIMITS.bytes, 'Limit zasobów.'); }
  const mats = new Map<string, Material>();
  for (const [op, ...args] of lines(text)) if (op === 'mtllib') {
    check(args.length === 1, 'Wybierz jeden plik biblioteki MTL bez spacji.'); const file = assets.get(localName(args[0])); check(file, 'Brak wskazanego lokalnego MTL.');
    for (const [key, mat] of materials(decode(file))) { check(!mats.has(key), 'Powielony materiał.'); mats.set(key, mat); }
  }
  const vertices: number[][] = []; const texcoords: number[][] = []; const normals: number[][] = [];
  const positions: number[] = []; const uvs: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const mapped = new Map<string, number>(); const used = new Set<Material>(); let current: Material = { color: [1, 1, 1] };
  let objects = 0; let anyUV = false; let missingUV = false;
  const resolve = (token: string, size: number) => {
    check(/^-?\d+$/.test(token), 'Nieprawidłowy indeks OBJ.'); const n = Number(token); check(n !== 0, 'Indeksy OBJ zaczynają się od 1.');
    return count(n > 0 ? n - 1 : size + n, size - 1, 'Indeks OBJ');
  };
  for (const [op, ...args] of lines(text)) {
    if (op === 'v') {
      check(vertices.length < LIMITS.vertices && [3, 6].includes(args.length), 'Limit lub nieobsługiwany format wierzchołka OBJ.');
      const row = args.map(v => finite(Number(v), 'OBJ')); if (row.length === 6) check(row.slice(3).every(v => v >= 0 && v <= 1), 'RGB OBJ poza 0–1.'); vertices.push(row);
    } else if (op === 'vt' || op === 'vn') {
      const target = op === 'vt' ? texcoords : normals; check(target.length < LIMITS.vertices && args.length === (op === 'vt' ? 2 : 3), 'Limit lub nieprawidłowe UV/normalna OBJ.');
      target.push(args.map(v => finite(Number(v), 'UV/normalna OBJ')));
    } else if (op === 'usemtl') { const mat = mats.get(args.join(' ')); check(mat, 'Brak materiału usemtl.'); current = mat; }
    else if (op === 'o') { check(++objects <= 32, 'Limit obiektów OBJ.'); }
    else if (op === 'f') {
      check(args.length >= 3 && args.length <= 10_000 && indices.length / 3 + args.length - 2 <= LIMITS.triangles, 'Limit/nieprawidłowa ściana OBJ.');
      used.add(current); const face: number[] = [];
      for (const arg of args) {
        const tokens = arg.split('/'); check(tokens.length <= 3, 'Nieprawidłowa referencja OBJ.');
        const vi = resolve(tokens[0], vertices.length); const ti = tokens[1] ? resolve(tokens[1], texcoords.length) : -1;
        if (tokens[2]) resolve(tokens[2], normals.length);
        if (ti < 0) missingUV = true; else anyUV = true;
        const key = `${vi}/${ti}/${[...mats.values()].indexOf(current)}`;
        let id = mapped.get(key);
        if (id === undefined) {
          check(positions.length / 3 < LIMITS.vertices, 'Limit wierzchołków po mapowaniu UV.');
          id = positions.length / 3; mapped.set(key, id); positions.push(...vertices[vi].slice(0, 3));
          uvs.push(...(ti < 0 ? [0, 0] : texcoords[ti]));
          const rgb = vertices[vi].length === 6 ? vertices[vi].slice(3) : [1, 1, 1]; colors.push(...rgb.map((v, i) => v * current.color[i]));
        }
        face.push(id);
      }
      if (face.length === 3) indices.push(...face);
      else {
        // Project a planar polygon to its dominant normal plane before ear clipping.
        const normal = [0, 0, 0];
        for (let i = 0; i < face.length; i++) {
          const a = face[i] * 3, b = face[(i + 1) % face.length] * 3;
          normal[0] += (positions[a + 1] - positions[b + 1]) * (positions[a + 2] + positions[b + 2]);
          normal[1] += (positions[a + 2] - positions[b + 2]) * (positions[a] + positions[b]);
          normal[2] += (positions[a] - positions[b]) * (positions[a + 1] + positions[b + 1]);
        }
        const length = Math.hypot(...normal); check(length > 1e-12, 'Zdegenerowany wielokąt OBJ.');
        const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))); const axes = [0, 1, 2].filter(i => i !== drop);
        const p0 = face[0] * 3;
        for (const id of face) check(Math.abs(normal.reduce((s, v, k) => s + v * (positions[id * 3 + k] - positions[p0 + k]), 0)) / length < 1e-4, 'Niepłaska ściana OBJ: trianguluj przed importem.');
        const cut = earcut(face.flatMap(id => axes.map(k => positions[id * 3 + k])));
        check(cut.length === (face.length - 2) * 3, 'Nie można triangulować ściany OBJ.');
        for (let t = 0; t < cut.length; t += 3) {
          const ids = [face[cut[t]], face[cut[t + 1]], face[cut[t + 2]]];
          const [a, b, c] = ids.map(id => id * 3);
          const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
          const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
          const dot = normal[0] * (u[1] * v[2] - u[2] * v[1]) + normal[1] * (u[2] * v[0] - u[0] * v[2]) + normal[2] * (u[0] * v[1] - u[1] * v[0]);
          check(Math.abs(dot) > 1e-16, 'Zdegenerowana triangulacja OBJ.');
          if (dot < 0) [ids[1], ids[2]] = [ids[2], ids[1]];
          indices.push(...ids);
        }
      }
    } else check(['', 'mtllib', 's', 'g'].includes(op), 'Nieobsługiwana geometria/polecenie OBJ.');
  }
  const textures = new Set([...used].map(m => m.texture).filter((t): t is string => !!t));
  check(textures.size <= 1, 'Wiele tekstur: import przerwany, aby nie utracić danych.');
  let textureUrl: string | undefined;
  if (textures.size) {
    check(!missingUV && [...used].every(m => !!m.texture && m.color.every(c => c === 1)) && colors.every(c => c === 1), 'Tekstura wymaga kompletnych UV i jednolitego materiału bez mieszania RGB.');
    const image = assets.get([...textures][0]); check(image, 'Brak wskazanej lokalnej tekstury PNG/JPEG.'); textureUrl = embedImage(image);
  }
  const mesh = { positions: new Float32Array(positions), indices: new Uint32Array(indices), uvs: anyUV && !missingUV ? new Float32Array(uvs) : undefined, colors: new Float32Array(colors), textureUrl, name, source: 'imported' as const };
  assertMesh(mesh);
  return { mesh, warnings: ['Jednostki OBJ nie są potwierdzone; potwierdź skalę w mm przed wytwarzaniem.', ...(objects > 1 ? ['Obiekty OBJ scalono w jedną siatkę.'] : [])] };
}
