import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FileProtectionDialog } from '../src/components/ProjectDialogs';

it('prefers encrypted manual save and explicitly warns about plaintext', () => {
  const html = renderToStaticMarkup(createElement(FileProtectionDialog, { mode: 'save', busy: false, error: '', onCancel() {}, onSubmit() {} }));
  expect(html).toContain('Szyfrowany');
  expect(html).toContain('minLength="12"');
  expect(html).toContain('type="password"');
  expect(html).toContain('Nieszyfrowany');
  expect(html).toContain('dane zdrowotne');
  expect(html).toContain('Anuluj');
});
