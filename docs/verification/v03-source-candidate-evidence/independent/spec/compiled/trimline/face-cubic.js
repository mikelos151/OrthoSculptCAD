"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaceCubicError = void 0;
exports.certifyFaceCubic = certifyFaceCubic;
const numerics_1 = require("./numerics");
class FaceCubicError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'FaceCubicError';
    }
}
exports.FaceCubicError = FaceCubicError;
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
function certifyFaceCubic(triangle, barycentricControls, ctx) {
    triangle = snapshotMatrix(triangle, 3);
    barycentricControls = snapshotMatrix(barycentricControls, 4);
    const zero = (0, numerics_1.rational)(0n, 1n, ctx);
    const one = (0, numerics_1.rational)(1n, 1n, ctx);
    // Authenticate ALL 21 scalars before any geometric decision or scalar property read.
    for (let i = 0; i < 3; i++)
        for (let axis = 0; axis < 3; axis++)
            (0, numerics_1.compare)(triangle[i][axis], zero, ctx);
    for (let i = 0; i < 4; i++)
        for (let axis = 0; axis < 3; axis++)
            (0, numerics_1.compare)(barycentricControls[i][axis], zero, ctx);
    const e = [], g = [];
    for (let axis = 0; axis < 3; axis++) {
        e.push((0, numerics_1.subtract)(triangle[1][axis], triangle[0][axis], ctx));
        g.push((0, numerics_1.subtract)(triangle[2][axis], triangle[0][axis], ctx));
    }
    let noncollinear = false;
    for (const [r, s] of [[0, 1], [0, 2], [1, 2]]) {
        const minor = (0, numerics_1.subtract)((0, numerics_1.multiply)(e[r], g[s], ctx), (0, numerics_1.multiply)(e[s], g[r], ctx), ctx);
        if ((0, numerics_1.compare)(minor, zero, ctx) !== 0) {
            noncollinear = true;
            break;
        }
    }
    if (!noncollinear)
        throw new FaceCubicError('DEGENERATE_TRIANGLE');
    for (let i = 0; i < 4; i++)
        for (let axis = 0; axis < 3; axis++) {
            if ((0, numerics_1.compare)(barycentricControls[i][axis], zero, ctx) < 0)
                throw new FaceCubicError('INVALID_BARYCENTRIC');
        }
    for (let i = 0; i < 4; i++) {
        if ((0, numerics_1.compare)((0, numerics_1.add)((0, numerics_1.add)(barycentricControls[i][0], barycentricControls[i][1], ctx), barycentricControls[i][2], ctx), one, ctx) !== 0) {
            throw new FaceCubicError('INVALID_BARYCENTRIC');
        }
    }
    const controls = [];
    for (let i = 0; i < 4; i++) {
        const point = [];
        for (let axis = 0; axis < 3; axis++) {
            point.push((0, numerics_1.add)((0, numerics_1.add)((0, numerics_1.multiply)(barycentricControls[i][0], triangle[0][axis], ctx), (0, numerics_1.multiply)(barycentricControls[i][1], triangle[1][axis], ctx), ctx), (0, numerics_1.multiply)(barycentricControls[i][2], triangle[2][axis], ctx), ctx));
        }
        controls.push(Object.freeze(point));
    }
    return Object.freeze({ kind: 'supplied-face-cubic-hull-v1', triangle, barycentricControls,
        controls: Object.freeze(controls) });
}
