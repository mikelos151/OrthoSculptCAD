import { test, expect, type Page } from "@playwright/test";
import {project,replaceSyntheticProject,undoCount,evidence} from './helpers';

const hugePLY = `ply
format ascii 1.0
comment SYNTHETIC overflow regression
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
1e36 0 0
0 1e36 0
0 0 1e36
3 0 1 2
`;

test("overflowing meter conversion keeps the original UI and unconfirmed model without pageerror", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Wybierz skan i lokalne tekstury").setInputFiles({
    name: "SYNTHETIC-huge.ply", mimeType: "application/octet-stream", buffer: Buffer.from(hugePLY),
  });
  await expect(page.locator(".filename span")).toHaveText("SYNTHETIC-huge.ply");
  const dimensions = await page.locator(".metrics-list").innerText();
  await page.getByLabel("Jednostka pliku", { exact: true }).selectOption("m");
  await page.getByRole("button", { name: "Potwierdź i przelicz na mm" }).click();
  await expect(page.getByRole("alert")).toContainText("Float32");
  await expect(page.getByRole("heading", { name: "Import i kontrola", exact: true })).toBeVisible();
  await expect(page.locator(".filename span")).toHaveText("SYNTHETIC-huge.ply");
  await expect(page.locator(".metrics-list")).toHaveText(dimensions, { useInnerText: true });
  await expect(page.getByText("Jednostki niepotwierdzone", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Najpierw potwierdź jednostki" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Zapisz projekt", exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("unit-overflow-controlled.png"), fullPage: true });
  // The same original geometry can still be confirmed at its representable scale.
  await page.getByLabel("Jednostka pliku", { exact: true }).selectOption("mm");
  await page.getByRole("button", { name: "Potwierdź i przelicz na mm" }).click();
  await expect(page.getByRole("button", { name: "Jednostki potwierdzone" })).toBeDisabled();
  expect(errors).toEqual([]);
});

function coarseCylinderPLY() {
  const n = 32, vertices: string[] = [], faces: string[] = [];
  for (const z of [0, 100])
    for (let i = 0; i < n; i++) {
      const angle = i * 2 * Math.PI / n;
      vertices.push(`${20 * Math.cos(angle)} ${20 * Math.sin(angle)} ${z}`);
    }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push(`3 ${i} ${j} ${n + j}`, `3 ${i} ${n + j} ${n + i}`);
  }
  return `ply\nformat ascii 1.0\ncomment SYNTHETIC engineering regression\nelement vertex ${vertices.length}\nproperty float x\nproperty float y\nproperty float z\nelement face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n${vertices.join("\n")}\n${faces.join("\n")}\n`;
}

async function importCylinder(page: Page) {
  await page.goto("/");
  await page.getByLabel("Wybierz skan i lokalne tekstury").setInputFiles({
    name: "SYNTHETIC-coarse-cylinder.ply", mimeType: "application/octet-stream", buffer: Buffer.from(coarseCylinderPLY()),
  });
  await page.getByRole("button", { name: "Potwierdź i przelicz na mm" }).click();
  await expect(page.getByRole("button", { name: "Jednostki potwierdzone" })).toBeDisabled();
}

test("empty and zero-percent zones warn without changing geometry, baseline, measurements or undo", async ({ page }, testInfo) => {
  // Two failing diagnostic assertions stay soft so all geometry/undo invariants still run.
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await importCylinder(page);
  const before = await project(page);
  await page.locator(".step-button").nth(2).click();
  await page.getByRole("button", { name: "Oblicz tabelę przekrojów" }).click();
  const measurements = await page.locator("tbody").innerText();
  await page.locator(".step-button").nth(3).click();
  const historyBefore=await undoCount(page);
  await page.getByLabel("Z min · mm", { exact: true }).fill("25");
  await page.getByLabel("Z max · mm", { exact: true }).fill("75");
  await page.getByLabel("Zmiana obwodu · %", { exact: true }).fill("-10");
  await page.getByRole("button", { name: "Zastosuj korektę strefy" }).click();
  await expect.soft(page.getByRole("alert")).toContainText("nie zmieniła żadnych współrzędnych");
  await evidence(page,testInfo,'empty-zone-generic-error.png');
  expect(await undoCount(page)).toBe(historyBefore);
  await expect(page.getByText(/Zastosowano zmianę obwodu|Zmieniono obwód/)).toHaveCount(0);
  expect(await project(page)).toEqual(before);
  await page.locator(".step-button").nth(2).click();
  await expect(page.locator("tbody")).toHaveText(measurements, { useInnerText: true });
  await page.locator(".step-button").nth(3).click();
  await page.getByLabel("Z min · mm", { exact: true }).fill("0");
  await page.getByLabel("Z max · mm", { exact: true }).fill("100");
  await page.getByLabel("Zmiana obwodu · %", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Zastosuj korektę strefy" }).click();
  await expect.soft(page.getByRole("alert")).toContainText("nie zmieniła żadnych współrzędnych");
  expect(await undoCount(page)).toBe(historyBefore);
  await page.screenshot({ path: testInfo.outputPath("zone-noop-controlled.png"), fullPage: true });
  // A real vertex edit still works and undo restores exact coordinates.
  await page.getByLabel("Zmiana obwodu · %", { exact: true }).fill("-10");
  await page.getByRole("button", { name: "Zastosuj korektę strefy" }).click();
  await expect(page.getByRole("button", { name: `Cofnij (${historyBefore+1})`, exact: true })).toBeEnabled();
  const after = await project(page);
  expect(after.mesh.positions).not.toEqual(before.mesh.positions);
  expect(after.originalPositions).toEqual(before.originalPositions);
  await page.getByRole("button", { name: `Cofnij (${historyBefore+1})`, exact: true }).click();
  expect((await project(page)).mesh.positions).toEqual(before.mesh.positions);
  expect(errors).toEqual([]);
});

test("list RGB PLY is refused visibly and preserves the current project", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await importCylinder(page);
  const before = await project(page);
  const invalid = `ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty list uchar uchar red\nproperty list uchar uchar green\nproperty list uchar uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 1 255 1 0 1 0\n1 0 0 1 0 1 255 1 0\n0 1 0 1 0 1 0 1 255\n3 0 1 2\n`;
  await page.getByLabel("Wybierz skan i lokalne tekstury").setInputFiles({
    name: "SYNTHETIC-list-rgb.ply", mimeType: "application/octet-stream", buffer: Buffer.from(invalid),
  });
  await replaceSyntheticProject(page);
  await expect(page.getByRole("alert")).toContainText("RGB PLY wymaga trzech właściwości skalarnych");
  await expect(page.locator(".filename span")).toHaveText("SYNTHETIC-coarse-cylinder.ply");
  await page.screenshot({ path: testInfo.outputPath("list-rgb-refused.png"), fullPage: true });
  expect(await project(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("coarse calibration reports numeric residual and retains manual tape evidence", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await importCylinder(page);
  const before = await project(page);
  const circumference = 32 * 40 * Math.sin(Math.PI / 32);
  const tapes = [{ z: 25, circumference }, { z: 75, circumference: 1.5 * circumference }];
  before.tapes = tapes;
  await page.getByLabel("Wybierz zapisany projekt", { exact: true }).setInputFiles({
    name: "SYNTHETIC-calibration.oscad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(before)),
  });
  await replaceSyntheticProject(page);
  await expect(page.getByText(/Wczytano projekt i dziennik/)).toBeVisible();
  await page.locator(".step-button").nth(2).click();
  await page.getByRole("button", { name: "Oblicz tabelę przekrojów" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("button", { name: "Kalibruj skalę z taśm" }).click();
  const notice = page.locator(".notification");
  await expect(notice).toContainText("Skalibrowano przybliżenie");
  await expect(notice).toContainText(/Maksymalna reszta.*mm.*zmierz tabelę ponownie/);
  const match = (await notice.innerText()).match(/Maksymalna reszta na poziomach taśm:\s+([\d,\.]+)\s*mm/);
  expect(match).not.toBeNull();
  const residual = Number(match![1].replace(",", "."));
  expect(residual).toBeGreaterThan(15);
  expect(residual).toBeLessThan(16);
  await expect(page.locator(".tape-list > div")).toHaveCount(2);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("calibration-residual.png"), fullPage: true });
  const after = await project(page);
  expect(after.tapes).toEqual(tapes);
  expect(after.mesh.positions).not.toEqual(before.mesh.positions);
  expect(after.originalPositions).toEqual(after.mesh.positions);
  expect(errors).toEqual([]);
});
