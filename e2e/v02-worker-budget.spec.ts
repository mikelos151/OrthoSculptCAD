import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importRGB, observePrivacy, project } from './helpers';
// @ts-expect-error standalone browser diagnostic intentionally has no declarations
import { installWorkerBudgetProbe, summarizeWorkerBudget } from '../scripts/v02-worker-budget-probe.mjs';

test('E2E-02: project download with active comparison never exhausts native compute Worker budget', async ({ browser, request }, info) => {
  test.setTimeout(240000);
  const folder = 'docs/verification/v02-worker-budget-evidence';
  await mkdir(folder, { recursive: true });
  const html = await (await request.get('/')).text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  const bundle = await (await request.get(asset!)).body();
  const origin = { baseURL: 'http://127.0.0.1:4176', indexSha256: createHash('sha256').update(html).digest('hex'), asset, sha256: createHash('sha256').update(bundle).digest('hex'), chromium: browser.version() };
  const results: any[] = [];
  const failures: string[] = [];
  for (let session = 1; session <= 4; session++) {
    const context = await browser.newContext({ baseURL: origin.baseURL, viewport: { width: 1512, height: 982 }, acceptDownloads: true });
    const page = await context.newPage();
    const privacy = observePrivacy(page);
    await page.addInitScript(installWorkerBudgetProbe);
    let downloads = 0;
    try {
      await importRGB(page);
      await page.locator('.step-button').nth(3).click();
      await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
      await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
      await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
      await page.getByLabel('Wysokość przekroju Z', { exact: true }).fill('50');
      await expect(page.locator('.engine-caption')).toContainText(/Web Worker.*ms/);
      await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').check();
      const reference = page.locator('svg .reference-contour');
      const current = page.locator('.section-view svg polygon:not(.reference-contour)');
      const assertComparison = async () => {
        await expect(reference).toHaveCount(1);
        await expect(current).toHaveCount(1);
        expect((await reference.getAttribute('points'))!.trim().split(' ').length).toBeGreaterThan(20);
        expect(await current.getAttribute('points')).not.toBe(await reference.getAttribute('points'));
        await expect(page.locator('.section-view-heading')).toContainText('Z 50,0 mm');
        await expect(page.locator('.comparison-legend')).toContainText('Δ obwodu: -12,5 mm');
        await expect(page.locator('.three-viewport canvas')).toBeVisible();
      };
      await assertComparison();
      await expect(page.getByRole('alert')).toHaveCount(0);
      for (let cycle = 1; cycle <= 5; cycle++) {
        await page.evaluate(label => (globalThis as any).__PUBLIC_WORKER_BUDGET.mark(label), `before-download-${cycle}`);
        const saved = await project(page);
        downloads++;
        expect(saved.mesh.positions.length).toBe(354 * 3);
        await assertComparison();
        await page.evaluate(label => (globalThis as any).__PUBLIC_WORKER_BUDGET.mark(label), `after-contours-${cycle}`);
        // Inspect both current DOM and latched observations: a transient alert must fail too.
        await expect(page.getByRole('alert')).toHaveCount(0);
        const alerts = await page.evaluate(() => (globalThis as any).__PUBLIC_WORKER_BUDGET.events.filter((e: any) => e.type === 'alert'));
        expect(alerts).toEqual([]);
      }
    } catch (error) {
      failures.push(`session ${session}, completed downloads ${downloads}: ${String(error)}`);
      await page.screenshot({ path: `${folder}/session-${session}-failure.png`, fullPage: true });
    } finally {
      const events = await page.evaluate(() => (globalThis as any).__PUBLIC_WORKER_BUDGET?.events || []);
      const result = { session, downloads, ...summarizeWorkerBudget(events), privacy };
      results.push(result);
      await writeFile(`${folder}/session-${session}.json`, JSON.stringify({ origin, result, events }, null, 2));
      await context.close();
    }
  }
  const summary = { origin, freshContexts: results.length, downloads: results.reduce((sum, r) => sum + r.downloads, 0), results, failures };
  await writeFile(`${folder}/summary.json`, JSON.stringify(summary, null, 2));
  await info.attach('worker-budget-summary', { body: JSON.stringify(summary), contentType: 'application/json' });
  expect(failures).toEqual([]);
  expect(summary.downloads).toBe(20);
  for (const result of results) {
    expect(result.privacy.errors).toEqual([]);
    expect(result.privacy.external).toEqual([]);
    expect(result.privacy.violations).toEqual([]);
    expect(result.maxComputeAlive).toBeLessThanOrEqual(2);
  }
});
