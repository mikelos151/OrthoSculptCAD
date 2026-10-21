import type {MeshData,TapePoint} from './types';
import {SliceIndex} from './geometry';
export interface CalibrationResidualRow {z:number;tapeMm:number;actualMm:number|null;deltaMm:number|null}
export interface CalibrationResidualReport {rows:CalibrationResidualRow[];allValid:boolean;maxAbsoluteDeltaMm:number|null}
/** Re-measure the deformed mesh. Vertex interpolation is not exact tape fitting on coarse triangles. */
export function evaluateCalibration(mesh:MeshData,tapes:TapePoint[]):CalibrationResidualReport{
 if(tapes.length>1000)throw new Error('Za dużo poziomów kontroli kalibracji.');
 const index=new SliceIndex(mesh);
 const rows=tapes.map(tape=>{
  if(!Number.isFinite(tape.z)||!Number.isFinite(tape.circumference)||tape.circumference<=0)throw new Error('Nieprawidłowy pomiar kontrolny taśmą.');
  const slice=index.slice(tape.z);const actualMm=slice.valid?slice.perimeter:null;
  return {z:tape.z,tapeMm:tape.circumference,actualMm,deltaMm:actualMm===null?null:actualMm-tape.circumference};
 });
 const allValid=rows.length>0&&rows.every(row=>row.actualMm!==null);
 return {rows,allValid,maxAbsoluteDeltaMm:allValid?Math.max(...rows.map(row=>Math.abs(row.deltaMm!))):null};
}
