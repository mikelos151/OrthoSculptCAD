import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SectionView } from "../src/components/SectionView";
import type { SliceResult } from "../src/types";
it("frames translated contours instead of forcing the world origin into the view", () => {
  const slice: SliceResult = {
    z: 10,
    valid: true,
    perimeter: 40,
    area: 100,
    ap: 10,
    ml: 10,
    queryMs: 1,
    warnings: [],
    loops: [
      {
        points: [
          [1000, 1000],
          [1010, 1000],
          [1010, 1010],
          [1000, 1010],
        ],
        closed: true,
        perimeter: 40,
        area: 100,
        ap: 10,
        ml: 10,
      },
    ],
  };
  const html = renderToStaticMarkup(createElement(SectionView, { slice }));
  const viewBox = html
    .match(/viewBox="([^"]+)"/)![1]
    .split(" ")
    .map(Number);
  expect(viewBox[2]).toBeLessThan(100);
  expect(viewBox[0]).toBeGreaterThan(900);
});
it("renders real ordered contours and labels invalid section honestly", () => {
  const section: SliceResult = {
    z: 10,
    valid: false,
    perimeter: 0,
    area: 0,
    ap: 0,
    ml: 0,
    queryMs: 1,
    warnings: ["Otwarty kontur"],
    loops: [
      {
        points: [
          [0, 0],
          [10, 0],
          [10, 20],
        ],
        closed: false,
        perimeter: 30,
        area: 0,
        ap: 20,
        ml: 10,
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(SectionView, { slice: section }),
  );
  expect(html).toContain("Otwarty kontur");
  expect(html).toContain("polyline");
  expect(html).toContain("0,0 10,0 10,20");
  expect(html).not.toContain("polygon");
});
