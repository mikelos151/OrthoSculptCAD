import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { QualityPanel, WorkspacePanel } from '../src/components/WorkspacePanel';
import type { WorkspaceState } from '../src/workspace/types';

it('shows pseudonymous metadata, side and a non-replayable revision journal', () => {
  const workspace: WorkspaceState = { format: 'OrthoSculptWorkspace', version: 1, caseDetails: { caseCode: 'TT_27', side: 'left', technicalNote: '', liner: 'unknown', scanContext: '' }, revision: 7, createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z', registration: null, events: [] };
  const html = renderToStaticMarkup(createElement(WorkspacePanel, { workspace, busy: false, dirty: true, copyCurrent: true, onApply() {}, onNew() {} }));
  expect(html).toContain('TT_27');
  expect(html).toContain('r7');
  expect(html).toContain('Dziennik nie jest archiwum siatek');
  expect(html).toContain('pseudonim');
  expect(html).toContain('Strona kończyny');
  expect(html).not.toContain('Data urodzenia');
});

it('labels quality checks in Polish while preserving PASS/FAIL/UNKNOWN', () => {
  const html = renderToStaticMarkup(createElement(QualityPanel, { audit: { checks: [{ id: 'winding', label: 'Consistent winding', status: 'pass', detail: '0 inconsistently oriented edge(s)' }], triangleCount: 12, candidateTests: 0, complete: true, elapsedMs: 1, intersections: [], orientation: 'outward', signedVolume: 1 }, busy: false, onAnalyze() {}, onOrient() {} }));
  expect(html).toContain('Spójność orientacji ścian');
  expect(html).toContain('PASS');
});

it('renders unknown quality as unknown, not clinical clearance', () => {
  const html = renderToStaticMarkup(createElement(QualityPanel, { audit: null, busy: false, onAnalyze() {}, onOrient() {} }));
  expect(html).toContain('UNKNOWN');
  expect(html).toContain('Nie jest zwolnieniem klinicznym');
});
