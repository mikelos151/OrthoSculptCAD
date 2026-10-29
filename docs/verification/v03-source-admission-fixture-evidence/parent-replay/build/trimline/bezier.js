import { add, subtract, multiply, divide, compare, rational } from './numerics';
export class BezierError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'BezierError';
    }
}
function ownData(object, key) {
    if (typeof object !== 'object' || object === null)
        throw new BezierError('INVALID_INPUT');
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor))
        throw new BezierError('INVALID_INPUT');
    return descriptor.value;
}
function snapshotLimits(limits) {
    const integer = (key, minimum, maximum) => {
        const value = ownData(limits, key);
        if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
            throw new BezierError('INVALID_INPUT');
        }
        return value;
    };
    return { maxDepth: integer('maxDepth', 0, 32), maxSegments: integer('maxSegments', 1, 20000),
        maxNodes: integer('maxNodes', 1, 40000) };
}
function snapshotControls(input) {
    const array = (value, length) => {
        if (!Array.isArray(value) || ownData(value, 'length') !== length)
            throw new BezierError('INVALID_INPUT');
        const snapshot = [];
        for (let i = 0; i < length; i++)
            snapshot.push(ownData(value, String(i)));
        return snapshot;
    };
    const points = array(input, 4);
    const controls = [];
    for (let i = 0; i < 4; i++)
        controls.push(Object.freeze(array(points[i], 3)));
    return Object.freeze(controls);
}
/** With D0=D3=0, D1=P1-(2P0+P3)/3, D2=P2-(P0+2P3)/3,
 * B(u)-L(u) = sum_i Bernstein3_i(u) D_i exactly. Nonnegative weights
 * summing to one and convexity of squared Euclidean norm give the global
 * bound U=max(||D1||^2, ||D2||^2). Each curve point and each chord point
 * has a partner at the SAME parameter, so this also bounds both directed
 * distances by sqrt(U); we never evaluate that square root.
 */
function upperBound(controls, ctx) {
    const two = rational(2n, 1n, ctx);
    const three = rational(3n, 1n, ctx);
    const norms = [];
    for (const i of [1, 2]) {
        let squared = rational(0n, 1n, ctx);
        for (let axis = 0; axis < 3; axis++) {
            const chord = divide(add(multiply(controls[0][axis], i === 1 ? two : rational(1n, 1n, ctx), ctx), multiply(controls[3][axis], i === 2 ? two : rational(1n, 1n, ctx), ctx), ctx), three, ctx);
            const delta = subtract(controls[i][axis], chord, ctx);
            squared = add(squared, multiply(delta, delta, ctx), ctx);
        }
        norms.push(squared);
    }
    return compare(norms[0], norms[1], ctx) >= 0 ? norms[0] : norms[1];
}
function split(controls, half, ctx) {
    const midpoint = (a, b) => Object.freeze([
        multiply(add(a[0], b[0], ctx), half, ctx),
        multiply(add(a[1], b[1], ctx), half, ctx),
        multiply(add(a[2], b[2], ctx), half, ctx),
    ]);
    const a = midpoint(controls[0], controls[1]);
    const b = midpoint(controls[1], controls[2]);
    const c = midpoint(controls[2], controls[3]);
    const d = midpoint(a, b);
    const e = midpoint(b, c);
    const middle = midpoint(d, e);
    return [Object.freeze([controls[0], a, d, middle]), Object.freeze([middle, e, c, controls[3]])];
}
export function sampleCubic(controlsInput, tolerance, limitsInput, ctx) {
    const limits = snapshotLimits(limitsInput);
    const controls = snapshotControls(controlsInput);
    const t0 = rational(0n, 1n, ctx);
    const t1 = rational(1n, 1n, ctx);
    if (compare(tolerance, t0, ctx) <= 0 || compare(tolerance, rational(1n, 200n, ctx), ctx) > 0) {
        throw new BezierError('INVALID_INPUT');
    }
    const half = rational(1n, 2n, ctx);
    const toleranceSquared = multiply(tolerance, tolerance, ctx);
    const pending = [{ controls, t0, t1, depth: 0 }];
    const leaves = [];
    const samples = [Object.freeze({ t: t0, point: controls[0] })];
    let maxUpperSquared = t0;
    let nodes = 1; // Root is already allocated at depth zero.
    while (pending.length) {
        const node = pending.pop();
        const upperSquared = upperBound(node.controls, ctx);
        if (compare(upperSquared, toleranceSquared, ctx) <= 0) {
            if (leaves.length + 1 + pending.length > limits.maxSegments)
                throw new BezierError('BUDGET_EXCEEDED');
            leaves.push(Object.freeze({ t0: node.t0, t1: node.t1, controls: node.controls, upperSquared }));
            samples.push(Object.freeze({ t: node.t1, point: node.controls[3] }));
            if (compare(upperSquared, maxUpperSquared, ctx) > 0)
                maxUpperSquared = upperSquared;
        }
        else {
            // Every pending node needs at least one future leaf. Reserve both children
            // before any midpoint/control allocation, not after exploring one child.
            if (node.depth >= limits.maxDepth || nodes + 2 > limits.maxNodes ||
                leaves.length + pending.length + 2 > limits.maxSegments)
                throw new BezierError('BUDGET_EXCEEDED');
            nodes += 2;
            const [left, right] = split(node.controls, half, ctx);
            const middle = multiply(add(node.t0, node.t1, ctx), half, ctx);
            const depth = node.depth + 1;
            pending.push({ controls: right, t0: middle, t1: node.t1, depth }, { controls: left, t0: node.t0, t1: middle, depth });
        }
    }
    return Object.freeze({ kind: 'cubic-parametric-bound-v1',
        samples: Object.freeze(samples), leaves: Object.freeze(leaves), maxUpperSquared });
}
