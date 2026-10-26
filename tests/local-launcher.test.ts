import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('does not direct users to a supposedly bundled EXE when Node is absent', () => {
  const launcher = readFileSync(new URL('../Uruchom-OrthoSculpt.cmd', import.meta.url), 'utf8');
  expect(launcher).not.toContain('Uruchom dostarczony plik OrthoSculptCAD.exe');
  expect(launcher).toContain('Ta paczka nie zawiera pliku .exe.');
  expect(launcher).toContain('Node.js 22 lub nowszy');
});
