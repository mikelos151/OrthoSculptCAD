import { add, subtract, multiply, compare, rational } from './numerics';
export class FaceCubicError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'FaceCubicError';
    }
}
function ownData(object, key) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor))
        throw new FaceCubicError('INVALID_INPUT');
    return descriptor.value;
}
// Only fixed dimensions are traversed. Irrelevant caller properties/methods are ignored.
function snapshotArray(input, length) {
    if (!Array.isArray(input) || ownData(input, 'length') !== length)
        throw new FaceCubicError('INVALID_INPUT');
    const result = [];
    for (let i = 0; i < length; i++)
        result.push(ownData(input, String(i)));
    return result;
}
function snapshotMatrix(input, rows) {
    const root = snapshotArray(input, rows);
    const result = [];
    for (let i = 0; i < rows; i++)
        result.push(Object.freeze(snapshotArray(root[i], 3)));
    return Object.freeze(result);
}
export function certifyFaceCubic(triangle, barycentricControls, ctx) {
    triangle = snapshotMatrix(triangle, 3);
    barycentricControls = snapshotMatrix(barycentricControls, 4);
    const zero = rational(0n, 1n, ctx);
    const one = rational(1n, 1n, ctx);
    // Authenticate ALL 21 scalars before any geometric decision or scalar property read.
    for (let i = 0; i < 3; i++)
        for (let axis = 0; axis < 3; axis++)
            compare(triangle[i][axis], zero, ctx);
    for (let i = 0; i < 4; i++)
        for (let axis = 0; axis < 3; axis++)
            compare(barycentricControls[i][axis], zero, ctx);
    const e = [], g = [];
    for (let axis = 0; axis < 3; axis++) {
        e.push(subtract(triangle[1][axis], triangle[0][axis], ctx));
        g.push(subtract(triangle[2][axis], triangle[0][axis], ctx));
    }
    let noncollinear = false;
    for (const [r, s] of [[0, 1], [0, 2], [1, 2]]) {
        const minor = subtract(multiply(e[r], g[s], ctx), multiply(e[s], g[r], ctx), ctx);
        if (compare(minor, zero, ctx) !== 0) {
            noncollinear = true;
            break;
        }
    }
    if (!noncollinear)
        throw new FaceCubicError('DEGENERATE_TRIANGLE');
    for (let i = 0; i < 4; i++)
        for (let axis = 0; axis < 3; axis++) {
            if (compare(barycentricControls[i][axis], zero, ctx) < 0)
                throw new FaceCubicError('INVALID_BARYCENTRIC');
        }
    for (let i = 0; i < 4; i++) {
        if (compare(add(add(barycentricControls[i][0], barycentricControls[i][1], ctx), barycentricControls[i][2], ctx), one, ctx) !== 0) {
            throw new FaceCubicError('INVALID_BARYCENTRIC');
        }
    }
    const controls = [];
    for (let i = 0; i < 4; i++) {
        const point = [];
        for (let axis = 0; axis < 3; axis++) {
            point.push(add(add(multiply(barycentricControls[i][0], triangle[0][axis], ctx), multiply(barycentricControls[i][1], triangle[1][axis], ctx), ctx), multiply(barycentricControls[i][2], triangle[2][axis], ctx), ctx));
        }
        controls.push(Object.freeze(point));
    }
    return Object.freeze({ kind: 'supplied-face-cubic-hull-v1', triangle, barycentricControls,
        controls: Object.freeze(controls) });
}
