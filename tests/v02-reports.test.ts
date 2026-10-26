import { describe, expect, it } from 'vitest';
import { compareMeasurements } from '../src/reports';
import type { MeasurementRow } from '../src/types';
const row = (z: number, circumference: number): MeasurementRow => ({ z, circumference, ap: 30, ml: 25, area: 500, segmentVolume: null, valid: true });
describe('v02 real measurement comparison', () => {
  it('does not interpolate a reference or a tape at a different height', () => {
    expect(compareMeasurements([row(10, 100)], [row(10.1, 95)], [{z:10.1,circumference:98}])[0]).toMatchObject({reference:null,tape:null,circumferenceDelta:null,tapeDelta:null,tolerance:'unavailable'});
  });
  it('does not treat an invalid contour as a zero measurement', () => {
    expect(compareMeasurements([{...row(10,100),valid:false}], [row(10,95)],[{z:10,circumference:98}],2)[0]).toMatchObject({current:null,tapeDelta:null,circumferenceDelta:null,tolerance:'unavailable'});
  });
  it('uses only the explicit engineering threshold and includes its boundary', () => {
    expect(compareMeasurements([row(10,100)],[],[{z:10,circumference:98}],2)[0].tolerance).toBe('within');
    expect(compareMeasurements([row(10,100)],[],[{z:10,circumference:98}],1.99)[0].tolerance).toBe('outside');
  });

  it('compares CAD, reference and tape at exactly the same height', () => {
    expect(compareMeasurements, 'Comparison API is not implemented yet').toBeTypeOf('function');
    const compared = compareMeasurements([row(10, 100)], [row(10, 95)], [{ z: 10, circumference: 98 }]);
    expect(compared).toHaveLength(1);
    expect(compared[0]).toMatchObject({ z: 10, circumferenceDelta: 5, apDelta: 0, mlDelta: 0, areaDelta: 0, tape: 98, tapeDelta: 2, tolerance: 'not-set' });
  });
});
