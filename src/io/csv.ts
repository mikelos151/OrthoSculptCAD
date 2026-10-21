import type { MeasurementRow, TapePoint } from '../types';
import { validateTapes } from './project';
import { count, finite, LIMITS, requireCondition as check } from './validation';

export function exportMeasurements(rows: MeasurementRow[], tapes: TapePoint[], sourceName?: string): Blob {
  check(Array.isArray(rows), 'Wymagana tabela pomiarów.'); count(rows.length, LIMITS.rows, 'Wiersze CSV'); const checked = validateTapes(tapes);
  check(sourceName === undefined || typeof sourceName === 'string' && sourceName.length <= 200 && !/[\x00-\x1f]/.test(sourceName), 'Nieprawidłowa nazwa źródła CSV.');
  const sourceCell = sourceName === undefined ? '' : ',' + '"' + (/^[=+@-]/.test(sourceName) ? "'" : '') + sourceName.replace(/"/g, '""') + '"';
  const lines = ['z_mm,circumference_mm,ap_mm,ml_mm,area_mm2,segment_volume_mm3,tape_mm,delta_mm,valid' + (sourceName === undefined ? '' : ',source')];
  for (const row of rows) {
    check(row && typeof row.valid === 'boolean', 'Nieprawidłowy wiersz CSV.'); const z = finite(row.z, 'Wysokość CSV');
    const tape = checked.find(t => Math.abs(t.z - z) < 1e-6)?.circumference;
    const numbers = row.valid ? [row.circumference, row.ap, row.ml, row.area].map(x => { finite(x); check(x >= 0, 'Ujemny pomiar.'); return x; }) : ['', '', '', ''];
    const volume = row.valid && row.segmentVolume !== null ? finite(row.segmentVolume, 'Objętość CSV') : '';
    check(volume === '' || volume >= 0, 'Ujemna objętość.');
    lines.push([z, ...numbers, volume, tape ?? '', row.valid && tape !== undefined ? row.circumference - tape : '', row.valid].join(',') + sourceCell);
  }
  return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}
