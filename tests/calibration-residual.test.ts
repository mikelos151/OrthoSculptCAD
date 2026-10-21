import {it,expect} from 'vitest';
import {evaluateCalibration} from '../src/calibrationReport';
import {calibrateMesh,SliceIndex} from '../src/geometry';
import type {MeshData} from '../src/types';
it('reports nonzero tape residuals on coarse triangles rather than calling approximate calibration an exact fit',()=>{
 const positions:number[]=[],indices:number[]=[];const n=64;
 for(const z of [0,100])for(let i=0;i<n;i++){const a=i/n*2*Math.PI;positions.push(20*Math.cos(a),20*Math.sin(a),z);}
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
 const mesh:MeshData={name:'SYNTHETIC coarse cylinder',positions:new Float32Array(positions),indices:new Uint32Array(indices)};
 const perimeter=new SliceIndex(mesh).slice(25).perimeter;
 const tapes=[{z:25,circumference:perimeter},{z:75,circumference:perimeter*1.5}];
 const rectified=calibrateMesh(mesh,tapes);const report=evaluateCalibration(rectified,tapes);
 expect(report.allValid).toBe(true);expect(report.rows[0].deltaMm).toBeGreaterThan(10);expect(report.rows[1].deltaMm).toBeLessThan(-10);
 expect(report.maxAbsoluteDeltaMm).toBeGreaterThan(10);expect(report.rows[0].tapeMm).toBe(tapes[0].circumference);
});
