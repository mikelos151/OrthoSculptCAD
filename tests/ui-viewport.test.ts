import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Viewport } from "../src/components/Viewport";
it("provides an accessible real viewport mount without claiming a renderer before initialization", () => {
  const html = renderToStaticMarkup(
    createElement(Viewport, {
      mesh: null,
      slice: null,
      markers: [],
      colors: undefined,
      brushActive: false,
      fitVersion: 0,
      view: "iso",
      wireframe: false,
      onBackend: () => {},
      onPick: () => {},
      onStrokeStart: () => {},
      onBrush: () => {},
    }),
  );
  expect(html).toContain("Obszar roboczy 3D");
  expect(html).not.toContain("WebGPU");
});
