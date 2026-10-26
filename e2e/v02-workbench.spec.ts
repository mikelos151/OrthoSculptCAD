import { test, expect } from '@playwright/test';
import { evidence, importRGB, observePrivacy, project, undoCount } from './helpers';

test('real multi-point RGB brush stroke is one journal event and undo entry, heatmap preserves source RGB, undo restores exact baseline', async ({ page }, info) => {
  test.setTimeout(120000);
  const privacy = observePrivacy(page);
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("connect-src 'self'");
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
  const before = await project(page), countBefore = await undoCount(page);
  await expect(page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Widok z przodu', exact: true }).click();
  await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true }).click();
  const canvas = page.locator('.three-viewport canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    // Synchronize with real rendered frames; the UI samples at most one dab per 35ms.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
    await page.mouse.move(x + i * 1.5, y - i * 2);
  }
  await page.mouse.up();
  await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
  await expect(page.getByRole('button', { name: `Cofnij (${countBefore + 1})`, exact: true })).toBeEnabled();
  const brushed = await project(page);
  expect(brushed.workspace.revision).toBe(before.workspace.revision + 1);
  expect(brushed.workspace.events.length).toBe(before.workspace.events.length + 1);
  expect(brushed.workspace.events.at(-1).kind).toBe('brush-relief');
  expect(brushed.workspace.events.at(-1).parameters.dabCount).toBeGreaterThan(1);
  expect(brushed.mesh.positions).not.toEqual(before.mesh.positions);
  expect(brushed.mesh.colors).toEqual(before.mesh.colors);
  expect(brushed.mesh.indices).toEqual(before.mesh.indices);
  expect(brushed.originalPositions).toEqual(before.originalPositions);
  await expect(page.getByLabel('Podpisana mapa deformacji')).toBeEnabled();
  await page.getByLabel('Podpisana mapa deformacji').check();
  await expect(page.locator('.heatmap-legend')).toBeVisible();
  const mapped = await project(page);
  expect(mapped).toEqual(brushed);
  await evidence(page, info, 'brush-real-stroke-source-rgb.png');
  await page.getByRole('button', { name: `Cofnij (${countBefore + 1})`, exact: true }).click();
  const restored = await project(page);
  expect(restored.mesh).toEqual(before.mesh);
  expect(restored.originalPositions).toEqual(before.originalPositions);
  expect(restored.tapes).toEqual(before.tapes);
  expect(await undoCount(page)).toBe(countBefore);
  expect(restored.workspace.events.at(-1).kind).toBe('undo');
  await info.attach('real-worker-observations', { body: JSON.stringify({ csp, ...privacy, strokeDabs: brushed.workspace.events.at(-1).parameters.dabCount }), contentType: 'application/json' });
  expect(privacy.workers.some(url => /display\.worker-/.test(url))).toBe(true);
  expect(privacy.workers.some(url => /\/worker-/.test(url))).toBe(true);
  expect(privacy.errors).toEqual([]); expect(privacy.violations).toEqual([]); expect(privacy.external).toEqual([]);
});

test('comparison renders distinct same-Z reference and current SVG geometry plus real 3D viewport', async ({ page }, info) => {
  test.setTimeout(120000);
  const privacy = observePrivacy(page);
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
  const baseline = await project(page);
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
  await page.getByLabel('Wysokość przekroju Z', { exact: true }).fill('50');
  await expect(page.locator('.engine-caption')).toContainText(/Web Worker.*ms/);
  await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').check();
  const reference = page.locator('svg .reference-contour');
  const current = page.locator('.section-view svg polygon:not(.reference-contour)');
  await expect(reference).toHaveCount(1); await expect(current).toHaveCount(1);
  const refPoints = (await reference.getAttribute('points'))!;
  const currentPoints = (await current.getAttribute('points'))!;
  expect(refPoints.trim().split(' ').length).toBeGreaterThan(20);
  expect(currentPoints).not.toBe(refPoints);
  await expect(page.locator('.section-view-heading')).toContainText('Z 50,0 mm');
  await expect(page.locator('.comparison-legend')).toContainText('Δ obwodu: −12,5 mm'.replace('−', '-'));
  const after = await project(page);
  expect(after.originalPositions).toEqual(baseline.originalPositions);
  // Downloading temporarily suspends the slice engines. Capture only after both real contours return.
  await expect(reference).toHaveCount(1); await expect(current).toHaveCount(1);
  await expect(page.locator('.comparison-legend')).toContainText('Δ obwodu: -12,5 mm');
  await expect.soft(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.three-viewport canvas')).toBeVisible();
  await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  await evidence(page, info, 'comparison-actual-2d-and-3d.png');
  await page.locator('.three-viewport').screenshot({ path: 'docs/screenshots/v02-e2e/comparison-3d-viewport.png' });
  await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').uncheck();
  await expect(reference).toHaveCount(0);
  expect((await project(page)).mesh).toEqual(after.mesh);
  expect(privacy.errors).toEqual([]); expect(privacy.violations).toEqual([]); expect(privacy.external).toEqual([]);
});

test('app cancellation after actual Worker dispatch terminates the task and prevents cancelled geometry or revision publication', async ({ page }, info) => {
  test.setTimeout(120000);
  // Observe real native transport. No mocked Worker, delayed response or fabricated result.
  // Cancel through the real visible button immediately after native postMessage dispatch.
  await page.addInitScript(() => {
    const state = { armed: false, dispatched: 0, cancelledWorkers: 0, clicked: 0 };
    (globalThis as any).__PUBLIC_E2E_CANCEL = state;
    const marked = new WeakSet<Worker>();
    const send = Worker.prototype.postMessage, terminate = Worker.prototype.terminate;
    Worker.prototype.postMessage = function(message: any, ...args: any[]) {
      const output = (send as any).call(this, message, ...args);
      if (message?.kind === 'task' && message.op === 'zone' && state.armed) {
        state.armed = false; state.dispatched++; marked.add(this);
        queueMicrotask(() => {
          const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Anuluj zadanie');
          if (button) { state.clicked++; button.click(); }
        });
      }
      return output;
    };
    Worker.prototype.terminate = function() { if (marked.has(this)) state.cancelledWorkers++; return terminate.call(this); };
  });
  const privacy = observePrivacy(page);
  await importRGB(page, 31, 64);
  await page.locator('.step-button').nth(3).click();
  const before = await project(page), countBefore = await undoCount(page);
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  await page.evaluate(() => { (globalThis as any).__PUBLIC_E2E_CANCEL.armed = true; });
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Spóźniony wynik nie zmieni projektu');
  expect(await page.evaluate(() => (globalThis as any).__PUBLIC_E2E_CANCEL)).toEqual({ armed: false, dispatched: 1, cancelledWorkers: 1, clicked: 1 });
  expect(await project(page)).toEqual(before);
  expect(await undoCount(page)).toBe(countBefore);
  await evidence(page, info, 'cancelled-real-worker-no-publication.png');
  // A newer real task must finish normally; the cancelled candidate must not overwrite it.
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-5');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Zmieniono obwód -5%');
  const newer = await project(page);
  expect(newer.workspace.revision).toBe(before.workspace.revision + 1);
  expect(newer.workspace.events.at(-1).parameters.percent).toBe(-5);
  expect(newer.mesh.positions).not.toEqual(before.mesh.positions);
  expect(newer.originalPositions).toEqual(before.originalPositions);
  expect(newer.mesh.colors).toEqual(before.mesh.colors);
  await page.getByRole('button', { name: `Cofnij (${countBefore + 1})`, exact: true }).click();
  expect((await project(page)).mesh).toEqual(before.mesh);
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
});
