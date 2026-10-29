function invalid() {
	throw Object.assign(new Error("Invalid pool input"), { code: "INVALID_INPUT" });
}
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger, factory) {
	// Main + two logical slot domains, not physical JavaScript realm identities.
	const domains = Object.freeze([
		ledger.createRealm(),
		ledger.createRealm(),
		ledger.createRealm()
	]);
	const slots = domains.slice(1).map((domain, ordinal) => ({
		domain,
		ordinal,
		incarnation: 0
	}));
	const leases = new WeakMap();
	const boundWorkers = new WeakSet();
	let disposed = false, generation = 0;
	function terminal(binding) {
		if (binding.terminalAttempted || binding.slot.current !== binding) return;
		binding.phase = "REVOKING";
		if (binding.auth) binding.auth.binding = undefined;
		if (!binding.worker) return;
		binding.terminalAttempted = true;
		binding.stop?.();
		try {
			binding.worker.terminate();
		} catch (error) {
			binding.phase = "FAILED";
			throw error;
		}
		binding.resources.close();
		binding.slot.current = undefined;
	}
	function dispose() {
		if (disposed) return;
		disposed = true;
		const active = slots.flatMap((s) => s.current ? [s.current] : []);
		// Revoke ALL public auth before the first listener removal or native termination.
		for (const b of active) if (b.auth) b.auth.binding = undefined;
		let failure;
		for (const b of active) {
			try {
				terminal(b);
			} catch (error) {
				failure ??= error;
			}
		}
		if (failure) throw failure;
	}
	return Object.freeze({
		snapshot() {
			return Object.freeze({
				disposed,
				ownershipDomains: domains.length,
				occupied: slots.filter((s) => s.current).length,
				slots: Object.freeze(slots.map((s) => Object.freeze({
					ordinal: s.ordinal,
					incarnation: s.incarnation,
					generation: s.current?.generation ?? 0,
					phase: s.current?.phase ?? "FREE"
				})))
			});
		},
		dispose,
		release(lease) {
			const auth = leases.get(lease);
			if (!auth) invalid();
			const binding = auth.binding;
			if (!binding) return;
			terminal(binding);
		},
		acquire(kind, plan) {
			if (disposed) throw Object.assign(new Error("Closed pool"), { code: "CLOSED" });
			if (kind !== "compute" && kind !== "display" && kind !== "index" && kind !== "owner") invalid();
			const slot = slots.find((s) => !s.current);
			if (!slot) return {
				ok: false,
				code: "BUSY"
			};
			if (generation >= Number.MAX_SAFE_INTEGER || slot.incarnation >= Number.MAX_SAFE_INTEGER) {
				dispose();
				throw Object.assign(new Error("Pool ordinal capacity"), { code: "BUDGET" });
			}
			if (!Array.isArray(plan)) invalid();
			if (plan.length > 16) return {
				ok: false,
				code: "BUDGET"
			};
			// Only bounded control records are copied here, never payloads. The same G1a core
			// validates the dense complete plan and atomically reserves every category/byte.
			const resources = ledger.reserve(plan.map((p) => ({
				...p,
				owner: slot.domain
			})));
			if ("code" in resources) return resources;
			slot.incarnation++;
			const binding = {
				slot,
				generation: ++generation,
				phase: "STARTING",
				resources
			};
			slot.current = binding;
			try {
				binding.nonce = globalThis.crypto.getRandomValues(new Uint32Array(4));
				binding.worker = factory(kind);
				if (boundWorkers.has(binding.worker)) invalid();
				boundWorkers.add(binding.worker);
			} catch (error) {
				resources.close();
				slot.current = undefined;
				throw error;
			}
			if (disposed) {
				terminal(binding);
				throw Object.assign(new Error("Closed pool"), { code: "CLOSED" });
			}
			const lease = Object.freeze({});
			binding.phase = "IDLE";
			const auth = { binding };
			binding.auth = auth;
			leases.set(lease, auth);
			const native = binding.worker;
			const onError = () => {
				if (binding.slot.current !== binding || binding.worker !== native) return;
				try {
					terminal(binding);
				} catch {}
			};
			binding.stop = () => {
				native.removeEventListener("error", onError);
				native.removeEventListener("messageerror", onError);
			};
			try {
				native.addEventListener("error", onError);
				native.addEventListener("messageerror", onError);
			} catch (error) {
				terminal(binding);
				throw error;
			}
			return lease;
		}
	});
}
