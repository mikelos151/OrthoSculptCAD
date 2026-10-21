import type { ImportResult } from '../types';
import { parsePLY } from './ply';
import { parseSTL } from './stl';
import { parseOBJ } from './obj';
import { localName } from './assets';
import { LIMITS, requireCondition as check } from './validation';
export { parsePLY, parseSTL, parseOBJ };
export { saveProject, loadProject } from './project';
export { exportMeasurements } from './csv';

export function downloadBlob(blob: Blob, filename: string): void {
  check(blob instanceof Blob, 'Wymagany Blob do pobrania.'); localName(filename);
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  check(Array.isArray(files) && files.length > 0 && files.length <= LIMITS.files, 'Limit 16 plików importu.');
  const names = new Set<string>(); let total = 0;
  for (const file of files) {
    localName(file.name); check(!names.has(file.name), 'Powielona nazwa pliku.'); names.add(file.name);
    check(Number.isSafeInteger(file.size) && file.size > 0 && file.size <= LIMITS.bytes, 'Limit 128 MiB / pusty plik.');
    total += file.size; check(total <= LIMITS.bytes, 'Limit 128 MiB łącznego importu.');
    check(/\.(stl|ply|obj|mtl|png|jpe?g)$/i.test(file.name), 'Nieobsługiwany typ pliku.');
  }
  const meshes = files.filter(f => /\.(stl|ply|obj)$/i.test(f.name)); check(meshes.length === 1, 'Wybierz dokładnie jeden plik siatki.');
  const file = meshes[0]; const assets = new Map<string, Uint8Array>();
  for (const f of files) { const b = new Uint8Array(await f.arrayBuffer()); check(b.length === f.size, 'Rozmiar pliku zmienił się podczas odczytu.'); assets.set(f.name, b); }
  const bytes = assets.get(file.name)!; const name = file.name.slice(0, 200);
  if (/\.obj$/i.test(name)) return parseOBJ(new TextDecoder('utf-8', { fatal: true }).decode(bytes), assets, name);
  check(files.length === 1, 'Zasoby dodatkowe obsługiwane są tylko dla OBJ.');
  return { mesh: /\.ply$/i.test(name) ? parsePLY(bytes, name) : parseSTL(bytes, name), warnings: ['Jednostki pliku nie są potwierdzone; potwierdź skalę w mm przed wytwarzaniem.'] };
}
