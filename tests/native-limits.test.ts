import {it,expect} from 'vitest';
import {unpackSlice,packMesh} from '../src/nativeProtocol';
it('rejects coordinates exceeding the Rust 1e6 bound before IPC upload',()=>{
 const mesh={name:'coordinate gate',positions:new Float32Array([2_000_000,0,0,0,1,0,0,0,1]),indices:new Uint32Array([0,1,2])};
 expect(()=>packMesh(mesh)).toThrow();
 mesh.positions[0]=1_000_000;expect(packMesh(mesh).byteLength).toBe(64);
});
it('retains 10001 backend-valid diagnostic open contours instead of rejecting the response header',()=>{
 const count=10001;const packet=new ArrayBuffer(32+count*72);const view=new DataView(packet);
 view.setUint32(0,0x4f53534c,true);view.setUint32(4,1,true);view.setUint32(8,0,true);view.setUint32(12,count,true);
 view.setFloat64(16,50,true);view.setFloat64(24,1,true);
 for(let i=0;i<count;i++){
  const o=32+i*72;view.setUint32(o,0,true);view.setUint32(o+4,2,true);
  [1,0,1,0,i,0,i,1].forEach((value,k)=>view.setFloat64(o+8+k*8,value,true));
 }
 const result=unpackSlice(packet);expect(result.valid).toBe(false);expect(result.loops).toHaveLength(count);expect(result.loops[count-1].points).toEqual([[10000,0],[10000,1]]);
});
