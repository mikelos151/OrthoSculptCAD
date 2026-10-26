import { describe, expect, it } from 'vitest';
import { compareMeasurements } from '../src/reports';
import type { MeasurementRow } from '../src/types';
const row = (z: number): MeasurementRow => ({z,circumference:100,ap:30,ml:25,area:500,segmentVolume:null,valid:true});
describe('v02 bounded report inputs',()=>{
 it.each([
  ['z',100_000],['z',-100_000],['circumference',100_000],['ap',100_000],['ml',100_000],['area',1e10],['segmentVolume',1e15],
 ] as const)('accepts engineering endpoint %s=%s but rejects one unit beyond for CAD and reference', (field,limit)=>{
  const boundary={...row(10),[field]:limit};
  expect(()=>compareMeasurements([boundary],[],[])).not.toThrow();
  expect(()=>compareMeasurements([row(10)],[boundary],[])).not.toThrow();
  const beyond={...boundary,[field]:limit+(limit<0?-1:1)};
  expect(()=>compareMeasurements([beyond],[],[])).toThrow(/pomiar|liczb|limit/i);
  expect(()=>compareMeasurements([row(10)],[beyond],[])).toThrow(/pomiar|liczb|limit/i);
  expect(()=>compareMeasurements([{...row(10),[field]:Number.MAX_VALUE}],[],[])).toThrow();
 });
 it('rejects non-finite manual evidence instead of printing NaN',()=>{
  expect(()=>compareMeasurements([row(10)],[],[{z:10,circumference:NaN}])).toThrow();
 });

 it('bounds report size before building a giant document',()=>{
  expect(()=>compareMeasurements(Array.from({length:2001},(_,i)=>row(i)),[],[])).toThrow(/limit/i);
 });

 it('rejects a negative operator threshold instead of presenting an acceptance decision',()=>{
  expect(()=>compareMeasurements([row(10)],[],[], -1)).toThrow(/próg|toleranc/i);
 });

 it('rejects duplicate Z rather than choosing one manual or reference value silently',()=>{
  expect(()=>compareMeasurements([row(10),row(10)],[],[])).toThrow(/powiel|jednoznacz|wysoko/i);
 });

 it('rejects non-finite source measurement instead of exporting an invented metric',()=>{
  expect(()=>compareMeasurements([row(NaN)],[],[])).toThrow(/pomiar|liczb|wysoko/i);
 });
});
