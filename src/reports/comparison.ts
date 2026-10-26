import type { MeasurementRow, TapePoint } from '../types';
import type { ComparisonRow } from './types';

/** No interpolation or implicit registration: only identical requested Z levels compare. */
export function compareMeasurements(rows: MeasurementRow[], referenceRows: MeasurementRow[], tapes: TapePoint[], toleranceMm: number | null = null): ComparisonRow[] {
  for (const collection of [rows, referenceRows, tapes]) if (!Array.isArray(collection) || collection.length > 2000) throw new Error('Limit liczby pomiarów raportu (2000).');
  if (toleranceMm !== null && (!Number.isFinite(toleranceMm) || toleranceMm < 0 || toleranceMm > 1000)) throw new Error('Nieprawidłowy próg roboczy raportu.');
  for (const collection of [rows, referenceRows]) for (const row of collection) {
    // Engineering report/review bounds only; these are not anatomical or clinical tolerances.
    if (!row || ![row.z, row.circumference, row.ap, row.ml, row.area].every(Number.isFinite) || typeof row.valid !== 'boolean' ||
      Math.abs(row.z) > 100_000 || [row.circumference, row.ap, row.ml].some(v => Math.abs(v) > 100_000) || Math.abs(row.area) > 1e10 ||
      row.segmentVolume !== null && (!Number.isFinite(row.segmentVolume) || row.segmentVolume < 0 || row.segmentVolume > 1e15) ||
      row.valid && (row.circumference <= 0 || row.ap <= 0 || row.ml <= 0 || row.area <= 0)) throw new Error('Nieprawidłowe liczby pomiaru raportu.');
  }
  for (const collection of [rows, referenceRows, tapes]) {
    if (new Set(collection.map(row => row.z)).size !== collection.length) throw new Error('Powielona wysokość pomiaru raportu.');
  }
  const reference = new Map(referenceRows.map(row => [row.z, row]));
  for (const tape of tapes) if (!tape || !Number.isFinite(tape.z) || !Number.isFinite(tape.circumference) || tape.circumference <= 0 || tape.circumference > 100_000 || Math.abs(tape.z) > 100_000) throw new Error('Nieprawidłowa taśma raportu.');
  const tapeByHeight = new Map(tapes.map(tape => [tape.z, tape.circumference]));
  return rows.map(row => {
    const current = row.valid ? row : null;
    const candidate = reference.get(row.z);
    const before = candidate?.valid ? candidate : null;
    const tape = tapeByHeight.get(row.z) ?? null;
    const tapeDelta = current && tape !== null ? current.circumference - tape : null;
    return { z: row.z, current, reference: before, tape, tapeDelta,
      circumferenceDelta: current && before ? current.circumference - before.circumference : null,
      apDelta: current && before ? current.ap - before.ap : null,
      mlDelta: current && before ? current.ml - before.ml : null,
      areaDelta: current && before ? current.area - before.area : null,
      tolerance: tapeDelta === null ? 'unavailable' : toleranceMm === null ? 'not-set' : Math.abs(tapeDelta) <= toleranceMm ? 'within' : 'outside' };
  });
}
