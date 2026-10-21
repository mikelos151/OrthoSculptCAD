import {it,expect} from 'vitest';
import {deformationColors} from '../src/geometry';
import type {MeshData} from '../src/types';
it('matches the prescribed clinical-display convention: green zero, blue relief +8mm, red compression -10mm',()=>{
 const mesh:MeshData={name:'synthetic oriented plane',positions:new Float32Array([0,0,0,10,0,0,0,10,0]),indices:new Uint32Array([0,1,2])};
 const original=mesh.positions.slice();
 const neutral=deformationColors(mesh,original);
 expect(neutral[1]).toBeGreaterThan(neutral[0]);expect(neutral[1]).toBeGreaterThan(neutral[2]);
 mesh.positions[2]=8;mesh.positions[5]=-10;
 const colors=deformationColors(mesh,original);
 expect(colors[2]).toBeGreaterThan(colors[0]);expect(colors[2]).toBeGreaterThan(colors[1]);
 expect(colors[3]).toBeGreaterThan(colors[4]);expect(colors[3]).toBeGreaterThan(colors[5]);
 expect(colors.slice(6,9)).toEqual(neutral.slice(6,9));
});
