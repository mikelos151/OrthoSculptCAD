import { PROTECTED_PROJECT_LIMITS as LIMITS, PBKDF2_ITERATIONS } from './cryptoLimits';
import { requireCondition as check } from './validation';
const FORMAT = 'OrthoSculptProtectedProject';
const VERSION = 1;
// OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256 >= 600,000.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const ITERATIONS = PBKDF2_ITERATIONS;
const FAILURE = 'Nieprawidłowe hasło lub uszkodzony plik.';
function passwordCheck(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length >= LIMITS.passwordMinChars && value.length <= LIMITS.passwordMaxChars && !/[\ud800-\udfff]/u.test(value), 'Hasło musi zawierać 12–1024 znaków poprawnego Unicode.');
}
function boundedText(text: unknown): asserts text is string {
  check(typeof text === 'string' && text.length > 0 && text.length <= LIMITS.fileBytes && new Blob([text]).size <= LIMITS.fileBytes, FAILURE);
}
function base64(value: unknown, minBytes: number, maxBytes: number): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(maxBytes / 3) * 4 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), FAILURE);
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = value.length / 4 * 3 - padding;
  check(bytes >= minBytes && bytes <= maxBytes, FAILURE);
  // Check canonical pad bits without decoding/allocating the entire ciphertext.
  const last = value.slice(-4); check(encode(decode(last)) === last, FAILURE);
}
function envelope(text: string): { salt: string; iv: string; ciphertext: string } {
  boundedText(text);
  const value: unknown = JSON.parse(text);
  check(value !== null && typeof value === 'object' && !Array.isArray(value), FAILURE);
  const row = value as Record<string, unknown>;
  const keys = ['format', 'version', 'salt', 'iv', 'ciphertext'];
  check(Object.keys(row).length === keys.length && keys.every(k => Object.hasOwn(row, k)) && row.format === FORMAT && row.version === VERSION, FAILURE);
  base64(row.salt, LIMITS.saltBytes, LIMITS.saltBytes); base64(row.iv, LIMITS.ivBytes, LIMITS.ivBytes);
  base64(row.ciphertext, LIMITS.tagBytes + 1, LIMITS.ciphertextBytes);
  return { salt: row.salt, iv: row.iv, ciphertext: row.ciphertext };
}
const aad = new TextEncoder().encode(`${FORMAT}:${VERSION}:PBKDF2-SHA256:AES-256-GCM`);
function encode(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 24_576) chunks.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24_576))));
  return chunks.join('');
}
function decode(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function key(password: string, salt: Uint8Array<ArrayBuffer>, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
export function isProtectedProject(text: string): boolean {
  // Routing hint only, not validation/authentication: damaged marked files still go to the protected loader.
  try { boundedText(text); return JSON.parse(text)?.format === FORMAT; } catch { return false; }
}
export async function protectProject(blob: Blob, password: string): Promise<Blob> {
  passwordCheck(password);
  check(blob instanceof Blob && blob.size > 0 && blob.size <= LIMITS.plaintextBytes, 'Limit rozmiaru szyfrowanego projektu.');
  const plaintext = await blob.arrayBuffer();
  check(plaintext.byteLength === blob.size && plaintext.byteLength <= LIMITS.plaintextBytes, 'Niezgodny rozmiar danych projektu.');
  const salt = crypto.getRandomValues(new Uint8Array(LIMITS.saltBytes)), iv = crypto.getRandomValues(new Uint8Array(LIMITS.ivBytes));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, await key(password, salt, 'encrypt'), plaintext);
  const result = new Blob([JSON.stringify({ format: FORMAT, version: VERSION, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) })], { type: 'application/json' });
  check(result.size <= LIMITS.fileBytes, 'Limit rozmiaru szyfrowanego projektu.'); return result;
}
export async function unprotectProject(text: string, password: string): Promise<string> {
  try {
    passwordCheck(password);
    // Entire envelope, encoded sizes and canonical base64 checked before large decode or KDF.
    const row = envelope(text), salt = decode(row.salt), iv = decode(row.iv), ciphertext = decode(row.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, await key(password, salt, 'decrypt'), ciphertext);
    check(plaintext.byteLength > 0 && plaintext.byteLength <= LIMITS.plaintextBytes, FAILURE);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch { throw new Error(FAILURE); }
}
