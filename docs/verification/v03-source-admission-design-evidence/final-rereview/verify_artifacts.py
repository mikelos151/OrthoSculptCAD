"""Read-only repo checks; writes evidence only to this owned scratch directory."""
import difflib
import hashlib
import json
from pathlib import Path

ROOT = Path("C:/Users/sandr/OrthoSculptCAD")
HERE = Path(__file__).parent
PLAN = "docs/plans/v03-source-admission-owner-design.md"
SOURCE = "src/trimline/source-candidate.ts"
sha = lambda data: hashlib.sha256(data).hexdigest()


def main():
    before_bytes = (HERE / "plan-before.md").read_bytes()
    after_bytes = (ROOT / PLAN).read_bytes()
    assert sha(before_bytes) == "1504d3ae9596fe6456b648972e7388a8d28c26dced926cf66be6e7c1088c23ea"
    before, after = before_bytes.decode("utf-8"), after_bytes.decode("utf-8")
    b, a = before.splitlines(keepends=True), after.splitlines(keepends=True)
    changed = []
    allowed_old_lines = {134, 136, 189, 222, 232}
    allowed_insert_before_lines = {143}  # blank immediately before unchanged §5.2 heading
    added = removed = 0
    for tag, i, j, k, l in difflib.SequenceMatcher(None, b, a, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        if tag == "insert":
            assert i + 1 in allowed_insert_before_lines, (tag, i + 1)
        else:
            assert set(range(i + 1, j + 1)) <= allowed_old_lines, (tag, i + 1, j)
        added += l-k
        removed += j-i
        changed.append({"kind": tag, "old_first_line": i+1, "old_end_exclusive": j+1,
                        "new_first_line": k+1, "new_end_exclusive": l+1})
    assert added <= 100
    # Protected sections: byte-for-byte equality after extracting by unchanged headings.
    protected = {}
    for start, end in (("## 1.", "## 5."), ("### 5.2.", "## 7."), ("## 10.", None)):
        old = before[before.index(start):before.index(end)] if end else before[before.index(start):]
        new = after[after.index(start):after.index(end)] if end else after[after.index(start):]
        assert old == new, start
        protected[start] = sha(old.encode("utf-8"))
    original = json.loads((HERE / "input-hashes-start.json").read_text(encoding="utf-8"))
    files = sorted(set(list((ROOT/"src").rglob("*")) + list((ROOT/"tests").rglob("*")) + list((ROOT/"docs").rglob("*"))))
    current = {str(p.relative_to(ROOT)).replace("\\", "/"): sha(p.read_bytes()) for p in files if p.is_file()}
    (HERE / "input-hashes-end.json").write_text(json.dumps(current, indent=2)+"\n", encoding="utf-8")
    differences = sorted(p for p in set(original) | set(current) if original.get(p) != current.get(p))
    assert differences == [PLAN], differences
    assert original[SOURCE] == current[SOURCE] == "983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b"
    patch = "".join(difflib.unified_diff(b, a, fromfile="before/"+PLAN, tofile="after/"+PLAN))
    (HERE / "targeted.patch").write_text(patch, encoding="utf-8", newline="")
    results = json.loads((HERE / "witness-results.json").read_text(encoding="utf-8"))
    assert results["kind"] == "SPEC_MODEL_NOT_IMPLEMENTATION" and results["ok"]
    assert results["vector_count"] == len(results["results"]) == 33
    assert results["projection_graphs"] == 729
    assert len({x["name"] for x in results["results"]}) == 33
    report = {
        "ok": True, "plan_sha256_before": sha(before_bytes), "plan_sha256_after": sha(after_bytes),
        "source_sha256_start": original[SOURCE], "source_sha256_end": current[SOURCE],
        "plan_lines_before": len(b), "plan_lines_after": len(a),
        "plan_bytes_before": len(before_bytes), "plan_bytes_after": len(after_bytes),
        "added_lines": added, "removed_lines": removed, "diff_hunks": changed,
        "snapshot_files": len(original), "changed_paths": differences,
        "protected_section_hashes": protected,
        "evidence_note": "Checks contract model and edit scope only; no production/native admission verification.",
    }
    report["artifact_hashes"] = {p.name: sha(p.read_bytes()) for p in HERE.iterdir()
                                 if p.is_file() and p.name not in ("artifact-verification.json", "handoff.json", "verification.log")}
    (HERE / "artifact-verification.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
