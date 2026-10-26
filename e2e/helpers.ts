import { expect, type Page, type Download, type TestInfo } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Only public, synthetic fixture copies are replaced in this suite.
export async function replaceSyntheticProject(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Ochrona bieżącej pracy', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Zastąp bieżący projekt', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

export async function savePlainDownload(page: Page): Promise<Download> {
  await page.getByRole('button', { name: 'Zapisz projekt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zapisz kopię projektu', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Ochrona pliku', { exact: true }).selectOption('plain');
  await expect(dialog.getByRole('button', { name: 'Pobierz nieszyfrowany JSON' })).toBeDisabled();
  await dialog.getByLabel('Rozumiem ryzyko jawnego zapisu', { exact: true }).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Pobierz nieszyfrowany JSON', exact: true }).click();
  const download = await pending;
  await expect(dialog).not.toBeVisible();
  return download;
}

export async function project(page: Page) {
  const download = await savePlainDownload(page);
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

export async function undoCount(page: Page) {
  const text = await page.getByRole('button', { name: /^Cofnij \(\d+\)$/ }).innerText();
  return Number(text.match(/\((\d+)\)/)![1]);
}

export async function evidence(page: Page, info: TestInfo, name: string) {
  const folder = resolve('docs/screenshots/v02-e2e');
  await mkdir(folder, { recursive: true });
  const path = resolve(folder, name);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}

export function observePrivacy(page: Page) {
  const errors: string[] = [], external: string[] = [], violations: string[] = [], workers: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    if (/^https?:/.test(url) && new URL(url).origin !== 'http://127.0.0.1:4176') external.push(url);
  });
  page.on('console', msg => { if (/content.security.policy|violates.*directive/i.test(msg.text())) violations.push(msg.text()); });
  page.on('worker', worker => workers.push(worker.url()));
  return { errors, external, violations, workers };
}

// A public RGB engineering fixture: outward-wound, capped, segmented cylinder.
export function rgbCylinderPLY(rings = 11, segments = 32) {
  const vertices: string[] = [], faces: string[] = [];
  for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
    const angle = 2 * Math.PI * i / segments;
    vertices.push(`${20 * Math.cos(angle)} ${20 * Math.sin(angle)} ${100 * ring / (rings - 1)} ${i % 2 ? 255 : 32} ${ring % 2 ? 180 : 64} 128`);
  }
  for (let ring = 0; ring < rings - 1; ring++) for (let i = 0; i < segments; i++) {
    const a = ring * segments + i, b = ring * segments + (i + 1) % segments, c = b + segments, d = a + segments;
    faces.push(`3 ${a} ${b} ${c}`, `3 ${a} ${c} ${d}`);
  }
  const bottom = vertices.length; vertices.push('0 0 0 255 0 0');
  const top = vertices.length; vertices.push('0 0 100 0 255 0');
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    faces.push(`3 ${bottom} ${j} ${i}`, `3 ${top} ${(rings - 1) * segments + i} ${(rings - 1) * segments + j}`);
  }
  return `ply\nformat ascii 1.0\ncomment PUBLIC SYNTHETIC engineering fixture, no patient data\nelement vertex ${vertices.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n${vertices.join('\n')}\n${faces.join('\n')}\n`;
}

export async function importRGB(page: Page, rings = 11, segments = 32) {
  await page.goto('/');
  await page.getByLabel('Wybierz skan i lokalne tekstury').setInputFiles({ name: 'PUBLIC-SYNTHETIC-rgb-cylinder.ply', mimeType: 'application/octet-stream', buffer: Buffer.from(rgbCylinderPLY(rings, segments)) });
  await expect(page.locator('.filename')).toContainText('PUBLIC-SYNTHETIC-rgb-cylinder.ply');
  await page.getByRole('button', { name: 'Potwierdź i przelicz na mm' }).click();
  await expect(page.getByRole('button', { name: 'Jednostki potwierdzone' })).toBeDisabled();
}
