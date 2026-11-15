const DEFAULT_CONTROLS = Object.freeze({
	maxLeases: 1024,
	maxRefs: 8192,
	maxRealms: 32,
	maxPlanEntries: 1024,
	maxKeyLength: 128
});
const NativeBuffer = ArrayBuffer;
const nativeLength = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, "byteLength").get;
const nativeResizable = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, "resizable")?.get;
/** ArrayBuffer only: ingress adapters must pass a view's actual .buffer. */
function backingBytes(b) {
	try {
		const n = nativeLength.call(b);
		if (nativeResizable?.call(b)) invalid();
		new Uint8Array(b, 0, 0);
		size(n);
		return n;
	} catch {
		return invalid();
	}
}
function detached(b) {
	try {
		new Uint8Array(b, 0, 0);
		return false;
	} catch {
		return true;
	}
}
const BUDGET = Object.freeze({
	ok: false,
	code: "BUDGET"
});
function invalid() {
	throw Object.assign(new Error("Invalid ledger input"), { code: "INVALID_INPUT" });
}
function category(c) {
	if (c !== "resident" && c !== "job" && c !== "history") invalid();
}
function size(n) {
	if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) invalid();
}
/** Proposed managed-payload policy; not a process/JS heap/RSS limit. */
export const DEFAULT_RESOURCE_LIMITS = Object.freeze({
	managed: 402653184,
	job: 134217728,
	history: 134217728
});
export function createResourceLedger(limits = DEFAULT_RESOURCE_LIMITS, internals = {}) {
	return createLedgerCore(limits, internals).ledger;
}
/** Internal composition only; never re-export from the public compute API. */
export function createNativeLedger(limits = DEFAULT_RESOURCE_LIMITS) {
	return Object.freeze(createLedgerCore(limits, {}, true));
}
function createLedgerCore(limits, internals, native = false) {
	for (const n of [
		limits.managed,
		limits.job,
		limits.history
	]) size(n);
	const caps = Object.freeze({ ...limits });
	const controls = Object.freeze({
		...DEFAULT_CONTROLS,
		...internals.controls
	});
	for (const n of Object.values(controls)) size(n);
	let activeLeases = 0, activeRefs = 0;
	function room(n, a = 0) {
		return activeRefs + n <= controls.maxRefs && refId <= Number.MAX_SAFE_INTEGER - n && allocationId <= Number.MAX_SAFE_INTEGER - a;
	}
	const allocate = internals.allocate ?? ((n) => new ArrayBuffer(n));
	const realms = new WeakMap();
	let realmId = 0;
	const refs = new WeakMap();
	const leases = new WeakMap();
	const allocations = new Set();
	const backings = new WeakMap();
	const tickets = new WeakMap();
	function accessible(a) {
		if (a.phase && a.phase !== "MAIN") invalid();
	}
	function ticket(t, binding, phase) {
		const s = tickets.get(t);
		if (!s || s.binding !== binding || phase && s.phase !== phase) invalid();
		return s;
	}
	function sourceAuth(s, i) {
		const state = refs.get(s.input[i]);
		state.lease = s.source;
		state.key = s.sourceKeys[i];
		return state;
	}
	function restorePrepared(s, i) {
		const r = s.input[i];
		leases.get(s.controlled).refs.delete(r);
		const state = sourceAuth(s, i), original = leases.get(s.source);
		original.refs.add(r);
		if (state.key !== undefined) original.keys.set(state.key, r);
		state.allocation.phase = "MAIN";
	}
	const handoff = Object.freeze({
		sent(t, binding) {
			const s = ticket(t, binding, "PREPARED");
			for (const b of s.buffers) if (!detached(b)) invalid();
			for (let i = 0; i < s.allocations.length; i++) {
				const a = s.allocations[i], old = s.input[i], c = refs.get(old).category;
				backings.delete(s.buffers[i]);
				a.buffer = undefined;
				a.owner = s.target;
				a.phase = "IN_FLIGHT";
				s.controlledRefs.push(issue(s.controlled, a, c));
				retire(old);
				sourceAuth(s, i);
			}
			leases.get(s.source).prepared--;
			s.buffers = [];
			s.input = [];
			s.phase = "IN_FLIGHT";
		},
		received(t, binding) {
			const s = ticket(t, binding, "IN_FLIGHT");
			for (const a of s.allocations) a.phase = "REMOTE";
			s.phase = "REMOTE";
		},
		returned(t, binding, buffers) {
			const s = ticket(t, binding, "REMOTE");
			if (!Array.isArray(buffers) || buffers.length !== s.allocations.length) invalid();
			const seen = new Set();
			Array.from(buffers, (b, i) => {
				if (backingBytes(b) !== s.allocations[i].bytes || seen.has(b) || backings.has(b)) invalid();
				seen.add(b);
			});
			// No mutation until the entire authenticated expected group passed preflight.
			for (let i = 0; i < buffers.length; i++) {
				const a = s.allocations[i];
				a.phase = "RETURNING";
				a.buffer = buffers[i];
				a.owner = s.main;
				backings.set(buffers[i], a);
				a.phase = "MAIN";
			}
			s.phase = "MAIN";
		},
		publish(t, binding, consumer) {
			const s = ticket(t, binding, "MAIN");
			open(consumer);
			if (!room(s.allocations.length)) throw Object.assign(new Error("Ref capacity"), { code: "BUDGET" });
			const rr = s.allocations.map((a, i) => issue(consumer, a, refs.get(s.controlledRefs[i]).category));
			const buffers = s.allocations.map((a) => a.buffer);
			for (const r of s.controlledRefs) retire(r);
			s.controlled.close();
			s.controlledRefs = [];
			s.allocations = [];
			s.phase = "RETIRED";
			return Object.freeze({
				refs: Object.freeze(rr),
				buffers: Object.freeze(buffers)
			});
		},
		/** Only the owned native composition calls this AFTER successful terminate. */
		terminated(t, binding) {
			const s = ticket(t, binding);
			if (s.phase === "RETIRED") return;
			if (s.phase === "PREPARED") {
				for (let i = 0; i < s.allocations.length; i++) {
					const a = s.allocations[i];
					if (detached(s.buffers[i])) {
						backings.delete(s.buffers[i]);
						a.buffer = undefined;
						retire(s.input[i]);
						sourceAuth(s, i);
					} else restorePrepared(s, i);
				}
				leases.get(s.source).prepared--;
			} else for (const r of s.controlledRefs) retire(r);
			s.controlled.close();
			s.buffers = [];
			s.input = [];
			s.controlledRefs = [];
			s.allocations = [];
			s.phase = "RETIRED";
		},
		prepare(source, input, main, target, binding) {
			if (!native) invalid();
			open(source);
			realm(main);
			realm(target);
			if (!binding || typeof binding !== "object" || main === target || !Array.isArray(input) || !input.length || input.length > 16) invalid();
			const seen = new Set();
			const aa = Array.from(input, (r) => {
				const s = refs.get(r), a = s?.allocation;
				if (!s || s.lease !== source || !a || a.owner !== main || !a.buffer) invalid();
				accessible(a);
				if (seen.has(a)) invalid();
				seen.add(a);
				if (a.refs.size !== 1) throw Object.assign(new Error("Aliased backing"), { code: "TRANSFER_ALIASED" });
				if (backingBytes(a.buffer) !== a.bytes) invalid();
				return a;
			});
			if (activeLeases >= controls.maxLeases || !room(input.length)) throw Object.assign(new Error("Handoff capacity"), { code: "BUDGET" });
			const controlled = makeLease(), t = Object.freeze({}), sourceState = leases.get(source);
			const buffers = aa.map((a) => a.buffer);
			const sourceKeys = input.map((r) => refs.get(r).key);
			// Suspend caller authority before native dispatch. The sole owning ref moves
			// into the private lease without changing diagnostic identity or charges.
			// PREPARED denies all ordinary ref use; successful detach retires that old
			// public capability and rotates to a new private controlled ref.
			for (const r of input) {
				const state = refs.get(r);
				sourceState.refs.delete(r);
				if (state.key !== undefined) sourceState.keys.delete(state.key);
				state.lease = controlled;
				state.key = undefined;
				leases.get(controlled).refs.add(r);
			}
			sourceState.prepared++;
			for (const a of aa) a.phase = "PREPARED";
			tickets.set(t, {
				binding,
				phase: "PREPARED",
				source,
				sourceKeys,
				controlled,
				input: [...input],
				allocations: aa,
				main,
				target,
				buffers,
				controlledRefs: []
			});
			return t;
		},
		packet(t, binding) {
			const s = ticket(t, binding, "PREPARED");
			return {
				buffers: [...s.buffers],
				bytes: s.allocations.map((a) => a.bytes)
			};
		},
		sendThrew(t, binding) {
			const s = ticket(t, binding, "PREPARED");
			for (let i = 0; i < s.buffers.length; i++) if (backingBytes(s.buffers[i]) !== s.allocations[i].bytes) invalid();
			for (let i = 0; i < s.input.length; i++) restorePrepared(s, i);
			leases.get(s.source).prepared--;
			s.phase = "RETIRED";
			s.buffers = [];
			s.input = [];
			s.allocations = [];
			s.controlled.close();
		}
	});
	let allocationId = 0, refId = 0;
	function realm(r) {
		if (!realms.has(r)) invalid();
	}
	function counts() {
		let managed = 0, job = 0, history = 0;
		for (const a of allocations) {
			managed += a.bytes;
			const cs = new Set([...a.refs].map((r) => refs.get(r).category));
			if (cs.has("job")) job += a.bytes;
			if (cs.has("history")) history += a.bytes;
		}
		return {
			managed,
			job,
			history
		};
	}
	function fits(n) {
		return [
			"managed",
			"job",
			"history"
		].every((k) => Number.isSafeInteger(n[k]) && n[k] <= caps[k]);
	}
	function issue(lease, a, c, key) {
		activeRefs++;
		const r = Object.freeze({});
		refs.set(r, {
			id: ++refId,
			lease,
			allocation: a,
			category: c,
			key
		});
		a.refs.add(r);
		leases.get(lease).refs.add(r);
		if (key !== undefined) leases.get(lease).keys.set(key, r);
		return r;
	}
	function leaseState(l) {
		const s = leases.get(l);
		if (!s) invalid();
		return s;
	}
	function open(l) {
		const s = leaseState(l);
		if (s.closed) throw Object.assign(new Error("Closed lease"), { code: "CLOSED" });
		return s;
	}
	function retire(r) {
		const s = refs.get(r), a = s.allocation;
		if (!a) return;
		a.refs.delete(r);
		const ls = leases.get(s.lease);
		ls.refs.delete(r);
		if (s.key !== undefined) ls.keys.delete(s.key);
		s.allocation = undefined;
		activeRefs--;
		if (!a.refs.size) {
			allocations.delete(a);
			if (a.buffer) backings.delete(a.buffer);
		}
	}
	function makeLease() {
		const l = Object.freeze({
			retain(from, c, owner) {
				leaseState(this);
				const s = refs.get(from);
				if (!s?.allocation) invalid();
				category(c);
				realm(owner);
				if (owner !== s.allocation.owner) invalid();
				open(this);
				accessible(s.allocation);
				if (!s.allocation.buffer) invalid();
				backingBytes(s.allocation.buffer);
				const a = s.allocation, n = counts();
				if (c !== "resident" && ![...a.refs].some((r) => refs.get(r).category === c)) n[c] += a.bytes;
				if (!fits(n) || !room(1)) return BUDGET;
				return issue(this, a, c);
			},
			reclassify(r, c) {
				const s = refs.get(r);
				if (!s || s.lease !== this) invalid();
				category(c);
				open(this);
				if (!s.allocation) invalid();
				accessible(s.allocation);
				if (s.allocation.buffer) backingBytes(s.allocation.buffer);
				const a = s.allocation, n = counts();
				const other = [...a.refs].filter((x) => x !== r).map((x) => refs.get(x).category);
				if (s.category !== "resident" && !other.includes(s.category)) n[s.category] -= a.bytes;
				if (c !== "resident" && !other.includes(c)) n[c] += a.bytes;
				if (!fits(n)) return BUDGET;
				s.category = c;
			},
			release(r) {
				leaseState(this);
				const s = refs.get(r);
				if (!s || s.lease !== this) invalid();
				if (s.allocation) accessible(s.allocation);
				retire(r);
			},
			close() {
				const s = leaseState(this);
				if (s.closed) return;
				if (s.prepared) invalid();
				for (const r of s.refs) accessible(refs.get(r).allocation);
				for (const r of s.refs) retire(r);
				s.closed = true;
				activeLeases--;
			},
			/** Checked logical handoff only: no detach/postMessage/ACK/native lifecycle. */
			transfer(r, target) {
				const s = refs.get(r);
				if (!s || s.lease !== this) invalid();
				realm(target);
				if (!s.allocation) invalid();
				open(this);
				accessible(s.allocation);
				if (!s.allocation.buffer) invalid();
				backingBytes(s.allocation.buffer);
				if (s.allocation.refs.size !== 1) throw Object.assign(new Error("Aliased backing"), { code: "TRANSFER_ALIASED" });
				s.allocation.owner = target;
			},
			ref(key) {
				const r = open(this).keys.get(key);
				if (!r) invalid();
				return r;
			},
			allocateBuffer(r) {
				const s = refs.get(r);
				if (!s || s.lease !== this) invalid();
				open(this);
				if (!s.allocation || s.allocation.buffer) invalid();
				accessible(s.allocation);
				try {
					const b = allocate(s.allocation.bytes);
					if (backingBytes(b) !== s.allocation.bytes || backings.has(b)) invalid();
					s.allocation.buffer = b;
					backings.set(b, s.allocation);
					return b;
				} catch (error) {
					retire(r);
					throw error;
				}
			}
		});
		leases.set(l, {
			closed: false,
			prepared: 0,
			refs: new Set(),
			keys: new Map()
		});
		activeLeases++;
		return l;
	}
	return {
		ledger: Object.freeze({
			createRealm() {
				if (realmId >= controls.maxRealms || realmId >= Number.MAX_SAFE_INTEGER) throw Object.assign(new Error("Realm capacity"), { code: "BUDGET" });
				const r = Object.freeze({});
				realms.set(r, ++realmId);
				return r;
			},
			reserve(plan) {
				if (!Array.isArray(plan)) invalid();
				if (plan.length > controls.maxPlanEntries) return BUDGET;
				const keys = new Set(), n = counts();
				const checked = Array.from(plan, (p) => {
					if (!p) invalid();
					const { key, bytes, category: c, owner } = p;
					if (typeof key !== "string" || !key.length || key.length > controls.maxKeyLength || keys.has(key)) invalid();
					keys.add(key);
					size(bytes);
					category(c);
					realm(owner);
					n.managed += bytes;
					if (c !== "resident") n[c] += bytes;
					return {
						key,
						bytes,
						category: c,
						owner
					};
				});
				if (!fits(n) || !room(checked.length, checked.length) || activeLeases >= controls.maxLeases) return BUDGET;
				const l = makeLease();
				for (const p of checked) {
					const a = {
						id: ++allocationId,
						bytes: p.bytes,
						owner: p.owner,
						refs: new Set()
					};
					allocations.add(a);
					issue(l, a, p.category, p.key);
				}
				return l;
			},
			/** Trusted UI/history mode ingress only; does not claim prior allocation was budgeted. */
			registerExisting(backing, lease, c, owner) {
				leaseState(lease);
				category(c);
				realm(owner);
				const bytes = backingBytes(backing);
				const known = backings.get(backing);
				if (known?.refs.size) {
					accessible(known);
					if (known.owner !== owner) invalid();
				}
				open(lease);
				if (known?.refs.size) return lease.retain(known.refs.values().next().value, c, owner);
				const n = counts();
				n.managed += bytes;
				if (c !== "resident") n[c] += bytes;
				if (!fits(n) || !room(1, 1)) return BUDGET;
				const a = {
					id: ++allocationId,
					bytes,
					owner,
					buffer: backing,
					refs: new Set()
				};
				allocations.add(a);
				backings.set(backing, a);
				return issue(lease, a, c);
			},
			snapshot() {
				return Object.freeze({
					...counts(),
					allocations: Object.freeze([...allocations].map((a) => Object.freeze({
						id: a.id,
						bytes: a.bytes,
						realm: realms.get(a.owner),
						phase: native ? a.phase ?? (a.buffer ? "MAIN" : "RESERVED") : a.buffer ? "live" : "reserved",
						refs: Object.freeze([...a.refs].map((r) => {
							const s = refs.get(r);
							return Object.freeze({
								id: s.id,
								category: s.category
							});
						}))
					})))
				});
			}
		}),
		handoff
	};
}
