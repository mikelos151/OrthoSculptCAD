import { expect, it, vi } from 'vitest';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { PROTECTED_PROJECT_LIMITS as limits } from '../src/io/cryptoLimits';
import { loadProject, saveProject } from '../src/io/project';
import { createWorkspace } from '../src/workspace';
const password = 'synthetic-test-phrase-only';
it('fails closed with the same error for wrong passwords, altered ciphertext, salt, IV and format/version', async () => {
  const { protectProject, unprotectProject } = await import('../src/io/protectedProject');
  const text = await (await protectProject(new Blob(['{"synthetic":true}']), password)).text();
  const generic = 'Nieprawidłowe hasło lub uszkodzony plik.';
  await expect(unprotectProject(text, 'different-synthetic-phrase')).rejects.toThrow(generic);
  for (const field of ['ciphertext', 'salt', 'iv']) {
    const envelope = JSON.parse(text); envelope[field] = (envelope[field][0] === 'A' ? 'B' : 'A') + envelope[field].slice(1);
    await expect(unprotectProject(JSON.stringify(envelope), password)).rejects.toThrow(generic);
  }
  for (const mutate of [
    (x: any) => { x.version = 2; }, (x: any) => { x.format = 'other'; }, (x: any) => { x.iterations = 1e12; },
    (x: any) => { x.salt = 'AA=='; }, (x: any) => { x.iv += '\n'; }, (x: any) => { x.ciphertext = 'AA=='; },
    (x: any) => { x.ciphertext = '!!!!'; }, (x: any) => { x.ciphertext = null; }, (x: any) => { delete x.salt; },
  ]) {
    const value = JSON.parse(text); mutate(value);
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    try { await expect(unprotectProject(JSON.stringify(value), password)).rejects.toThrow(generic); expect(spy).not.toHaveBeenCalled(); } finally { spy.mockRestore(); }
  }
  for (const value of ['{', 'null', '[]', '42']) await expect(unprotectProject(value, password)).rejects.toThrow(generic);
});
it('checks bounded passwords and blob size before reading bytes or running KDF', async () => {
  const { protectProject, unprotectProject } = await import('../src/io/protectedProject');
  const blob = new Blob(['synthetic']); const read = vi.spyOn(blob, 'arrayBuffer'); const derive = vi.spyOn(crypto.subtle, 'deriveKey');
  try {
    for (const value of ['', 'x'.repeat(11), 'x'.repeat(1025), null]) await expect(protectProject(blob, value as any)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(derive).not.toHaveBeenCalled();
    Object.defineProperty(blob, 'size', { value: 128 * 1024 * 1024 });
    await expect(protectProject(blob, password)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(derive).not.toHaveBeenCalled();
    await expect(unprotectProject('{}', 'short')).rejects.toThrow('Nieprawidłowe hasło lub uszkodzony plik.');
  } finally { read.mockRestore(); derive.mockRestore(); }
});
it('matches independent Node crypto, exact PBKDF2 work factor, AES256GCM tag and version-bound AAD across base64 chunks', async () => {
  const { protectProject, unprotectProject } = await import('../src/io/protectedProject');
  const plaintext = JSON.stringify({ synthetic: 'Zażółć🦿'.repeat(10_000) });
  const text = await (await protectProject(new Blob([plaintext]), password)).text(); const row = JSON.parse(text);
  const ciphertext = Buffer.from(row.ciphertext, 'base64'), salt = Buffer.from(row.salt, 'base64'), iv = Buffer.from(row.iv, 'base64');
  expect(salt.byteLength).toBe(16); expect(iv.byteLength).toBe(12); expect(limits.iterations).toBe(600_000);
  const key = pbkdf2Sync(password, salt, 600_000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from('OrthoSculptProtectedProject:1:PBKDF2-SHA256:AES-256-GCM'));
  decipher.setAuthTag(ciphertext.subarray(-16));
  expect(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString('utf8')).toBe(plaintext);
  expect(await unprotectProject(text, password)).toBe(plaintext);
});
it('derives compatible limits and rejects oversized text/ciphertext before KDF or large base64 decode', async () => {
  const { protectProject, unprotectProject, isProtectedProject } = await import('../src/io/protectedProject');
  expect(limits.fileBytes).toBe(128 * 1024 * 1024);
  expect(limits.plaintextBytes).toBeLessThan(96 * 1024 * 1024);
  expect(4 * Math.ceil((limits.plaintextBytes + 16) / 3) + limits.envelopeReserveBytes).toBeLessThanOrEqual(limits.fileBytes);
  const blob = new Blob(['synthetic']); Object.defineProperty(blob, 'size', { value: limits.plaintextBytes + 1 });
  const read = vi.spyOn(blob, 'arrayBuffer'), derive = vi.spyOn(crypto.subtle, 'deriveKey'), decode = vi.spyOn(globalThis, 'atob');
  try {
    await expect(protectProject(blob, password)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
    const tooLarge = ' '.repeat(limits.fileBytes + 1);
    await expect(unprotectProject(tooLarge, password)).rejects.toThrow(); expect(isProtectedProject(tooLarge)).toBe(false);
    const oversizedEnvelope = JSON.stringify({ format: 'OrthoSculptProtectedProject', version: 1, salt: btoa('s'.repeat(16)), iv: btoa('i'.repeat(12)), ciphertext: 'A'.repeat(limits.base64Chars + 4) });
    expect(oversizedEnvelope.length).toBeLessThan(limits.fileBytes);
    await expect(unprotectProject(oversizedEnvelope, password)).rejects.toThrow();
    expect(derive).not.toHaveBeenCalled(); expect(decode.mock.calls.every(call => String(call[0]).length <= 24)).toBe(true);
  } finally { read.mockRestore(); derive.mockRestore(); decode.mockRestore(); }
}, 15_000);
it('encrypts a real v2 project with randomized authenticated WebCrypto encryption and roundtrips it', async () => {
  const { protectProject, unprotectProject, isProtectedProject } = await import('../src/io/protectedProject');
  const mesh = { name: 'SYNTHETIC-TT-SECRET-MARKER', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
  const project = saveProject(mesh, mesh.positions, [], createWorkspace({ caseCode: 'SECRET_CASE_MARKER' }));
  const encrypted = await protectProject(project, password), text = await encrypted.text();
  expect(isProtectedProject(text)).toBe(true); expect(isProtectedProject(await project.text())).toBe(false);
  for (const marker of ['SYNTHETIC-TT-SECRET-MARKER', 'SECRET_CASE_MARKER', 'positions', password]) expect(text).not.toContain(marker);
  const again = await (await protectProject(project, password)).text();
  expect(JSON.parse(again).salt).not.toBe(JSON.parse(text).salt); expect(JSON.parse(again).iv).not.toBe(JSON.parse(text).iv);
  const plaintext = await unprotectProject(text, password); expect(plaintext).toBe(await project.text());
  expect(loadProject(plaintext).mesh).toEqual(mesh);
});
