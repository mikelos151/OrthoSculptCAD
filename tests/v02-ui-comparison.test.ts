import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SliceResult } from '../src/types';
import { SectionView } from '../src/components/SectionView';

const slice: SliceResult = { z: 20, loops: [{ points: [[0,0],[1,0],[0,1]], closed: true, perimeter: 30, area: 10, ap: 1, ml: 1 }], valid: true, perimeter: 30, area: 10, ap: 1, ml: 1, queryMs: 1, warnings: [] };
it('compares actual reference contours on exactly the same height', () => {
  const html = renderToStaticMarkup(createElement(SectionView, { slice, reference: { ...slice, perimeter: 25 } }));
  expect(html).toContain('reference-contour');
  expect(html).toContain('Referencja robocza');
  expect(html).toContain('5,0');
});
it('does not compare a stale reference from another height', () => {
  const html = renderToStaticMarkup(createElement(SectionView, { slice, reference: { ...slice, z: 21 } }));
  expect(html).not.toContain('reference-contour');
  expect(html).not.toContain('Δ obwodu');
});
