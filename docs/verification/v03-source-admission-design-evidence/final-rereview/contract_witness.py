"""Executable SPEC MODEL for LEDGER-01, NOT a ResourceLedger implementation.

No application imports, buffers, promises, native workers, weak handles, or API mocks.
Immutable, explicitly supplied graph pairs are checked against independent set-sum
accounting and local transition relations. Error labels are SPEC outcomes under
symbolic authenticity/closed/alias predicates, not observations of application code.
Run: python contract_witness.py [--negative-control history-escape|sum-refs]
"""
from dataclasses import asdict, dataclass, replace
from itertools import product
import argparse
import hashlib
import json
from pathlib import Path


@dataclass(frozen=True)
class Ref:
    id: str
    allocation: str
    lease: str
    category: str
    realm: str = "main"
    phase: str = "live"
    controlled: bool = False


@dataclass(frozen=True)
class Graph:
    allocations: tuple = ()  # (symbolic ID, complete backing bytes), not real buffers
    refs: tuple = ()
    retired: tuple = ()
    closed: tuple = ()


@dataclass(frozen=True)
class Vector:
    name: str
    relation: str
    before: Graph
    candidate: Graph
    expected_before: tuple
    expected_after: tuple
    expected_code: str = "OK"
    caps: tuple = (1024, 768, 512)
    actor: str = "L1"
    target: str = "r1"
    identity: str = "authentic"  # an explicit SPEC assumption, not JS authentication


def counts(g, mutant=None):
    sizes = dict(g.allocations)
    assert len(sizes) == len(g.allocations)
    assert len({r.id for r in g.refs}) == len(g.refs)
    assert not ({r.id for r in g.refs} & set(g.retired))
    for r in g.refs:
        assert r.allocation in sizes and r.category in ("resident", "job", "history")
        assert r.lease not in g.closed and r.phase in ("reserved", "live", "pending")
        assert 0 < sizes[r.allocation] <= 1024
    categories = {a: {r.category for r in g.refs if r.allocation == a} for a in sizes}
    managed = sum(sizes[a] for a, cats in categories.items() if cats)
    job = sum(sizes[a] for a, cats in categories.items() if "job" in cats)
    history = sum(sizes[a] for a, cats in categories.items() if "history" in cats)
    if mutant == "history-escape":
        history = sum(sizes[a] for a, cats in categories.items()
                      if "history" in cats and "resident" not in cats)
    if mutant == "sum-refs":
        managed = sum(sizes[r.allocation] for r in g.refs)
    return managed, job, history


def fingerprint(g):
    return hashlib.sha256(json.dumps(asdict(g), sort_keys=True).encode()).hexdigest()


def relation(v):
    """Check the explicit candidate graph, never execute a ledger operation."""
    b, c = v.before, v.candidate
    old, new = {r.id: r for r in b.refs}, {r.id: r for r in c.refs}
    if v.relation in ("noop", "view", "invalid"):
        assert b == c
    elif v.relation in ("reserve", "copy", "register-untracked"):
        assert set(b.allocations) < set(c.allocations)
        assert old.items() <= new.items() and len(new) > len(old)
        assert all(r.allocation not in dict(b.allocations) for k, r in new.items() if k not in old)
    elif v.relation in ("retain", "register-tracked"):
        assert b.allocations == c.allocations and old.items() < new.items()
        assert len(new) == len(old) + 1
        added = next(r for k, r in new.items() if k not in old)
        source = old[v.target]
        assert source.phase == "live" and added.allocation == source.allocation
        assert added.realm == source.realm and added.lease == v.actor
    elif v.relation == "allocate":
        assert b.allocations == c.allocations and set(old) == set(new)
        assert old[v.target].phase == "reserved"
        assert new[v.target] == replace(old[v.target], phase="live")
        assert all(old[k] == new[k] for k in old if k != v.target)
    elif v.relation == "reclassify":
        assert b.allocations == c.allocations and set(old) == set(new)
        assert old[v.target].lease == v.actor
        assert new[v.target] == replace(old[v.target], category=new[v.target].category)
        assert all(old[k] == new[k] for k in old if k != v.target)
    elif v.relation in ("close", "release", "settle"):
        removed = ({k for k, r in old.items() if r.lease == v.actor}
                   if v.relation == "close" else {v.target})
        assert all(old[k].lease == v.actor for k in removed)
        if v.relation == "settle":
            assert old[v.target].controlled
        assert new == {k: r for k, r in old.items() if k not in removed}
        assert b.allocations == c.allocations
        assert set(c.retired) == set(b.retired) | removed
        assert set(c.closed) == set(b.closed) | ({v.actor} if v.relation == "close" else set())
    elif v.relation == "transfer":
        assert b.allocations == c.allocations and set(old) == set(new)
        assert old[v.target].phase == "live"
        assert old[v.target].lease == v.actor
        assert new[v.target] == replace(old[v.target], realm="worker", phase="pending")
        assert all(old[k] == new[k] for k in old if k != v.target)
    else:
        raise AssertionError(v.relation)


def verdict(v, proposed_counts):
    # Declarative precedence of SPEC predicates. No JS capability is minted here.
    if v.identity != "authentic":
        return "INVALID_INPUT"
    if v.relation not in ("noop", "view") and v.actor in v.before.closed:
        return "CLOSED"
    if v.relation == "transfer":
        target = next(r for r in v.before.refs if r.id == v.target)
        if sum(r.allocation == target.allocation for r in v.before.refs) != 1:
            return "TRANSFER_ALIASED"
    if any(n > cap for n, cap in zip(proposed_counts, v.caps)):
        return "BUDGET"
    return "OK"


def vectors():
    empty = Graph()
    resident = Graph((("A", 768),), (Ref("r1", "A", "L1", "resident"),))
    resident_history = replace(resident, refs=resident.refs + (Ref("h", "A", "L2", "history"),))
    job = replace(resident, refs=(Ref("r1", "A", "L1", "job"),))
    job_reserved = replace(job, refs=(replace(job.refs[0], phase="reserved"),))
    full = Graph((("A", 768), ("B", 256)), job.refs + (Ref("b", "B", "LB", "resident"),))
    full_plus = Graph(full.allocations + (("C", 1),), full.refs + (Ref("c", "C", "LC", "job", phase="reserved"),))
    job_history = replace(job, refs=job.refs + (Ref("h", "A", "L2", "history"),))
    history_only = replace(job_history, refs=(job_history.refs[1],), retired=("r1",), closed=("L1",))
    none = replace(history_only, refs=(), retired=("r1", "h"), closed=("L1", "L2"))
    small = Graph((("A", 256),), (Ref("r1", "A", "L1", "job"),))
    two = replace(small, refs=small.refs + (Ref("r2", "A", "L2", "job"),))
    overlap = replace(two, refs=(replace(two.refs[0], category="history"), two.refs[1]))
    large_two = replace(job, refs=job.refs + (Ref("r2", "A", "L2", "job"),))
    large_overlap = replace(large_two, refs=(replace(large_two.refs[0], category="history"), large_two.refs[1]))
    hold = replace(small, refs=small.refs + (Ref("native", "A", "BROKER", "job", phase="pending", controlled=True),))
    held = replace(hold, refs=(hold.refs[1],), retired=("r1",), closed=("L1",))
    settled = replace(held, refs=(), retired=("r1", "native"))
    last = replace(small, refs=(), retired=("r1",))
    h2 = Graph((("A", 256), ("B", 256)), (Ref("h2", "B", "L2", "job", phase="reserved"),), ("h1",), ("L1",))
    transfer = replace(small, refs=(replace(small.refs[0], realm="worker", phase="pending"),))
    alias = replace(small, refs=small.refs + (Ref("ui", "A", "UI", "resident"),))
    alias_candidate = replace(alias, refs=(replace(alias.refs[0], realm="worker", phase="pending"), alias.refs[1]))
    return [
        Vector("reserve-job-exact", "reserve", empty, job_reserved, (0,0,0), (768,768,0)),
        Vector("allocate-no-new-charge", "allocate", job_reserved, job, (768,768,0), (768,768,0)),
        Vector("resident-plus-one-refused", "reserve", job,
               Graph((("A",768),("B",257)), job.refs+(Ref("b","B","LB","resident",phase="reserved"),)),
               (768,768,0), (768,768,0), "BUDGET"),
        Vector("resident-exact-remaining", "reserve", job, full, (768,768,0), (1024,768,0)),
        Vector("resident-undo-refused-512", "retain", resident, resident_history, (768,0,0), (768,0,0), "BUDGET", actor="L2"),
        Vector("resident-undo-accepted-768", "retain", resident, resident_history, (768,0,0), (768,0,768), caps=(1024,768,768), actor="L2"),
        Vector("job-history-overlap", "retain", job, job_history, (768,768,0), (768,768,768), caps=(1024,768,768), actor="L2"),
        Vector("close-first-keeps-second", "close", job_history, history_only, (768,768,768), (768,0,768), caps=(1024,768,768)),
        Vector("close-second-ends-all", "close", history_only, none, (768,0,768), (0,0,0), caps=(1024,768,768), actor="L2", target="h"),
        Vector("same-category-ref-once", "retain", small, two, (256,256,0), (256,256,0), actor="L2"),
        Vector("reclassify-one-not-all", "reclassify", two, overlap, (256,256,0), (256,256,256)),
        Vector("reclassify-overcap-rollback", "reclassify", large_two, large_overlap, (768,768,0), (768,768,0), "BUDGET"),
        Vector("whole-backing-not-view-lengths-16-32", "view", resident, resident, (768,0,0), (768,0,0)),
        Vector("tracked-ui-registration-same-id", "register-tracked", resident,
               replace(resident, refs=resident.refs+(Ref("ui","A","UI","resident"),)), (768,0,0), (768,0,0), actor="UI"),
        Vector("tracked-history-registration-charged", "register-tracked", resident, resident_history, (768,0,0), (768,0,0), "BUDGET", actor="L2"),
        Vector("untracked-mode-ingress-charged", "register-untracked", empty, resident, (0,0,0), (768,0,0)),
        Vector("untracked-mode-ingress-overcap", "register-untracked", full, full_plus, (1024,768,0), (1024,768,0), "BUDGET"),
        Vector("independent-copy-new-id-at-full", "copy", full, full_plus, (1024,768,0), (1024,768,0), "BUDGET"),
        Vector("full-job-to-history-refused", "reclassify", full,
               replace(full, refs=(replace(full.refs[0],category="history"), full.refs[1])), (1024,768,0), (1024,768,0), "BUDGET"),
        Vector("caller-close-keeps-controlled-native-ref", "close", hold, held, (256,256,0), (256,256,0)),
        Vector("caller-cancel-again-not-settlement", "noop", held, held, (256,256,0), (256,256,0)),
        Vector("controlled-real-settle-spec-boundary", "settle", held, settled, (256,256,0), (0,0,0), actor="BROKER", target="native"),
        Vector("last-reference-without-hold", "release", small, last, (256,256,0), (0,0,0)),
        Vector("retired-h1-release-preserves-pending-h2", "noop", h2, h2, (256,256,0), (256,256,0), target="h1"),
        Vector("double-close-idempotent", "noop", none, none, (0,0,0), (0,0,0)),
        Vector("foreign-release-even-after-close", "invalid", h2, h2, (256,256,0), (256,256,0), "INVALID_INPUT", identity="foreign"),
        Vector("forged-json-not-new-reference", "invalid", small, small, (256,256,0), (256,256,0), "INVALID_INPUT", identity="forged"),
        Vector("other-lease-release-rejected", "invalid", two, two, (256,256,0), (256,256,0), "INVALID_INPUT", identity="foreign-lease"),
        Vector("closed-target-retain-rejected", "invalid", h2, h2, (256,256,0), (256,256,0), "CLOSED"),
        Vector("retired-not-retain-authority", "invalid", h2, h2, (256,256,0), (256,256,0), "INVALID_INPUT", identity="retired-source"),
        Vector("eligible-transfer-preserves-id-charges", "transfer", small, transfer, (256,256,0), (256,256,0)),
        Vector("transfer-aliased-ui-rejected", "transfer", alias, alias_candidate, (256,256,0), (256,256,0), "TRANSFER_ALIASED"),
        Vector("transfer-aliased-sha-rejected", "transfer", replace(alias,refs=(alias.refs[0],replace(alias.refs[1],category="job",controlled=True))),
               replace(alias_candidate,refs=(alias_candidate.refs[0],replace(alias_candidate.refs[1],category="job",controlled=True))),
               (256,256,0), (256,256,0), "TRANSFER_ALIASED"),
    ]


def exhaustive_projection():
    """729 bounded multiset graphs: set-sum versus per-allocation indicator sums."""
    checked = 0
    for multiplicities in product(range(3), repeat=6):
        refs = []
        for i, (a, category) in enumerate(product(("A", "B"), ("resident", "job", "history"))):
            refs.extend(Ref(f"{i}-{j}", a, f"L{i}-{j}", category) for j in range(multiplicities[i]))
        g = Graph((("A",256),("B",768)), tuple(refs))
        expected = tuple(sum(size * int(any(r.allocation == a and (category is None or r.category == category) for r in refs))
                             for a, size in g.allocations) for category in (None, "job", "history"))
        assert counts(g) == expected
        assert expected[1] <= expected[0] and expected[2] <= expected[0]
        checked += 1
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--negative-control", choices=("history-escape", "sum-refs"))
    args = parser.parse_args()
    results = []
    for v in vectors():
        stamp = fingerprint(v.before)
        relation(v)
        before = counts(v.before, args.negative_control)
        proposed = counts(v.candidate, args.negative_control)
        code = verdict(v, proposed)
        selected = v.candidate if code == "OK" else v.before
        after = counts(selected, args.negative_control)
        assert before == v.expected_before, (v.name, "before", before, v.expected_before)
        assert code == v.expected_code, (v.name, "code", code, v.expected_code)
        assert after == v.expected_after, (v.name, "after", after, v.expected_after)
        assert fingerprint(v.before) == stamp
        if code != "OK":
            assert selected == v.before and fingerprint(selected) == stamp
        results.append({"name": v.name, "caps": v.caps, "before": before,
                        "proposed": proposed, "code": code, "after": after,
                        "before_graph_sha256": stamp, "after_graph_sha256": fingerprint(selected)})
    output = {"kind": "SPEC_MODEL_NOT_IMPLEMENTATION", "ok": True,
              "vector_count": len(results), "projection_graphs": exhaustive_projection(),
              "results": results,
              "not_verified": ["production ResourceLedger", "real JS authentication/WeakMap",
                               "real ArrayBuffer allocation", "native SHA/transfer/ACK/thread/RSS",
                               "G1a GREEN", "admission", "future G1b/G2/G3/G4"]}
    (Path(__file__).parent / "witness-results.json").write_text(json.dumps(output, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in output.items() if k != "results"}))


if __name__ == "__main__":
    main()
