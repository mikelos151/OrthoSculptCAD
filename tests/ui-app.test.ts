import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import App from "../src/App";
it("starts with five Polish workflow steps, explicit local import and no invented patient measurements", () => {
  const html = renderToStaticMarkup(createElement(App));
  for (const label of [
    "Import i kontrola",
    "Orientacja",
    "Pomiary",
    "Rektyfikacja",
    "Eksport",
  ])
    expect(html).toContain(label);
  expect(html).toContain("Wczytaj skan");
  expect(html).toContain('aria-label="Jednostka pliku"');
  expect(html).toContain("Dane syntetyczne");
  expect(html).toContain("lokalnie");
  expect(html).not.toContain("Jan Kowalski");
  expect(html).not.toContain("60 FPS");
});
