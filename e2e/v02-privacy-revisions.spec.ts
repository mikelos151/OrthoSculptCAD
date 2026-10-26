import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidence, importRGB, observePrivacy, project, replaceSyntheticProject, savePlainDownload, undoCount } from './helpers';

// PUBLIC test vectors, not user credentials, secrets or patient identifiers.
const PUBLIC_TEST_PHRASE = 'PUBLIC-synthetic-E2E-only-2026';
const PUBLIC_WRONG_PHRASE = 'PUBLIC-wrong-synthetic-phrase';

async function openProtected(page: Page, buffer: Buffer, replace: boolean) {
  await page.getByLabel('Wybierz zapisany projekt', { exact: true }).setInputFiles({ name: 'PUBLIC-SYNTHETIC.protected.oscad.json', mimeType: 'application/json', buffer });
  if (replace) await replaceSyntheticProject(page);
  const dialog = page.getByRole('dialog', { name: 'Otwórz szyfrowany projekt', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

function independentGeometryHash(mesh: { positions: number[]; indices: number[] }) {
  const data = Buffer.alloc(8 + 4 * (mesh.positions.length + mesh.indices.length));
  data.writeUInt32LE(mesh.positions.length / 3, 0); data.writeUInt32LE(mesh.indices.length / 3, 4);
  let offset = 8;
  for (const value of mesh.positions) { data.writeFloatLE(value, offset); offset += 4; }
  for (const value of mesh.indices) { data.writeUInt32LE(value, offset); offset += 4; }
  return createHash('sha256').update(data).digest('hex');
}

test('encrypted browser download authenticates independently, wrong password and tamper retain the previous mesh, correct password restores RGB, baseline and metadata', async ({ page }, info) => {
  test.setTimeout(150000);
  const privacy = observePrivacy(page);
  await importRGB(page);
  await page.getByLabel('Kod przypadku — pseudonim').fill('PUBLIC_RGB_ROUNDTRIP');
  await page.getByLabel('Strona kończyny').selectOption('left');
  await page.getByText('Kontekst techniczny (opcjonalny)', { exact: true }).click();
  await page.getByLabel('Liner podczas skanu').selectOption('with-liner');
  await page.getByLabel('Kontekst skanu', { exact: true }).fill('PUBLIC synthetic engineering fixture');
  await page.getByLabel('Uwaga techniczna — bez danych osobowych').fill('PUBLIC RGB encryption acceptance; no patient data');
  await page.getByRole('button', { name: 'Zastosuj dane przypadku' }).click();
  const expected = await project(page);
  await page.getByRole('button', { name: 'Zapisz projekt', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Zapisz kopię projektu', exact: true });
  await expect(save.getByLabel('Ochrona pliku')).toHaveValue('encrypted');
  await save.getByLabel('Hasło — minimum 12 znaków').fill(PUBLIC_TEST_PHRASE);
  await save.getByLabel('Powtórz hasło').fill(PUBLIC_TEST_PHRASE);
  const pending = page.waitForEvent('download');
  await save.getByRole('button', { name: 'Pobierz szyfrowaną kopię' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`PUBLIC_RGB_ROUNDTRIP-r${expected.workspace.revision}.protected.oscad.json`);
  const bytes = await readFile((await download.path())!);
  const envelope = JSON.parse(bytes.toString('utf8'));
  expect(envelope.format).toBe('OrthoSculptProtectedProject');
  expect(bytes.toString('utf8')).not.toContain('positions');
  expect(bytes.toString('utf8')).not.toContain('PUBLIC RGB encryption acceptance');
  const key = pbkdf2Sync(PUBLIC_TEST_PHRASE, Buffer.from(envelope.salt, 'base64'), 600000, 32, 'sha256');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from('OrthoSculptProtectedProject:1:PBKDF2-SHA256:AES-256-GCM'));
  decipher.setAuthTag(ciphertext.subarray(-16));
  const independentlyDecrypted = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  expect(JSON.parse(independentlyDecrypted.toString('utf8'))).toEqual(expected);

  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Wczytaj powierzchnię TT', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Otwórz przykład', exact: true }).click();
  await page.getByRole('button', { name: 'Potwierdź i przelicz na mm' }).click();
  const sentinel = await project(page);
  expect(sentinel.mesh.positions).not.toEqual(expected.mesh.positions);
  let open = await openProtected(page, bytes, true);
  await open.getByLabel('Hasło — minimum 12 znaków').fill(PUBLIC_WRONG_PHRASE);
  await open.getByRole('button', { name: 'Odszyfruj i otwórz' }).click();
  await expect(open.getByRole('alert')).toContainText('Poprzedni projekt pozostał bez zmian');
  await evidence(page, info, 'encrypted-wrong-password.png');
  await open.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await project(page)).toEqual(sentinel);

  const tampered = structuredClone(envelope);
  const changed = Buffer.from(tampered.ciphertext, 'base64'); changed[0] ^= 1;
  tampered.ciphertext = changed.toString('base64');
  open = await openProtected(page, Buffer.from(JSON.stringify(tampered)), true);
  await open.getByLabel('Hasło — minimum 12 znaków').fill(PUBLIC_TEST_PHRASE);
  await open.getByRole('button', { name: 'Odszyfruj i otwórz' }).click();
  await expect(open.getByRole('alert')).toContainText('Poprzedni projekt pozostał bez zmian');
  await open.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await project(page)).toEqual(sentinel);

  open = await openProtected(page, bytes, true);
  await open.getByLabel('Hasło — minimum 12 znaków').fill(PUBLIC_TEST_PHRASE);
  await open.getByRole('button', { name: 'Odszyfruj i otwórz' }).click();
  await expect(open).not.toBeVisible();
  await expect(page.getByText(/Odszyfrowano projekt lokalnie/)).toBeVisible();
  const restored = await project(page);
  expect(restored).toEqual(expected);
  expect(restored.mesh.source).toBe('imported');
  expect(restored.mesh.colors.length).toBe(restored.mesh.positions.length);
  await evidence(page, info, 'encrypted-restored-rgb.png');
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('unsaved replacement supports Stay and Escape after copy download, and real beforeunload dismiss preserves work', async ({ page }, info) => {
  const privacy = observePrivacy(page);
  await importRGB(page);
  const before = await project(page);
  const oldURL = page.url();
  await expect(page.locator('.working-status')).toContainText('Kopia rewizji pobrana');
  await page.getByRole('button', { name: 'Nowy projekt', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Ochrona bieżącej pracy', exact: true });
  await expect(guard).toBeVisible();
  await evidence(page, info, 'unsaved-replacement-guard.png');
  await guard.getByRole('button', { name: 'Zostań w projekcie' }).click();
  expect(await project(page)).toEqual(before);
  await page.getByRole('button', { name: 'Nowy projekt', exact: true }).click();
  await expect(guard).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guard).not.toBeVisible();
  expect(await project(page)).toEqual(before);
  const unload = page.waitForEvent('dialog');
  const navigation = page.goto('about:blank').catch(error => String(error));
  const native = await unload;
  expect(native.type()).toBe('beforeunload');
  await native.dismiss(); await navigation;
  expect(page.url()).toBe(oldURL);
  expect(await project(page)).toEqual(before);
  // Explicit replacement is authorized only for this synthetic fixture.
  await page.getByRole('button', { name: 'Nowy projekt', exact: true }).click();
  await replaceSyntheticProject(page);
  await expect(page.getByRole('heading', { name: 'Wczytaj powierzchnię TT', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz projekt', exact: true })).toBeDisabled();
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]);
});

test('v1 migration discloses unknown history, saved left registration is invalidated by right metadata without reflection', async ({ page }, info) => {
  const privacy = observePrivacy(page);
  await importRGB(page);
  const v1 = await project(page);
  delete v1.workspace; v1.version = 1;
  await page.getByLabel('Wybierz zapisany projekt', { exact: true }).setInputFiles({ name: 'PUBLIC-SYNTHETIC-v1.oscad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
  await replaceSyntheticProject(page);
  await expect(page.locator('.notification')).toContainText('Historia wcześniejsza jest nieznana');
  const migrated = await project(page);
  expect(migrated.version).toBe(2);
  expect(migrated.workspace.registration).toBeNull();
  expect(migrated.workspace.events.at(-1).kind).toBe('migration');
  expect(migrated.mesh).toEqual(v1.mesh); expect(migrated.originalPositions).toEqual(v1.originalPositions);
  await page.locator('.step-button').nth(3).click();
  expect(await undoCount(page)).toBe(0);
  await page.locator('.step-button').nth(0).click();
  // Author a valid PUBLIC saved registration fixture; this tests invalidation, not registration solving.
  const registered = structuredClone(migrated), w = registered.workspace;
  w.caseDetails.side = 'left';
  w.events.push({ revision: ++w.revision, at: w.updatedAt, kind: 'register', label: 'PUBLIC saved registration fixture', parameters: { side: 'left', flexionDegrees: 0 } });
  w.registration = { side: 'left', landmarks: [[0, -20, 100], [-20, 0, 90], [0, 0, 0]], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flexionDegrees: 0, sourceRevision: w.revision - 1 };
  await page.getByLabel('Wybierz zapisany projekt', { exact: true }).setInputFiles({ name: 'PUBLIC-SYNTHETIC-registered.oscad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(registered)) });
  await expect(page.locator('.notification')).toContainText('Wczytano projekt i dziennik');
  expect((await project(page)).workspace.registration).toEqual(w.registration);
  await page.locator('.step-button').nth(1).click();
  await expect(page.getByText('Rejestracja potwierdzona dla strony: lewa.', { exact: true })).toBeVisible();
  await page.locator('.step-button').nth(0).click();
  await page.getByLabel('Strona kończyny').selectOption('right');
  await page.getByRole('button', { name: 'Zastosuj dane przypadku' }).click();
  await expect(page.locator('.notification')).toContainText('geometria nie została odbita');
  const right = await project(page);
  expect(right.workspace.caseDetails.side).toBe('right'); expect(right.workspace.registration).toBeNull();
  expect(right.workspace.revision).toBe(w.revision + 1);
  expect(right.mesh).toEqual(registered.mesh); expect(right.originalPositions).toEqual(registered.originalPositions);
  await evidence(page, info, 'metadata-side-no-reflection.png');
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]);
});

test('downloaded review report has exact current geometry hash and revision, absent tape evidence and restrictive CSP with zero external requests', async ({ page, context }, info) => {
  test.setTimeout(120000);
  const privacy = observePrivacy(page);
  await importRGB(page);
  await page.getByLabel('Kod przypadku — pseudonim').fill('PUBLIC_REPORT');
  await page.getByRole('button', { name: 'Zastosuj dane przypadku' }).click();
  await page.locator('.step-button').nth(3).click();
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-5');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
  const current = await project(page), hash = independentGeometryHash(current.mesh);
  await page.locator('.step-button').nth(4).click();
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toContain('nieszyfrowany'); await dialog.accept(); });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Raport do oceny technicznej/ }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`PUBLIC_REPORT-r${current.workspace.revision}-raport.html`);
  const reportPath = resolve('docs/screenshots/v02-e2e/PUBLIC-review-report.html');
  await download.saveAs(reportPath);
  const html = await readFile(reportPath, 'utf8');
  expect(html).toContain(hash); expect(html).not.toMatch(/<script\b/i);
  const report = await context.newPage(), reportPrivacy = observePrivacy(report);
  await report.goto(pathToFileURL(reportPath).href);
  await expect(report.locator('header')).toContainText(`Rewizja ${current.workspace.revision}`);
  await expect(report.locator('.hash code')).toHaveText(hash);
  await expect(report.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'none'/);
  const rows = report.locator('.measurement-table tbody tr');
  expect(await rows.count()).toBeGreaterThan(3);
  for (const row of await rows.all()) {
    await expect(row.locator('td').nth(4)).toHaveText('—');
    await expect(row.locator('td').nth(5)).toHaveText('—');
    await expect(row.locator('td').nth(1)).not.toHaveText('—');
  }
  await expect(report.getByText(/Brak wartości oznacza brak ważnego wyniku lub dowodu/)).toBeVisible();
  await expect(report.getByText('NIEUSTALONO', { exact: true }).first()).toBeVisible();
  await expect(report.locator('body')).toContainText('NIE STANOWI ZWOLNIENIA DO WYTWARZANIA');
  await evidence(report, info, 'review-report-current-revision.png');
  await info.attach('report-fingerprint', { body: JSON.stringify({ revision: current.workspace.revision, hash, tapeCount: current.tapes.length, externalRequests: reportPrivacy.external }), contentType: 'application/json' });
  expect(reportPrivacy.external).toEqual([]); expect(reportPrivacy.errors).toEqual([]);
  expect(privacy.external).toEqual([]); expect(privacy.errors).toEqual([]); expect(privacy.violations).toEqual([]);
  await report.close();
});

for (const width of [1024, 390]) test(`all five stages render without document overflow at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
  await importRGB(page);
  const titles = ['Import i kontrola', 'Orientacja', 'Pomiary', 'Rektyfikacja', 'Eksport'];
  for (const [index, title] of titles.entries()) {
    await page.locator('.step-button').nth(index).click();
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    expect(await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }))).toEqual({ document: width, viewport: width });
    await evidence(page, info, `layout-${width}-step-${index + 1}.png`);
  }
});
