import { requireCondition as check } from '../io/validation';

/** Additional manufacturing gate: edge-manifold alone does not exclude pinched vertices. */
export function assertVertexFans(indices: Uint32Array, vertices: number): void {
  const parent = Uint32Array.from({ length: indices.length }, (_, i) => i);
  const root = (v: number): number => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  const join = (a: number, b: number) => { parent[root(a)] = root(b); };
  const next = (corner: number) => corner - corner % 3 + (corner % 3 + 1) % 3;
  const edges = new Map<string, number>();
  for (let corner = 0; corner < indices.length; corner++) {
    const other = next(corner); const a = indices[corner], b = indices[other];
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`; const previous = edges.get(key);
    if (previous === undefined) edges.set(key, corner);
    else if (indices[previous] === a) { join(corner, previous); join(other, next(previous)); }
    else { join(corner, next(previous)); join(other, previous); }
  }
  const representatives = new Uint32Array(vertices); representatives.fill(0xffffffff);
  for (let corner = 0; corner < indices.length; corner++) {
    const vertex = indices[corner]; const component = root(corner);
    if (representatives[vertex] === 0xffffffff) representatives[vertex] = component;
    else check(representatives[vertex] === component, 'Wierzchołek non-manifold: rozłączny wachlarz trójkątów. Wymagana ręczna naprawa.');
  }
}
