import { cross, dot, sub, unit, vertex } from './core';
const lerp = (a, b, t) => a.map((x, k) => x + t * (b[k] - x));
const orient2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Intersection may touch only the actual indexed shared simplex, not arbitrary coincident geometry. */
function pair(a, b) {
    const scale = Math.max(...a.max.map((v, k) => v - a.min[k]), ...b.max.map((v, k) => v - b.min[k]), 1e-12);
    const eps = scale * 1e-9;
    const shared = a.ids.filter(i => b.ids.includes(i)).map(i => a.p[a.ids.indexOf(i)]);
    if (shared.length === 3)
        return 'hit';
    const allowed = (p) => {
        if (!shared.length)
            return false;
        if (shared.length === 1)
            return Math.hypot(...sub(p, shared[0])) <= eps;
        const d = sub(shared[1], shared[0]), v = sub(p, shared[0]), t = dot(v, d) / dot(d, d);
        return t >= -1e-9 && t <= 1 + 1e-9 && Math.hypot(...sub(p, lerp(shared[0], shared[1], t))) <= eps;
    };
    const da = a.p.map(p => dot(sub(p, b.p[0]), b.normal));
    const db = b.p.map(p => dot(sub(p, a.p[0]), a.normal));
    const separated = (d) => d.every(x => x > eps) || d.every(x => x < -eps);
    if (separated(da) || separated(db))
        return 'clear';
    const parallel = Math.hypot(...cross(a.normal, b.normal));
    // Distinct planes intersect only on their common indexed edge. Avoid ill-conditioned line reconstruction.
    if (shared.length === 2 && parallel >= 1e-10)
        return 'clear';
    let witnesses = [];
    if (parallel < 1e-10) {
        if (da.some(d => Math.abs(d) > eps))
            return 'unknown';
        const drop = a.normal.map(Math.abs).indexOf(Math.max(...a.normal.map(Math.abs)));
        const project = (p) => p.filter((_, k) => k !== drop);
        const bp = b.p.map(project), sign = Math.sign(orient2(bp[0], bp[1], bp[2]));
        // Convex clipping retains 3D witnesses, including zero-area edge/vertex contacts.
        witnesses = a.p.slice();
        for (let k = 0; k < 3 && witnesses.length; k++) {
            const start = bp[k], end = bp[(k + 1) % 3], output = [];
            for (let j = 0; j < witnesses.length; j++) {
                const p = witnesses[j], q = witnesses[(j + 1) % witnesses.length];
                const dp = sign * orient2(start, end, project(p)), dq = sign * orient2(start, end, project(q));
                if (dp >= 0)
                    output.push(p);
                if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0))
                    output.push(lerp(p, q, dp / (dp - dq)));
            }
            witnesses = output;
        }
    }
    else {
        const section = (points, distances) => {
            const result = [];
            for (let i = 0; i < 3; i++) {
                const j = (i + 1) % 3, di = distances[i], dj = distances[j];
                if (Math.abs(di) <= eps)
                    result.push(points[i]);
                if ((di < -eps && dj > eps) || (di > eps && dj < -eps))
                    result.push(lerp(points[i], points[j], di / (di - dj)));
            }
            return result;
        };
        const sa = section(a.p, da), sb = section(b.p, db);
        if (!sa.length || !sb.length)
            return 'clear';
        const direction = unit(cross(a.normal, b.normal)), origin = sa[0];
        const ia = sa.map(p => dot(sub(p, origin), direction)), ib = sb.map(p => dot(sub(p, origin), direction));
        const lo = Math.max(Math.min(...ia), Math.min(...ib)), hi = Math.min(Math.max(...ia), Math.max(...ib));
        if (lo > hi + eps)
            return 'clear';
        if (lo > hi)
            return 'unknown';
        witnesses = [lo, hi].map(t => origin.map((v, k) => v + t * direction[k]));
    }
    if (!witnesses.length)
        return 'clear';
    if (witnesses.every(allowed)) {
        // A shared vertex/edge has zero area. Tolerance membership cannot clear a
        // clipped area, however thin: its extent beyond the simplex is unresolved.
        if (parallel < 1e-10 && witnesses.some((p, i) => Math.hypot(...cross(sub(p, witnesses[0]), sub(witnesses[(i + 1) % witnesses.length], witnesses[0]))) > 0))
            return 'unknown';
        return 'clear';
    }
    // Nonzero plane distances inside tolerance cannot establish a reliable intersection.
    if ([...da, ...db].some(d => Math.abs(d) > scale * 1e-12 && Math.abs(d) <= eps))
        return 'unknown';
    return 'hit';
}
/** Median BVH: no quadratic all-pairs list; both narrow and broad phase work are bounded. */
export function scanIntersections(mesh, maxPairTests, maxIntersections) {
    const triangles = [];
    for (let t = 0; t < mesh.indices.length; t += 3) {
        const ids = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]], p = ids.map(i => vertex(mesh, i));
        const raw = cross(sub(p[1], p[0]), sub(p[2], p[0]));
        if (Math.hypot(...raw) <= 1e-20)
            return { intersections: [], candidateTests: 0, complete: false, reason: 'Degenerate triangles: spatial audit unknown' };
        triangles.push({ ids, p, min: [0, 1, 2].map(k => Math.min(...p.map(v => v[k]))), max: [0, 1, 2].map(k => Math.max(...p.map(v => v[k]))), normal: raw.map(v => v / Math.hypot(...raw)) });
    }
    const build = (faces) => {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const i of faces)
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], triangles[i].min[k]);
                max[k] = Math.max(max[k], triangles[i].max[k]);
            }
        if (faces.length <= 4)
            return { min, max, faces };
        const axis = max.map((v, k) => v - min[k]).indexOf(Math.max(...max.map((v, k) => v - min[k])));
        faces.sort((i, j) => (triangles[i].min[axis] + triangles[i].max[axis]) - (triangles[j].min[axis] + triangles[j].max[axis]));
        const mid = Math.floor(faces.length / 2);
        return { min, max, left: build(faces.slice(0, mid)), right: build(faces.slice(mid)) };
    };
    const root = build(triangles.map((_, i) => i)), stack = [[root, root]];
    const intersections = [];
    let candidateTests = 0, visits = 0, complete = true, reason = 'Complete bounded triangle/triangle audit';
    const overlaps = (a, b) => a.min.every((v, k) => v <= b.max[k] && b.min[k] <= a.max[k]);
    while (stack.length) {
        if (++visits > maxPairTests * 8 + triangles.length * 4) {
            complete = false;
            reason = 'Broad-phase budget exhausted';
            break;
        }
        const [a, b] = stack.pop();
        if (!overlaps(a, b))
            continue;
        if (a.faces && b.faces) {
            for (const i of a.faces)
                for (const j of b.faces) {
                    if (a === b && i >= j)
                        continue;
                    if (candidateTests >= maxPairTests)
                        return { intersections, candidateTests, complete: false, reason: 'Triangle-pair budget exhausted' };
                    candidateTests++;
                    if (!overlaps(triangles[i], triangles[j]))
                        continue;
                    const result = pair(triangles[i], triangles[j]);
                    if (result === 'unknown') {
                        complete = false;
                        reason = 'Numeric ambiguity in triangle-pair test';
                    }
                    if (result === 'hit') {
                        intersections.push([Math.min(i, j), Math.max(i, j)]);
                        if (intersections.length >= maxIntersections)
                            return { intersections, candidateTests, complete: false, reason: 'Intersection witness limit reached' };
                    }
                }
        }
        else if (a === b)
            stack.push([a.left, a.left], [a.left, a.right], [a.right, a.right]);
        else if (!a.faces && (b.faces || a.max.reduce((s, v, k) => s + v - a.min[k], 0) >= b.max.reduce((s, v, k) => s + v - b.min[k], 0)))
            stack.push([a.left, b], [a.right, b]);
        else
            stack.push([a, b.left], [a, b.right]);
    }
    intersections.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return { intersections, candidateTests, complete, reason };
}
