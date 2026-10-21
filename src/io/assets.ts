import { LIMITS, requireCondition as check } from './validation';

/** Deliberately basename-only: no URL resolution, decoding, directory traversal or network. */
export function localName(value: string): string {
  check(value.length > 0 && value.length <= 200 && !/[\\/:%?#\x00-\x1f]/.test(value) && value !== '.' && value !== '..', 'Niedozwolona ścieżka zasobu: wymagany lokalny plik bez katalogu.');
  return value;
}
export function embedImage(bytes: Uint8Array): string {
  check(bytes.length > 24 && bytes.length <= LIMITS.textureBytes, 'Limit lub nieprawidłowa tekstura.');
  let type: string; let width = 0; let height = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) {
    check(String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR', 'Nieprawidłowy PNG.');
    width = view.getUint32(16); height = view.getUint32(20); type = 'png';
  } else {
    check(bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217, 'Obsługiwane są wyłącznie PNG/JPEG rozpoznane po zawartości.');
    type = 'jpeg'; let o = 2;
    while (o + 4 < bytes.length) {
      check(bytes[o++] === 255, 'Nieprawidłowy JPEG.');
      while (bytes[o] === 255) o++;
      const marker = bytes[o++]; if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(o); check(length >= 2 && o + length <= bytes.length, 'Ucięty JPEG.');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) { check(length >= 8, 'Nieprawidłowy SOF JPEG.'); height = view.getUint16(o + 3); width = view.getUint16(o + 5); break; }
      o += length;
    }
  }
  check(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 32_000_000, 'Limit wymiarów tekstury (8192 / 32 MP).');
  let raw = ''; for (let o = 0; o < bytes.length; o += 8192) raw += String.fromCharCode(...bytes.subarray(o, o + 8192));
  return `data:image/${type};base64,${btoa(raw)}`;
}
