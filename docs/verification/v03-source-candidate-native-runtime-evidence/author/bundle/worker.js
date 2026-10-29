// OrthoSculptCAD/src/io/validation.ts
var LIMITS = Object.freeze({
	bytes: 134217728,
	vertices: 1e6,
	triangles: 2e6,
	files: 16,
	tapes: 1e3,
	rows: 1e5,
	textureBytes: 16777216
});
function requireCondition(condition, message) {
	if (!condition) throw new Error(message);
}
function finite(value, label = "Wartość") {
	requireCondition(Number.isFinite(value), `${label}: wymagana skończona liczba.`);
	return value;
}
function count(value, limit, label) {
	requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= limit, `${label}: przekroczony limit lub nieprawidłowa liczba.`);
	return value;
}
/** Structural input validation only; topology belongs to src/geometry. */
function assertMesh(mesh) {
	requireCondition(mesh && mesh.positions instanceof Float32Array && mesh.indices instanceof Uint32Array, "Nieprawidłowe tablice siatki.");
	checkSource(mesh.source);
	const n = count(mesh.positions.length / 3, LIMITS.vertices, "Wierzchołki");
	requireCondition(n >= 3, "Siatka wymaga minimum 3 wierzchołków.");
	requireCondition(count(mesh.indices.length / 3, LIMITS.triangles, "Trójkąty") > 0, "Brak trójkątów.");
	requireCondition(typeof mesh.name === "string" && mesh.name.length <= 200 && !/[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(mesh.name), "Nieprawidłowa nazwa siatki.");
	for (const x of mesh.positions) finite(x, "Pozycja");
	for (const i of mesh.indices) requireCondition(i < n, "Indeks poza tablicą wierzchołków.");
	if (mesh.colors) {
		requireCondition(mesh.colors instanceof Float32Array && mesh.colors.length === n * 3, "Niezgodna długość RGB.");
		for (const c of mesh.colors) requireCondition(Number.isFinite(c) && c >= 0 && c <= 1, "RGB poza zakresem 0–1.");
	}
	if (mesh.uvs) {
		requireCondition(mesh.uvs instanceof Float32Array && mesh.uvs.length === n * 2, "Niezgodna długość UV.");
		for (const uv of mesh.uvs) finite(uv, "UV");
	}
	if (mesh.textureUrl !== void 0) {
		assertTexture(mesh.textureUrl);
		requireCondition(!!mesh.uvs, "Tekstura wymaga współrzędnych UV.");
	}
}
function checkSource(value) {
	requireCondition(value === void 0 || value === "synthetic" || value === "imported", "Nieprawidłowe pochodzenie siatki.");
}
function assertTexture(value) {
	requireCondition(typeof value === "string" && value.length <= Math.ceil(LIMITS.textureBytes / 3) * 4 + 64, "Przekroczony limit tekstury.");
	requireCondition(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value), "Dozwolone są wyłącznie osadzone PNG/JPEG.");
}
// OrthoSculptCAD/src/trimline/numerics.ts
var NumericsError = class extends Error {
	code;
	constructor(code) {
		super(code);
		this.code = code;
		this.name = "NumericsError";
	}
};
var contexts = /* @__PURE__ */ new WeakMap();
var rationals = /* @__PURE__ */ new WeakSet();
function createArithmeticContext(limits) {
	if (typeof limits !== "object" || limits === null) throw new NumericsError("INVALID_INPUT");
	const bitsDescriptor = Object.getOwnPropertyDescriptor(limits, "maxBits");
	const opsDescriptor = Object.getOwnPropertyDescriptor(limits, "maxOperations");
	if (!bitsDescriptor || !opsDescriptor || !("value" in bitsDescriptor) || !("value" in opsDescriptor)) throw new NumericsError("INVALID_INPUT");
	const maxBits = bitsDescriptor.value;
	const maxOperations = opsDescriptor.value;
	if (typeof maxBits !== "number" || !Number.isInteger(maxBits) || maxBits < 1 || maxBits > 4096 || typeof maxOperations !== "number" || !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 2e6) throw new NumericsError("INVALID_INPUT");
	const ctx = Object.freeze(Object.create(null));
	const ceiling = 1n << BigInt(maxBits);
	contexts.set(ctx, {
		maxBits,
		ceiling,
		floor: -ceiling,
		remaining: maxOperations
	});
	return ctx;
}
function enter(ctx) {
	const budget = contexts.get(ctx);
	if (!budget) throw new NumericsError("INVALID_INPUT");
	charge(budget);
	return budget;
}
function charge(budget, units = 1) {
	if (budget.remaining < units) {
		budget.remaining = 0;
		throw new NumericsError("BUDGET_EXCEEDED");
	}
	budget.remaining -= units;
}
function size(value, budget) {
	charge(budget, 2);
	if (value >= budget.ceiling || value <= budget.floor) throw new NumericsError("BUDGET_EXCEEDED");
}
function width(value, budget) {
	size(value, budget);
	charge(budget, 4);
	return value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length;
}
function product(a, b, budget) {
	if (width(a, budget) + width(b, budget) > budget.maxBits) throw new NumericsError("BUDGET_EXCEEDED");
	charge(budget);
	return a * b;
}
function sum(a, b, subtract, budget) {
	if (Math.max(width(a, budget), width(b, budget)) + 1 > budget.maxBits) throw new NumericsError("BUDGET_EXCEEDED");
	charge(budget);
	return subtract ? a - b : a + b;
}
function normalize(n, d, budget) {
	size(n, budget);
	size(d, budget);
	charge(budget, 5);
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	let a = n < 0n ? -n : n;
	let b = d;
	while (true) {
		charge(budget);
		if (b === 0n) break;
		charge(budget);
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	charge(budget, 2);
	const value = Object.freeze({
		n: n / a,
		d: d / a
	});
	rationals.add(value);
	return value;
}
function rational(n, d, ctx) {
	const budget = enter(ctx);
	if (typeof n !== "bigint" || typeof d !== "bigint" || d === 0n) throw new NumericsError("INVALID_INPUT");
	return normalize(n, d, budget);
}
function operands(a, b, ctx) {
	const budget = enter(ctx);
	validateValue(a, budget);
	validateValue(b, budget);
	return budget;
}
function validateValue(value, budget) {
	if (!rationals.has(value)) throw new NumericsError("INVALID_INPUT");
	size(value.n, budget);
	size(value.d, budget);
}
function add(a, b, ctx) {
	const budget = operands(a, b, ctx);
	return normalize(sum(product(a.n, b.d, budget), product(b.n, a.d, budget), false, budget), product(a.d, b.d, budget), budget);
}
function subtract(a, b, ctx) {
	const budget = operands(a, b, ctx);
	return normalize(sum(product(a.n, b.d, budget), product(b.n, a.d, budget), true, budget), product(a.d, b.d, budget), budget);
}
function multiply(a, b, ctx) {
	const budget = operands(a, b, ctx);
	return normalize(product(a.n, b.n, budget), product(a.d, b.d, budget), budget);
}
function compare(a, b, ctx) {
	const budget = operands(a, b, ctx);
	const left = product(a.n, b.d, budget);
	const right = product(b.n, a.d, budget);
	charge(budget, 2);
	return left < right ? -1 : left > right ? 1 : 0;
}
function shiftLeft(value, places, budget) {
	const bits = width(value, budget);
	if (places < 0 || !Number.isInteger(places) || bits + places > budget.maxBits) throw new NumericsError("BUDGET_EXCEEDED");
	charge(budget, 2);
	return value << BigInt(places);
}
function fromFloat32Bits(bits, ctx) {
	const budget = enter(ctx);
	if (typeof bits !== "number" || !Number.isInteger(bits) || bits < 0 || bits > 4294967295) throw new NumericsError("INVALID_INPUT");
	const exponent = bits >>> 23 & 255;
	if (exponent === 255) throw new NumericsError("INVALID_INPUT");
	const fraction = bits & 8388607;
	const significand = exponent === 0 ? fraction : fraction + 8388608;
	if (budget.maxBits < 24 && significand >= 2 ** budget.maxBits) throw new NumericsError("BUDGET_EXCEEDED");
	charge(budget);
	let n = BigInt(significand);
	let d = 1n;
	charge(budget);
	if (n === 0n) return normalize(0n, 1n, budget);
	const power = exponent === 0 ? -149 : exponent - 150;
	if (power < 0) d = shiftLeft(d, -power, budget);
	else n = shiftLeft(n, power, budget);
	if (bits >>> 31 !== 0) {
		charge(budget);
		n = -n;
	}
	return normalize(n, d, budget);
}
// OrthoSculptCAD/src/trimline/face-cubic.ts
var FaceCubicError = class extends Error {
	code;
	constructor(code) {
		super(code);
		this.code = code;
		this.name = "FaceCubicError";
	}
};
function ownData$1(object, key) {
	const descriptor = Object.getOwnPropertyDescriptor(object, key);
	if (!descriptor || !("value" in descriptor)) throw new FaceCubicError("INVALID_INPUT");
	return descriptor.value;
}
function snapshotArray(input, length) {
	if (!Array.isArray(input) || ownData$1(input, "length") !== length) throw new FaceCubicError("INVALID_INPUT");
	const result = [];
	for (let i = 0; i < length; i++) result.push(ownData$1(input, String(i)));
	return result;
}
function snapshotMatrix(input, rows) {
	const root = snapshotArray(input, rows);
	const result = [];
	for (let i = 0; i < rows; i++) result.push(Object.freeze(snapshotArray(root[i], 3)));
	return Object.freeze(result);
}
function certifyFaceCubic(triangle, barycentricControls, ctx) {
	triangle = snapshotMatrix(triangle, 3);
	barycentricControls = snapshotMatrix(barycentricControls, 4);
	const zero = rational(0n, 1n, ctx);
	const one = rational(1n, 1n, ctx);
	for (let i = 0; i < 3; i++) for (let axis = 0; axis < 3; axis++) compare(triangle[i][axis], zero, ctx);
	for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) compare(barycentricControls[i][axis], zero, ctx);
	const e = [], g = [];
	for (let axis = 0; axis < 3; axis++) {
		e.push(subtract(triangle[1][axis], triangle[0][axis], ctx));
		g.push(subtract(triangle[2][axis], triangle[0][axis], ctx));
	}
	let noncollinear = false;
	for (const [r, s] of [
		[0, 1],
		[0, 2],
		[1, 2]
	]) if (compare(subtract(multiply(e[r], g[s], ctx), multiply(e[s], g[r], ctx), ctx), zero, ctx) !== 0) {
		noncollinear = true;
		break;
	}
	if (!noncollinear) throw new FaceCubicError("DEGENERATE_TRIANGLE");
	for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) if (compare(barycentricControls[i][axis], zero, ctx) < 0) throw new FaceCubicError("INVALID_BARYCENTRIC");
	for (let i = 0; i < 4; i++) if (compare(add(add(barycentricControls[i][0], barycentricControls[i][1], ctx), barycentricControls[i][2], ctx), one, ctx) !== 0) throw new FaceCubicError("INVALID_BARYCENTRIC");
	const controls = [];
	for (let i = 0; i < 4; i++) {
		const point = [];
		for (let axis = 0; axis < 3; axis++) point.push(add(add(multiply(barycentricControls[i][0], triangle[0][axis], ctx), multiply(barycentricControls[i][1], triangle[1][axis], ctx), ctx), multiply(barycentricControls[i][2], triangle[2][axis], ctx), ctx));
		controls.push(Object.freeze(point));
	}
	return Object.freeze({
		kind: "supplied-face-cubic-hull-v1",
		triangle,
		barycentricControls,
		controls: Object.freeze(controls)
	});
}
// OrthoSculptCAD/src/trimline/source-candidate.ts
var SourceCandidateError = class extends Error {
	code;
	constructor(code) {
		super(code);
		this.code = code;
		this.name = "SourceCandidateError";
	}
};
var typed = Object.getPrototypeOf(Float32Array.prototype);
var nativeBuffer = Object.getOwnPropertyDescriptor(typed, "buffer").get;
var nativeOffset = Object.getOwnPropertyDescriptor(typed, "byteOffset").get;
var nativeBytes = Object.getOwnPropertyDescriptor(typed, "byteLength").get;
var nativeKind = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
var nativeBufferBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
var nativeResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable").get;
function invalid() {
	throw new SourceCandidateError("INVALID_INPUT");
}
function validationFailure(error) {
	if (error instanceof RangeError) throw error;
	return invalid();
}
function ownData(object, key, optional = false) {
	if (typeof object !== "object" || object === null) return invalid();
	const d = Object.getOwnPropertyDescriptor(object, key);
	if (!d && optional) return void 0;
	if (!d || !("value" in d)) return invalid();
	return d.value;
}
function viewSize(input, prototype) {
	if (typeof input !== "object" || input === null || Object.getPrototypeOf(input) !== prototype) return invalid();
	try {
		if (nativeKind.call(input) !== (prototype === Float32Array.prototype ? "Float32Array" : "Uint32Array")) return invalid();
		const buffer = nativeBuffer.call(input);
		if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || nativeResizable.call(buffer)) return invalid();
		const bytes = nativeBytes.call(input), offset = nativeOffset.call(input);
		if (bytes === 0 || offset + bytes > nativeBufferBytes.call(buffer)) return invalid();
		return bytes;
	} catch {
		return invalid();
	}
}
function preflight(input, stampInput) {
	const positions = ownData(input, "positions");
	const indices = ownData(input, "indices");
	const pBytes = viewSize(positions, Float32Array.prototype), iBytes = viewSize(indices, Uint32Array.prototype);
	const vertices = pBytes / 12, faces = iBytes / 12;
	if (!Number.isInteger(vertices) || vertices < 3 || vertices > 2e5 || !Number.isInteger(faces) || faces < 1 || faces > 2e5) return invalid();
	const colors = ownData(input, "colors", true);
	const uvs = ownData(input, "uvs", true);
	if (colors !== void 0 && viewSize(colors, Float32Array.prototype) !== vertices * 12) return invalid();
	if (uvs !== void 0 && viewSize(uvs, Float32Array.prototype) !== vertices * 8) return invalid();
	const name = ownData(input, "name");
	if (typeof name !== "string" || name.length > 200 || /[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(name)) return invalid();
	const source = ownData(input, "source", true);
	if (source !== void 0 && source !== "synthetic" && source !== "imported") return invalid();
	const textureUrl = ownData(input, "textureUrl", true);
	if (textureUrl !== void 0) {
		try {
			assertTexture(textureUrl);
		} catch (error) {
			return validationFailure(error);
		}
		if (uvs === void 0) return invalid();
	}
	const integer = (key) => {
		const value = ownData(stampInput, key);
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
		return value;
	};
	const projectEpoch = integer("projectEpoch"), revision = integer("revision"), generation = integer("generation");
	if (ownData(stampInput, "units") !== "mm" || ownData(stampInput, "unitsConfirmed") !== true) return invalid();
	const frameId = ownData(stampInput, "frameId");
	if (typeof frameId !== "string" || frameId.length < 1 || frameId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(frameId)) return invalid();
	return {
		mesh: {
			positions,
			indices,
			colors,
			uvs,
			name,
			source,
			textureUrl
		},
		stamp: Object.freeze({
			projectEpoch,
			revision,
			generation,
			units: "mm",
			unitsConfirmed: true,
			frameId
		})
	};
}
var encoder = new TextEncoder();
var domain = "OrthoSculptSourceCandidate\0";
var nextSourceId = 0n;
function utf8Length(text) {
	let n = 0;
	for (const scalar of text) {
		const cp = scalar.codePointAt(0);
		n += cp <= 127 ? 1 : cp <= 2047 ? 2 : cp <= 65535 ? 3 : 4;
	}
	return n;
}
function copyView(input) {
	const bytes = nativeBytes.call(input);
	const target = new ArrayBuffer(bytes);
	new Uint8Array(target).set(new Uint8Array(nativeBuffer.call(input), nativeOffset.call(input), bytes));
	return Object.getPrototypeOf(input) === Uint32Array.prototype ? new Uint32Array(target) : new Float32Array(target);
}
function sourceBufferBytes(mesh) {
	return [
		mesh.positions,
		mesh.indices,
		mesh.colors,
		mesh.uvs
	].reduce((sum, a) => sum + (a === void 0 ? 0 : nativeBytes.call(a)), 0);
}
function preimageSize(mesh, stamp) {
	return 39 + sourceBufferBytes(mesh) + 2 + 1 + 4 + utf8Length(mesh.name) + 1 + (mesh.textureUrl === void 0 ? 0 : 4 + utf8Length(mesh.textureUrl)) + 4 + 2 + 1 + 4 + utf8Length(stamp.frameId);
}
function preimage(mesh, stamp) {
	const bytes = new Uint8Array(new ArrayBuffer(preimageSize(mesh, stamp)));
	const data = new DataView(bytes.buffer);
	let offset = 0;
	const u8 = (n) => {
		bytes[offset++] = n;
	};
	const u32 = (n) => {
		data.setUint32(offset, n, true);
		offset += 4;
	};
	const text = (s) => {
		const length = utf8Length(s);
		u32(length);
		encoder.encodeInto(s, bytes.subarray(offset, offset + length));
		offset += length;
	};
	encoder.encodeInto(domain, bytes);
	offset = 27;
	u32(1);
	u32(mesh.positions.length / 3);
	u32(mesh.indices.length / 3);
	const raw = (a) => {
		for (const n of new Uint32Array(a.buffer, a.byteOffset, a.length)) u32(n);
	};
	raw(mesh.positions);
	raw(mesh.indices);
	for (const a of [mesh.colors, mesh.uvs]) {
		u8(a === void 0 ? 0 : 1);
		if (a) raw(a);
	}
	u8(mesh.source === void 0 ? 0 : mesh.source === "synthetic" ? 1 : 2);
	text(mesh.name);
	u8(mesh.textureUrl === void 0 ? 0 : 1);
	if (mesh.textureUrl !== void 0) text(mesh.textureUrl);
	text(stamp.units);
	u8(1);
	text(stamp.frameId);
	return bytes;
}
function createSourceCandidateStore(limits) {
	const maxOwnedBufferBytes = ownData(limits, "maxOwnedBufferBytes");
	if (typeof maxOwnedBufferBytes !== "number" || !Number.isSafeInteger(maxOwnedBufferBytes) || maxOwnedBufferBytes < 1 || maxOwnedBufferBytes > 134217728) return invalid();
	let reservedBufferBytes = 0;
	const sources = /* @__PURE__ */ new WeakMap();
	const retired = /* @__PURE__ */ new WeakSet();
	let closed = false, pending = false;
	let live;
	function authenticate(source) {
		if (closed) throw new SourceCandidateError("STALE_SOURCE");
		const owned = sources.get(source);
		if (!owned) throw new SourceCandidateError(retired.has(source) ? "STALE_SOURCE" : "INVALID_INPUT");
		return owned;
	}
	function release(source) {
		if (retired.has(source)) return;
		const owned = sources.get(source);
		if (!owned) throw new SourceCandidateError("INVALID_INPUT");
		reservedBufferBytes -= owned.bufferBytes;
		sources.delete(source);
		retired.add(source);
		live = void 0;
	}
	function resolveFace(source, sourceFace, ctx) {
		const owned = authenticate(source);
		if (typeof sourceFace !== "number" || !Number.isInteger(sourceFace) || sourceFace < 0 || sourceFace >= owned.description.faceCount) return invalid();
		const vertexIDs = Object.freeze([
			owned.mesh.indices[3 * sourceFace],
			owned.mesh.indices[3 * sourceFace + 1],
			owned.mesh.indices[3 * sourceFace + 2]
		]);
		const words = new Uint32Array(owned.mesh.positions.buffer);
		const positionBits = Object.freeze(vertexIDs.map((id) => Object.freeze([
			words[3 * id],
			words[3 * id + 1],
			words[3 * id + 2]
		])));
		const triangle = Object.freeze(positionBits.map((row) => Object.freeze(row.map((bits) => fromFloat32Bits(bits, ctx)))));
		return Object.freeze({
			source: owned.description,
			sourceFace,
			vertexIDs,
			positionBits,
			triangle
		});
	}
	return {
		async capture(mesh, stamp) {
			if (closed) throw new SourceCandidateError("STALE_SOURCE");
			if (live || pending) throw new SourceCandidateError("SOURCE_IN_USE");
			pending = true;
			let reservation = 0;
			let snapshot, hashInput;
			try {
				const prepared = preflight(mesh, stamp);
				mesh = prepared.mesh;
				const sourceBytes = sourceBufferBytes(mesh);
				const total = sourceBytes + preimageSize(mesh, prepared.stamp);
				if (!Number.isSafeInteger(total) || total + reservedBufferBytes > maxOwnedBufferBytes) throw new SourceCandidateError("BUDGET_EXCEEDED");
				reservation = total;
				reservedBufferBytes += total;
				snapshot = {
					name: mesh.name,
					source: mesh.source,
					positions: copyView(mesh.positions),
					indices: copyView(mesh.indices),
					...mesh.colors === void 0 ? {} : { colors: copyView(mesh.colors) },
					...mesh.uvs === void 0 ? {} : { uvs: copyView(mesh.uvs) },
					textureUrl: mesh.textureUrl
				};
				try {
					assertMesh(snapshot);
				} catch (error) {
					return validationFailure(error);
				}
				const ownedStamp = prepared.stamp;
				hashInput = preimage(snapshot, ownedStamp);
				const hash = await globalThis.crypto.subtle.digest("SHA-256", hashInput);
				if (closed) throw new SourceCandidateError("STALE_SOURCE");
				const sourceDigest = "sha256:" + Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
				const handle = Object.freeze(Object.create(null));
				sources.set(handle, {
					mesh: snapshot,
					bufferBytes: sourceBytes,
					description: Object.freeze({
						kind: "owned-source-candidate-v1",
						sourceId: `source-candidate-${++nextSourceId}`,
						sourceDigest,
						stamp: ownedStamp,
						vertexCount: snapshot.positions.length / 3,
						faceCount: snapshot.indices.length / 3
					})
				});
				live = handle;
				reservation -= sourceBytes;
				return handle;
			} catch (error) {
				if (closed) throw new SourceCandidateError("STALE_SOURCE");
				if (error instanceof SourceCandidateError) throw error;
				throw new SourceCandidateError("UNAVAILABLE");
			} finally {
				reservedBufferBytes -= reservation;
				snapshot = void 0;
				hashInput = void 0;
				pending = false;
			}
		},
		describe(source) {
			return authenticate(source).description;
		},
		release,
		dispose() {
			if (live) release(live);
			closed = true;
		},
		resolveFace,
		bindFaceCubic(source, sourceFace, controls, ctx) {
			const face = resolveFace(source, sourceFace, ctx);
			return Object.freeze({
				kind: "candidate-source-face-cubic-v1",
				face,
				containment: certifyFaceCubic(face.triangle, controls, ctx)
			});
		}
	};
}
// AppData/Local/hermes/cache/scratch/v03-source-candidate-native-runtime/worker.ts
var assert = (ok, message) => {
	if (!ok) throw Error(message);
};
var arithmetic = createArithmeticContext({
	maxBits: 4096,
	maxOperations: 2e6
});
var stores = /* @__PURE__ */ new Set();
var store = () => {
	const s = createSourceCandidateStore({ maxOwnedBufferBytes: 1048576 });
	stores.add(s);
	return s;
};
var trace = [];
var digests = [];
var event = (kind, details = {}) => trace.push({
	kind,
	at: performance.now(),
	...details
});
var hex = (a) => Array.from(a instanceof Uint8Array ? a : new Uint8Array(a), (n) => n.toString(16).padStart(2, "0")).join("");
var subtle = crypto.subtle;
var nativeMethod = subtle.digest;
var originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
var nativeFunction = Function.prototype.toString.call(nativeMethod);
assert(nativeFunction.includes("[native code]"), "Expected actual native WebCrypto digest");
var digestLabel = "";
var gate;
Object.defineProperty(subtle, "digest", {
	configurable: true,
	writable: true,
	value: async function(algorithm, data) {
		const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
		const record = {
			label: digestLabel,
			algorithm,
			preimageHex: hex(bytes),
			nativeSettled: false,
			digestHex: "",
			gated: !!gate
		};
		digests.push(record);
		event("native-digest-call", { label: digestLabel });
		const thisGate = gate;
		const result = await Reflect.apply(nativeMethod, subtle, [algorithm, data]);
		record.nativeSettled = true;
		record.digestHex = hex(result);
		event("native-promise-fulfilled-observed", { label: record.label });
		if (thisGate) {
			thisGate.nativeSettled = true;
			await thisGate.wait;
			event("real-native-hash-returned-after-test-gate");
		}
		return result;
	}
});
function frozen(value) {
	if (!value || typeof value !== "object") return 0;
	assert(!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer), "public result leaked a view/buffer");
	assert(Object.isFrozen(value), "public result not frozen inside Worker");
	return 1 + Object.values(value).reduce((sum, child) => sum + frozen(child), 0);
}
function uints(values, length) {
	assert(Array.isArray(values) && values.length <= 6e5, "Invalid oracle integer array");
	if (length !== void 0) assert(values.length === length, "Oracle integer array length");
	for (let i = 0; i < values.length; i++) assert(Object.hasOwn(values, i) && typeof values[i] === "number" && Number.isSafeInteger(values[i]) && values[i] >= 0 && values[i] <= 4294967295, "Invalid oracle uint32");
}
function validateFixture(f) {
	assert(f.format === "OrthoSculptSourceCandidateOracle" && f.version === 1, "Fixture contract");
	assert(Array.isArray(f.cases) && f.cases.length > 0 && f.cases.length <= 32, "Fixture cap");
	const ids = /* @__PURE__ */ new Set();
	for (const c of f.cases) {
		assert(typeof c.id === "string" && !ids.has(c.id), "Fixture unique case id");
		ids.add(c.id);
		const { mesh: m, expected: e } = c;
		for (const n of [
			e.vertexCount,
			e.faceCount,
			c.stamp.projectEpoch,
			c.stamp.revision,
			c.stamp.generation
		]) assert(Number.isSafeInteger(n) && n >= 0, "Fixture safe integer");
		assert(e.vertexCount >= 3 && e.vertexCount <= 2e5 && e.faceCount >= 1 && e.faceCount <= 2e5, "Fixture geometry cap");
		uints(m.positionsBits, e.vertexCount * 3);
		uints(m.indices, e.faceCount * 3);
		for (const id of m.indices) assert(id < e.vertexCount, "Fixture index range");
		if (m.colorsBits !== void 0) uints(m.colorsBits, e.vertexCount * 3);
		if (m.uvsBits !== void 0) uints(m.uvsBits, e.vertexCount * 2);
		for (const bits of [
			m.positionsBits,
			m.colorsBits,
			m.uvsBits
		]) if (bits) for (const n of bits) assert((n >>> 23 & 255) !== 255, "Fixture nonfinite bits");
		assert(e.faces.length === e.faceCount, "Fixture faces length");
		for (const [ordinal, f] of e.faces.entries()) {
			assert(Number.isSafeInteger(f.sourceFace) && f.sourceFace === ordinal, "Fixture face ordinal");
			uints(f.vertexIDs, 3);
			for (const id of f.vertexIDs) assert(id < e.vertexCount, "Fixture vertex id");
			assert(f.positionBits.length === 3, "Fixture position rows");
			for (const row of f.positionBits) uints(row, 3);
			assert(f.triangle.length === 3, "Fixture triangle rows");
			for (const row of f.triangle) {
				assert(row.length === 3, "Fixture triangle columns");
				for (const r of row) assert(typeof r.n === "string" && /^(0|-?[1-9][0-9]*)$/.test(r.n) && typeof r.d === "string" && /^[1-9][0-9]*$/.test(r.d), "Fixture literal Rat n/d");
			}
		}
	}
	event("all-fixture-integers-validated-before-typed-arrays");
}
function fixtureMesh(m) {
	const f32 = (bits) => new Float32Array(new Uint32Array(bits).buffer);
	return {
		name: m.name,
		positions: f32(m.positionsBits),
		indices: new Uint32Array(m.indices),
		source: m.source,
		textureUrl: m.textureUrl,
		...m.colorsBits === void 0 ? {} : { colors: f32(m.colorsBits) },
		...m.uvsBits === void 0 ? {} : { uvs: f32(m.uvsBits) }
	};
}
var stamp = () => ({
	projectEpoch: 1,
	revision: 2,
	generation: 3,
	units: "mm",
	unitsConfirmed: true,
	frameId: "frame_1"
});
var mesh = () => ({
	name: "TESTDATA S 🦴",
	source: "synthetic",
	positions: new Float32Array([
		2,
		0,
		-0,
		3,
		0,
		0,
		2,
		1,
		0,
		2,
		0,
		1
	]),
	indices: new Uint32Array([
		0,
		2,
		1,
		0,
		1,
		3,
		1,
		2,
		3,
		2,
		0,
		3
	]),
	colors: (/* @__PURE__ */ new Float32Array(12)).fill(.5),
	uvs: /* @__PURE__ */ new Float32Array(8),
	textureUrl: "data:image/png;base64,AAAA"
});
var code = (fn) => {
	try {
		fn();
		return "ACCEPTED";
	} catch (e) {
		assert(e.name === "SourceCandidateError" && e.message === e.code, "Unexpected source exception");
		return e.code;
	}
};
var auth;
async function command(name, payload) {
	if (name === "oracle") {
		validateFixture(payload);
		const results = [];
		for (const c of payload.cases) {
			const s = store();
			digestLabel = c.id;
			try {
				const h = await s.capture(fixtureMesh(c.mesh), c.stamp), description = s.describe(h);
				assert(Reflect.ownKeys(h).length === 0, "Opaque handle own keys");
				let frozenNodes = frozen(h) + frozen(description);
				const faces = [];
				for (let f = 0; f < description.faceCount; f++) {
					const actual = s.resolveFace(h, f, arithmetic);
					frozenNodes += frozen(actual);
					faces.push(actual);
				}
				results.push({
					id: c.id,
					description,
					faces,
					frozenNodes,
					publicBuffers: 0
				});
			} finally {
				s.dispose();
			}
		}
		return {
			cases: results,
			sharedCumulativeArithmeticContext: true
		};
	}
	if (name === "mutation") {
		const m = mesh(), st = stamp(), s = store();
		let getterTouches = 0;
		const refs = [];
		for (const key of [
			"positions",
			"indices",
			"colors",
			"uvs"
		]) {
			const original = m[key], bytes = original.byteLength, length = original.length;
			const buffer = new ArrayBuffer(bytes + 16);
			new Uint8Array(buffer, 8, bytes).set(new Uint8Array(original.buffer));
			const view = key === "indices" ? new Uint32Array(buffer, 8, length) : new Float32Array(buffer, 8, length);
			for (const field of [
				"buffer",
				"byteOffset",
				"byteLength",
				"length",
				"slice",
				Symbol.iterator
			]) Object.defineProperty(view, field, { get() {
				getterTouches++;
				throw Error("test-only shadow getter touched");
			} });
			Object.assign(m, { [key]: view });
			refs.push({
				view,
				length
			});
		}
		try {
			digestLabel = "mutation";
			const p = s.capture(m, st);
			event("capture-returned-promise-before-caller-mutation");
			for (const { view, length } of refs) for (let i = 0; i < length; i++) view[i] = 99;
			m.name = "TESTDATA changed";
			m.textureUrl = "data:image/jpeg;base64,BBBB";
			st.revision = 90;
			event("worker-local-caller-input-mutated-before-await");
			const h = await p, description = s.describe(h), face = s.resolveFace(h, 1, arithmetic);
			return {
				description,
				face,
				getterTouches,
				frozenNodes: frozen(h) + frozen(description) + frozen(face),
				mutatedViews: refs.length,
				nonzeroByteOffset: 8
			};
		} finally {
			s.dispose();
		}
	}
	if (name === "gate-start") {
		assert(!gate, "Only one gate");
		let open;
		gate = {
			wait: new Promise((resolve) => {
				open = resolve;
			}),
			open: () => open(),
			nativeSettled: false,
			captureSettled: false,
			published: false,
			s: store()
		};
		digestLabel = "pending-dispose";
		const p = gate.s.capture(mesh(), stamp());
		gate.observed = p.then(() => {
			gate.captureSettled = true;
			gate.published = true;
			return { published: true };
		}, (e) => {
			gate.captureSettled = true;
			event("capture-rejected", { code: e.code });
			return {
				published: false,
				name: e.name,
				message: e.message,
				code: e.code
			};
		});
		gate.busyCode = await gate.s.capture(null, null).then(() => "ACCEPTED", (e) => e.code);
		event("test-gate-capture-dispatched");
		return {
			busyCode: gate.busyCode,
			captureSettled: gate.captureSettled
		};
	}
	if (name === "gate-dispose") {
		assert(gate, "Gate absent");
		const deadline = performance.now() + 1e4;
		while (!gate.nativeSettled && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1));
		assert(gate.nativeSettled, "Native promise did not fulfill within bound");
		gate.s.dispose();
		gate.s.dispose();
		event("store-disposed-with-test-gate-closed");
		const closedCode = await gate.s.capture(null, null).then(() => "ACCEPTED", (e) => e.code);
		return {
			nativePromiseFulfillmentObserved: gate.nativeSettled,
			captureSettled: gate.captureSettled,
			published: gate.published,
			closedCode
		};
	}
	if (name === "gate-open") {
		event("test-gate-opened");
		gate.open();
		const state = {
			...await gate.observed,
			captureSettled: gate.captureSettled,
			nativePromiseFulfillmentObserved: gate.nativeSettled,
			describeClosed: code(() => gate.s.describe({}))
		};
		gate = void 0;
		return state;
	}
	if (name === "auth-start") {
		const s = store(), other = store();
		digestLabel = "auth-primary";
		const h = await s.capture(mesh(), stamp());
		digestLabel = "auth-foreign";
		const foreign = await other.capture(mesh(), stamp());
		auth = {
			s,
			other,
			h,
			foreign
		};
		const localClone = structuredClone(h), jsonClone = JSON.parse(JSON.stringify(h));
		const attempts = {};
		for (const [label, fake] of [
			["structuredClone", localClone],
			["JSON", jsonClone],
			["foreignStore", foreign]
		]) attempts[label] = {
			describe: code(() => s.describe(fake)),
			resolve: code(() => s.resolveFace(fake, -1, arithmetic)),
			bind: code(() => s.bindFaceCubic(fake, -1, null, arithmetic)),
			release: code(() => s.release(fake))
		};
		return {
			attempts,
			primaryId: s.describe(h).sourceId,
			foreignId: other.describe(foreign).sourceId,
			authHandle: h,
			frozenNodes: frozen(h)
		};
	}
	if (name === "auth-return") {
		const { s, other, h } = auth, clone = payload.handle;
		const open = {
			describe: code(() => s.describe(clone)),
			resolve: code(() => s.resolveFace(clone, -1, arithmetic)),
			bind: code(() => s.bindFaceCubic(clone, -1, null, arithmetic)),
			release: code(() => s.release(clone))
		};
		s.release(h);
		s.release(h);
		const retired = {
			real: code(() => s.describe(h)),
			clone: code(() => s.describe(clone))
		};
		s.dispose();
		s.dispose();
		const closed = {
			real: code(() => s.describe(h)),
			clone: code(() => s.describe(clone)),
			resolveClone: code(() => s.resolveFace(clone, -1, arithmetic)),
			bindClone: code(() => s.bindFaceCubic(clone, -1, null, arithmetic)),
			releaseClone: code(() => s.release(clone)),
			releaseRetired: code(() => s.release(h))
		};
		other.dispose();
		auth = void 0;
		return {
			nativePostMessageRoundTrip: true,
			open,
			retired,
			closed
		};
	}
	if (name === "bind") {
		const s = store();
		digestLabel = "bind";
		try {
			const h = await s.capture(mesh(), stamp()), q = (n, d = 1n) => rational(n, d, arithmetic);
			const face = s.resolveFace(h, 1, arithmetic);
			const weights = [
				[
					q(1n),
					q(0n),
					q(0n)
				],
				[
					q(2n, 3n),
					q(1n, 3n),
					q(0n)
				],
				[
					q(1n, 3n),
					q(2n, 3n),
					q(0n)
				],
				[
					q(0n),
					q(1n),
					q(0n)
				]
			];
			const span = s.bindFaceCubic(h, 1, weights, arithmetic);
			const tiny = createArithmeticContext({
				maxBits: 4096,
				maxOperations: 1
			});
			const exhaustedCodes = [];
			for (let i = 0; i < 2; i++) try {
				rational(0n, 1n, tiny);
				exhaustedCodes.push("ACCEPTED");
			} catch (e) {
				exhaustedCodes.push(e.code);
			}
			return {
				face,
				span,
				frozenNodes: frozen(face) + frozen(span),
				sharedCumulativeArithmeticContext: true,
				exhaustedCodes
			};
		} finally {
			s.dispose();
		}
	}
	if (name === "finish") {
		for (const s of stores) s.dispose();
		if (originalDescriptor) Object.defineProperty(subtle, "digest", originalDescriptor);
		else delete subtle.digest;
		return {
			nativeFunction,
			digestRestored: subtle.digest === nativeMethod,
			digests,
			trace,
			userAgent: navigator.userAgent,
			secureContext: isSecureContext,
			crossOriginIsolated,
			sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
			notes: "Native promise fulfillment observed by JS, not crypto internal thread completion measurement. No native cancellation/RSS/GC claim."
		};
	}
	throw Error("Unknown test-only command");
}
self.addEventListener("message", async (e) => {
	const { id, name, payload } = e.data;
	event("native-worker-message-received", {
		id,
		name
	});
	try {
		const result = await command(name, payload);
		self.postMessage({
			id,
			ok: true,
			result
		});
	} catch (error) {
		self.postMessage({
			id,
			ok: false,
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
	}
});

//# sourceMappingURL=worker.js.map