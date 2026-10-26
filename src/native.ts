import {invoke, isTauri} from '@tauri-apps/api/core';
import type {MeshData,SliceResult} from './types';
import {packMesh,unpackSlice} from './nativeProtocol';
export interface SliceEngine {kind:'rust'|'typescript'|'worker';slice:(z:number)=>Promise<SliceResult>;dispose?:()=>void}
export interface EngineDependencies {native:boolean;invoke:(command:string,args:unknown)=>Promise<unknown>}
/** Both modes operate on the same imported mesh. There is never a synthetic fallback. */
export async function createSliceEngine(mesh:MeshData,dependencies?:EngineDependencies):Promise<SliceEngine>{
  const native=dependencies?.native ?? isTauri();
  if(!native){
    // Browser errors are surfaced, never silently moved onto the UI thread.
    if(typeof window!=='undefined' || typeof Worker!=='undefined'){
      const {createWorkerSliceEngine}=await import('./compute');
      return createWorkerSliceEngine(mesh);
    }
    // Explicit Node/unit-test adapter: real TypeScript geometry, not browser Worker evidence.
    const {SliceIndex}=await import('./geometry');
    const index=new SliceIndex(mesh);
    return {kind:'typescript',slice:async(z)=>index.slice(z)};
  }
  const call=dependencies?.invoke ?? ((command:string,args:unknown)=>invoke(command,args as ArrayBuffer|Record<string,unknown>));
  const summary=await call('upload_mesh',packMesh(mesh));
  if(!summary || typeof summary!=='object' || !('generation' in summary) || !Number.isSafeInteger(summary.generation) || (summary.generation as number)<0){
    throw new Error('Nieprawidłowa generacja natywnej siatki.');
  }
  const generation=summary.generation as number;
  return {kind:'rust',slice:async(z)=>{
    if(!Number.isFinite(z))throw new Error('Nieprawidłowa wysokość przekroju.');
    const packet=await call('slice_mesh',{z,generation});
    if(!(packet instanceof ArrayBuffer))throw new Error('Natywny silnik nie zwrócił pakietu binarnego.');
    const result=unpackSlice(packet);
    if(Math.abs(result.z-z)>1e-7*Math.max(1,Math.abs(z)))throw new Error('Odpowiedź dotyczy innej płaszczyzny.');
    return result;
  }};
}
