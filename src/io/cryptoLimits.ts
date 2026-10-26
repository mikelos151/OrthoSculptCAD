import { LIMITS } from './validation';
/** Base64 grows 4/3. Reserve covers fixed JSON metadata, salt, IV, tag and whitespace budget. */
export const MAX_PROTECTED_PROJECT_BYTES = LIMITS.bytes;
export const PROTECTED_ENVELOPE_RESERVE_BYTES = 4096;
export const GCM_TAG_BYTES = 16;
export const MAX_PROTECTED_CIPHERTEXT_BASE64_CHARS = Math.floor((MAX_PROTECTED_PROJECT_BYTES - PROTECTED_ENVELOPE_RESERVE_BYTES) / 4) * 4;
export const MAX_PROTECTED_CIPHERTEXT_BYTES = MAX_PROTECTED_CIPHERTEXT_BASE64_CHARS / 4 * 3;
export const MAX_PROTECTED_PLAINTEXT_BYTES = MAX_PROTECTED_CIPHERTEXT_BYTES - GCM_TAG_BYTES;
/** Fixed for envelope v1; never read a work factor supplied by a file. */
export const PBKDF2_ITERATIONS = 600_000;
export const PROTECTED_PROJECT_LIMITS = Object.freeze({ fileBytes: MAX_PROTECTED_PROJECT_BYTES, plaintextBytes: MAX_PROTECTED_PLAINTEXT_BYTES, ciphertextBytes: MAX_PROTECTED_CIPHERTEXT_BYTES, base64Chars: MAX_PROTECTED_CIPHERTEXT_BASE64_CHARS, envelopeReserveBytes: PROTECTED_ENVELOPE_RESERVE_BYTES, iterations: PBKDF2_ITERATIONS, saltBytes: 16, ivBytes: 12, tagBytes: GCM_TAG_BYTES, passwordMinChars: 12, passwordMaxChars: 1024 });
