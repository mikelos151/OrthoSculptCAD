"""Read-only input snapshot and byte-identical isolated rereview setup."""
from pathlib import Path
import hashlib
import json
import difflib
import shutil
import sys

ROOT = Path(__file__).resolve().parent
SCRATCH = ROOT.parent
FIXED = SCRATCH / 'v03-seam-bridge-fixed'
ORIGINAL = SCRATCH / 'v03-seam-bridge-spike'
PRIOR = SCRATCH / 'v03-seam-bridge-independent-review'
REPO = Path('C:/Users/sandr/OrthoSculptCAD')
COPY_NAMES = ('README.md', 'spike.py', 'check_bridge.py', 'producer.cjs', 'secondary.py',
              'test_spike.py', 'test_review_regression.py', 'test_same_face_binding.py', 'review-results.json')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def snapshot():
    paths = []
    for directory in (FIXED, ORIGINAL, PRIOR):
        paths.extend(p for p in directory.rglob('*') if p.is_file())
    paths.extend(REPO / 'src/trimline' / x for x in ('numerics.ts', 'bezier.ts', 'face-cubic.ts'))
    paths.extend(REPO / 'tests/reference' / x for x in ('v03_face_cubic_verify.py', 'v03_bezier_verify.py'))
    paths.append(REPO / 'node_modules/typescript/bin/tsc')
    return {str(p): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(set(paths))}

def save(path, data):
    with path.open('x', encoding='utf8') as out:
        json.dump(data, out, indent=2)
        out.write('\n')

if __name__ == '__main__':
    save(ROOT / 'inputs-start.json', snapshot())
    comparison = {}
    for name in COPY_NAMES:
        src, dest = FIXED/name, ROOT/name
        assert not dest.exists(), dest
        shutil.copyfile(src, dest)
        assert src.read_bytes() == dest.read_bytes()
        comparison[name] = {'source': str(src), 'sha256': sha(src), 'byteIdenticalCopy': True}
    six = ('README.md', 'spike.py', 'check_bridge.py', 'producer.cjs', 'secondary.py', 'test_spike.py')
    changes = []
    for name in six:
        old, new = (ORIGINAL/name).read_bytes(), (FIXED/name).read_bytes()
        comparison[name]['equalsOriginal'] = old == new
        if old != new:
            changes.append(name)
            (ROOT/(name+'.diff')).write_text(''.join(difflib.unified_diff(
                old.decode('utf8').splitlines(True), new.decode('utf8').splitlines(True),
                fromfile=str(ORIGINAL/name), tofile=str(FIXED/name))), encoding='utf8')
    assert set(changes) == {'README.md', 'check_bridge.py'}, changes
    assert (ROOT/'test_review_regression.py').read_bytes() == (PRIOR/'test_review_regression.py').read_bytes()
    assert (ROOT/'review-results.json').read_bytes() == (PRIOR/'review-results.json').read_bytes()
    save(ROOT/'copy-and-change-comparison.json', comparison)
    print(json.dumps({'inputFiles': len(json.loads((ROOT/'inputs-start.json').read_text())),
                      'copies':len(COPY_NAMES), 'changedVsOriginal':changes,
                      'originalReviewerRegressionByteIdentical': True,
                      'python':sys.executable}))
