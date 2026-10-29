"""Finalize only the reviewer's scratch artifacts; no repository writes."""
import hashlib
import json
from pathlib import Path

OUT = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-lifecycle-review')
ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
review = json.loads((OUT / 'review.json').read_text(encoding='utf-8'))
verification = json.loads((OUT / 'verification-results.json').read_text(encoding='utf-8'))
assert review['passed'] is False
assert not review['security_concerns']
assert {error['id'] for error in review['logic_errors']} == {'G1B-DEADLINE-WIRE', 'G1B-CORRELATION-ORDER'}
assert all(error['required_correction_AC'] for error in review['logic_errors'])
assert review['readiness']['G1b1a_can_start'] is True
assert review['readiness']['fulltransport_ready'] is False
for row in verification['source_end']:
    assert hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
result = {'schema_and_fail_closed_checks': 'PASS',
          'logic_error_count': len(review['logic_errors']),
          'security_concern_count': len(review['security_concerns']),
          'suggestion_count': len(review['suggestions']),
          'all_selected_source_hashes_still_match': True,
          'command': 'python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-lifecycle-review/finalize-review.py',
          'scope': 'Static provenance and review artifact validation, not application tests'}
(OUT / 'finalization-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
files = sorted(p for p in OUT.iterdir() if p.is_file() and p.name != 'artifact-manifest.json')
manifest = {'scope': 'All direct files in reviewer-owned scratch directory except this self-referential manifest; repository files are separately in verification-results.json.',
            'files': [{'path': p.name, 'bytes': p.stat().st_size,
                       'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
            'file_count': len(files)}
(OUT / 'artifact-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'review': str(OUT / 'review.json'), 'passed': review['passed'],
                  'blockers': result['logic_error_count'], 'G1b1a_can_start': True,
                  'fulltransport_ready': False, 'manifest': str(OUT / 'artifact-manifest.json'),
                  'manifested_files': len(files), 'source_hashes_unchanged': True}, indent=2))
