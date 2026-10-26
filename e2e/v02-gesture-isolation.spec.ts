import { test, expect, type Page } from '@playwright/test';
import { importRGB, project, undoCount } from './helpers';

// Real pointer capture + real keyboard activation; no application state injection,
// Worker doubles, manufactured responses, patient files, or external requests.
async function observe(page: Page) {
  const errors: string[] = [], external: string[] = [];
  const origin = new URL(String(test.info().project.use.baseURL)).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url());
  });
  await page.addInitScript(() => {
    const log = { starts: 0, releases: 0, strokes: 0, pointerId: -1 };
    (globalThis as any).__gestureEvidence = log;
    document.addEventListener('gotpointercapture', event => { log.starts++; log.pointerId = (event as PointerEvent).pointerId; }, true);
    document.addEventListener('pointerup', () => log.releases++, true);
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message: any, ...args: any[]) {
      const result = (send as any).call(this, message, ...args);
      if (message?.kind === 'stroke') log.strokes++;
      return result;
    };
  });
  return { errors, external };
}
async function holdBrush(page: Page) {
  await expect(page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Widok z przodu', exact: true }).click();
  await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true }).click();
  const canvas = page.locator('.three-viewport canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Chromium applies pending pointer capture on the next pointer event.
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => (globalThis as any).__gestureEvidence.starts)).toBeGreaterThan(0);
}
async function releaseAndSettle(page: Page) {
  await page.mouse.up();
  // Give any erroneously dispatched real Worker time to publish, then read the
  // exact exported state. This is a negative late-publication regression gate.
  await page.waitForTimeout(1000);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
}

test('held brush then keyboard Undo must not restore the undone zone geometry', async ({ page }, info) => {
  test.setTimeout(120000);
  const privacy = await observe(page);
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
  const before = await project(page), historyBefore = await undoCount(page);
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Zmieniono obwód -10%');
  const zoned = await project(page);
  expect(zoned.mesh.positions[9 * 32 * 3]).toBe(18); // Z90, outside mid-mesh brush radius20
  await holdBrush(page);
  const undo = page.getByRole('button', { name: `Cofnij (${historyBefore + 1})`, exact: true });
  await undo.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.case-label')).toContainText(`r${zoned.workspace.revision + 1}`);
  await releaseAndSettle(page);
  const restored = await project(page);
  await page.screenshot({ path: info.outputPath('undo-held-brush.png'), fullPage: true });
  await info.attach('actual-state', { body: JSON.stringify({ privacy, evidence: await page.evaluate(() => (globalThis as any).__gestureEvidence), farX: restored.mesh.positions[9 * 32 * 3], revision: restored.workspace.revision, kinds: restored.workspace.events.map((e: any) => e.kind) }), contentType: 'application/json' });
  expect(restored.mesh).toEqual(before.mesh);
  expect(restored.originalPositions).toEqual(before.originalPositions);
  expect(restored.workspace.revision).toBe(zoned.workspace.revision + 1);
  expect(restored.workspace.events.at(-1).kind).toBe('undo');
  expect(await undoCount(page)).toBe(historyBefore);
  expect(await page.evaluate(() => (globalThis as any).__gestureEvidence.strokes)).toBe(0);
  expect(privacy).toEqual({ errors: [], external: [] });
});

test('held brush then keyboard New Project and confirm must never resurrect the old scan', async ({ page }, info) => {
  test.setTimeout(120000);
  const privacy = await observe(page);
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
  await page.locator('.workspace-summary > summary').click();
  await holdBrush(page);
  await page.getByRole('button', { name: 'Nowy projekt', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Ochrona bieżącej pracy', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Zastąp bieżący projekt', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.case-label')).toContainText('r0 · Nowy projekt');
  await releaseAndSettle(page);
  await page.screenshot({ path: info.outputPath('new-project-held-brush.png'), fullPage: true });
  await info.attach('actual-state', { body: JSON.stringify({ privacy, evidence: await page.evaluate(() => (globalThis as any).__gestureEvidence), header: await page.locator('.case-label').innerText() }), contentType: 'application/json' });
  await expect(page.locator('.case-label')).toContainText('r0 · Nowy projekt');
  await expect(page.locator('.empty-viewport')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz projekt', exact: true })).toBeDisabled();
  await expect(page.locator('.working-status')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).__gestureEvidence.strokes)).toBe(0);
  expect(privacy).toEqual({ errors: [], external: [] });
});

test('native capture loss cancels without history; next multi-dab gesture remains one exact undo', async ({ page }, info) => {
  test.setTimeout(120000);
  const privacy = await observe(page);
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
  const before = await project(page), historyBefore = await undoCount(page);
  await holdBrush(page);
  const canvas = page.locator('.three-viewport canvas');
  await canvas.evaluate(element => element.releasePointerCapture((globalThis as any).__gestureEvidence.pointerId));
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
  await releaseAndSettle(page);
  expect(await project(page)).toEqual(before);
  expect(await undoCount(page)).toBe(historyBefore);
  expect(await page.evaluate(() => (globalThis as any).__gestureEvidence.strokes)).toBe(0);
  await holdBrush(page);
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(50); // real sampling cadence is 35ms
    await page.mouse.move(box.x + box.width / 2 + i, box.y + box.height / 2 - i * 2);
  }
  await page.mouse.up();
  await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
  const painted = await project(page);
  expect(painted.mesh.positions).not.toEqual(before.mesh.positions);
  expect(painted.mesh.colors).toEqual(before.mesh.colors);
  expect(painted.originalPositions).toEqual(before.originalPositions);
  expect(painted.workspace.revision).toBe(before.workspace.revision + 1);
  expect(painted.workspace.events.length).toBe(before.workspace.events.length + 1);
  expect(painted.workspace.events.at(-1).kind).toBe('brush-relief');
  expect(painted.workspace.events.at(-1).parameters.dabCount).toBeGreaterThan(1);
  expect(painted.workspace.events.at(-1).parameters.dabCount).toBeLessThanOrEqual(128);
  expect(await undoCount(page)).toBe(historyBefore + 1);
  await page.getByRole('button', { name: `Cofnij (${historyBefore + 1})`, exact: true }).click();
  const restored = await project(page);
  expect(restored.mesh).toEqual(before.mesh);
  expect(restored.originalPositions).toEqual(before.originalPositions);
  expect(restored.tapes).toEqual(before.tapes);
  expect(await undoCount(page)).toBe(historyBefore);
  await page.screenshot({ path: info.outputPath('cancel-and-legitimate-one-undo.png'), fullPage: true });
  await info.attach('actual-state', { body: JSON.stringify({ privacy, evidence: await page.evaluate(() => (globalThis as any).__gestureEvidence), dabs: painted.workspace.events.at(-1).parameters.dabCount }), contentType: 'application/json' });
  expect(privacy).toEqual({ errors: [], external: [] });
});
