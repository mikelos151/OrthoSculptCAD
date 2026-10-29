import { assertMesh, cross, dot, getBounds, sub, topology, vertex } from './core';
import { scanIntersections } from './intersections';
/** Closed edges, connected faces and vertex links are deliberately independent checks. */
export function auditMesh(mesh, options = {}) {
    const start = performance.now();
    assertMesh(mesh);
    const maxPairTests = options.maxPairTests ?? 2_000_000, maxIntersections = options.maxIntersections ?? 100;
    if (!Number.isSafeInteger(maxPairTests) || maxPairTests < 0 || maxPairTests > 10_000_000 || !Number.isSafeInteger(maxIntersections) || maxIntersections < 1 || maxIntersections > 10_000)
        throw new Error('Audit budgets must be bounded integers: pairs 0..10000000, intersections 1..10000');
    const triangleCount = mesh.indices.length / 3;
    if (triangleCount > 200_000 || mesh.positions.length / 3 > 200_000) {
        const checks = ['edge-manifold', 'watertight', 'vertex-manifold', 'components', 'degenerate-triangles', 'winding', 'self-intersections', 'outward', 'minimum-thickness'].map(id => ({ id, label: id, status: 'unknown', detail: 'Audit resource cap: 200000 triangles / vertices. No geometric quality claim; minimum thickness not computed. Signed-volume field is the uncomputed sentinel 0.' }));
        return { checks, triangleCount, candidateTests: 0, complete: false, elapsedMs: performance.now() - start, intersections: [], orientation: 'unknown', signedVolume: 0 };
    }
    const data = topology(mesh);
    let boundary = 0, nonManifold = 0, inconsistent = 0;
    const parent = Uint32Array.from({ length: triangleCount }, (_, i) => i);
    const root = (i) => { while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
    } return i; };
    for (const uses of data.edges.values()) {
        if (uses.length === 1)
            boundary++;
        if (uses.length > 2)
            nonManifold++;
        if (uses.length === 2 && uses[0].a === uses[1].a)
            inconsistent++;
        for (let i = 1; i < uses.length; i++)
            parent[root(uses[i].face / 3)] = root(uses[0].face / 3);
    }
    const components = new Set(Array.from(parent, (_, i) => root(i))).size;
    // Vertex link is a single path (boundary) or cycle (interior). A pinched vertex has multiple links.
    const links = Array.from({ length: mesh.positions.length / 3 }, () => new Map());
    for (let t = 0; t < mesh.indices.length; t += 3)
        for (let k = 0; k < 3; k++) {
            const v = mesh.indices[t + k], a = mesh.indices[t + (k + 1) % 3], b = mesh.indices[t + (k + 2) % 3], link = links[v];
            if (!link.has(a))
                link.set(a, []);
            if (!link.has(b))
                link.set(b, []);
            link.get(a).push(b);
            link.get(b).push(a);
        }
    let badFans = 0;
    for (const link of links) {
        const keys = [...link.keys()];
        if (!keys.length) {
            badFans++;
            continue;
        }
        const visited = new Set([keys[0]]), stack = [keys[0]];
        while (stack.length)
            for (const i of link.get(stack.pop()))
                if (!visited.has(i)) {
                    visited.add(i);
                    stack.push(i);
                }
        const ends = keys.filter(i => link.get(i).length === 1).length;
        if (visited.size !== link.size || keys.some(i => link.get(i).length > 2) || (ends !== 0 && ends !== 2))
            badFans++;
    }
    // Translation-independent closed-volume calculation, with compensated summation.
    const origin = vertex(mesh, mesh.indices[0]);
    let signedVolume = 0, compensation = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
        const a = sub(vertex(mesh, mesh.indices[t]), origin), b = sub(vertex(mesh, mesh.indices[t + 1]), origin), c = sub(vertex(mesh, mesh.indices[t + 2]), origin);
        const term = dot(a, cross(b, c)) / 6 - compensation, next = signedVolume + term;
        compensation = (next - signedVolume) - term;
        signedVolume = next;
    }
    const spatial = data.degenerateTriangles ? { intersections: [], candidateTests: 0, complete: false, reason: 'Degenerate geometry: spatial audit unknown' } : scanIntersections(mesh, maxPairTests, maxIntersections);
    const bounds = getBounds(mesh), volumeTolerance = Math.max(1e-18, bounds.size[0] * bounds.size[1] * bounds.size[2] * 1e-10);
    let orientation = 'unknown';
    if (inconsistent)
        orientation = 'inconsistent';
    else if (!boundary && !nonManifold && !badFans && components === 1 && !data.degenerateTriangles && spatial.complete && !spatial.intersections.length && Math.abs(signedVolume) > volumeTolerance)
        orientation = signedVolume > 0 ? 'outward' : 'inward';
    const checks = [];
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
    add('edge-manifold', 'Edge manifold', nonManifold ? 'fail' : 'pass', `${nonManifold} non-manifold edge(s); ${boundary} boundary edge(s)`);
    add('watertight', 'Closed edge topology', boundary || nonManifold ? 'fail' : 'pass', 'Closed edges alone do not prove absence of intersections');
    add('vertex-manifold', 'Vertex manifold', badFans ? 'fail' : 'pass', `${badFans} invalid or isolated vertex link(s)`);
    add('components', 'Single edge-connected surface', components === 1 ? 'pass' : 'fail', `${components} edge-connected component(s)`);
    add('degenerate-triangles', 'Non-degenerate faces', data.degenerateTriangles ? 'fail' : 'pass', `${data.degenerateTriangles} degenerate triangle(s)`);
    add('winding', 'Consistent winding', inconsistent ? 'fail' : 'pass', `${inconsistent} inconsistently oriented edge(s)`);
    add('self-intersections', '3D self-intersections', spatial.intersections.length ? 'fail' : spatial.complete ? 'pass' : 'unknown', `${spatial.reason}; ${spatial.intersections.length} witness pair(s), ${spatial.candidateTests} candidate tests`);
    add('outward', 'Outward orientation', orientation === 'outward' ? 'pass' : orientation === 'unknown' ? 'unknown' : 'fail', orientation === 'unknown' ? 'Requires one closed, vertex-manifold, intersection-free surface with resolved volume sign' : orientation);
    add('minimum-thickness', 'Minimum thickness', 'unknown', 'Not computed. Normal-offset distance is not a minimum-wall-thickness guarantee.');
    return { checks, triangleCount, candidateTests: spatial.candidateTests, complete: spatial.complete, elapsedMs: performance.now() - start, intersections: spatial.intersections, orientation, signedVolume };
}
