/** All geometry is expressed in millimetres, right-handed X lateral/Y anterior/Z proximal. */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export interface MeshData { source?: 'synthetic' | 'imported'; positions: Float32Array; indices: Uint32Array; colors?: Float32Array; uvs?: Float32Array; textureUrl?: string; name: string; }
export interface Bounds { min: Vec3; max: Vec3; size: Vec3; center: Vec3; }
export interface TopologyReport { vertices: number; triangles: number; boundaryEdges: number; nonManifoldEdges: number; degenerateTriangles: number; inconsistentEdges: number; boundaryLoops: number[][]; watertight: boolean; signedVolume: number; warnings: string[]; }
export interface SliceLoop { points: Vec2[]; closed: boolean; perimeter: number; area: number; ap: number; ml: number; }
export interface SliceResult { z: number; loops: SliceLoop[]; valid: boolean; perimeter: number; area: number; ap: number; ml: number; queryMs: number; warnings: string[]; }
export interface MeasurementRow { z: number; circumference: number; ap: number; ml: number; area: number; segmentVolume: number | null; valid: boolean; }
export interface TapePoint { z: number; circumference: number; }
export type BrushMode = 'relief' | 'compress' | 'smooth';
export interface BrushOptions { center: Vec3; radius: number; strength: number; mode: BrushMode; }
export interface ShellOptions { thickness: number; flareAngle: number; flareRadius: number; }
export interface ImportResult { mesh: MeshData; warnings: string[]; }
