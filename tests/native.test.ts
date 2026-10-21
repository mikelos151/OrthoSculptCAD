import {describe,it,expect} from 'vitest';
import {createSliceEngine} from '../src/native';
import type {MeshData} from '../src/types';
import {createDemoMesh} from '../src/geometry';
const mesh:MeshData={name:'fixture',positions:new Float32Array([0,0,0,1,0,0,0,1,1]),indices:new Uint32Array([0,1,2])};
describe('native engine transport boundary',()=>{
 it('runs the TypeScript fallback on the actual mesh without invoking a native substitute',async()=>{
  const engine=await createSliceEngine(createDemoMesh(),{native:false,invoke:async()=>{throw Error('must not invoke');}});
  expect(engine.kind).toBe('typescript');const result=await engine.slice(100);expect(result.valid).toBe(true);expect(result.perimeter).toBeGreaterThan(0);
 });
 it('rejects a non-binary response and a packet belonging to another height',async()=>{
  const nonBinary=await createSliceEngine(mesh,{native:true,invoke:async command=>command==='upload_mesh'?{generation:1}:{loops:[]}});
  await expect(nonBinary.slice(1)).rejects.toThrow('binarnego');
  const wrongZ=await createSliceEngine(mesh,{native:true,invoke:async command=>{
   if(command==='upload_mesh')return {generation:1};const packet=new ArrayBuffer(32);const view=new DataView(packet);view.setUint32(0,0x4f53534c,true);view.setUint32(4,1,true);view.setFloat64(16,2,true);return packet;
  }});
  await expect(wrongZ.slice(1)).rejects.toThrow('płaszczyzny');
 });
 it('uploads binary mesh and binds all requests to its native generation',async()=>{
  const calls:{command:string;args:unknown}[]=[];
  const engine=await createSliceEngine(mesh,{native:true,invoke:async(command:string,args:unknown)=>{
    calls.push({command,args});
    if(command==='upload_mesh') return {generation:7};
    const packet=new ArrayBuffer(32);const view=new DataView(packet);
    view.setUint32(0,0x4f53534c,true);view.setUint32(4,1,true);view.setFloat64(16,0.5,true);return packet;
  }});
  expect(engine.kind).toBe('rust');
  const result=await engine.slice(0.5);
  expect(calls[0].command).toBe('upload_mesh');
  expect(calls[0].args).toBeInstanceOf(ArrayBuffer);
  expect(calls[1]).toEqual({command:'slice_mesh',args:{z:0.5,generation:7}});
  expect(result.valid).toBe(false);
 });
 it('surfaces native failures without substituting another mesh or fake results',async()=>{
  await expect(createSliceEngine(mesh,{native:true,invoke:async()=>({generation:NaN})})).rejects.toThrow('generacja');
  const engine=await createSliceEngine(mesh,{native:true,invoke:async(command)=>{
   if(command==='upload_mesh')return {generation:1};
   throw new Error('stale mesh generation');
  }});
  await expect(engine.slice(0.5)).rejects.toThrow('stale mesh');
  await expect(engine.slice(NaN)).rejects.toThrow('wysokość');
 });
});
