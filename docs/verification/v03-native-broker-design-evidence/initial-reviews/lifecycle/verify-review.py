"""Read-only provenance/static contract inspection, not a native broker test."""
import hashlib
import json
from pathlib import Path

ROOT = Path('C:/Users/sandr/OrthoSculptCAD')
OUT = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-lifecycle-review')
AUTHOR = Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

start = json.loads((OUT / 'source-start.json').read_text())
additional = json.loads((OUT / 'source-additional-start.json').read_text())
end = []
for row in start['sources'] + additional:
    p = ROOT / row['path']
    end.append({'path': row['path'], 'sha256': digest(p), 'bytes': p.stat().st_size,
                'matches_start': digest(p) == row['sha256']})
manifest = json.loads((AUTHOR / 'sha256-manifest.json').read_text())
author_files = ['handoff.json', 'native-boundary-probe.mjs', 'native-probe-results.json']
author_checks = [{'path': name, 'sha256': digest(AUTHOR / name),
                  'matches_author_manifest': digest(AUTHOR / name) == manifest['scratchFiles'][name]}
                 for name in author_files]
probe = json.loads((AUTHOR / 'native-probe-results.json').read_text())
checks = [event for event in probe['result']['events'] if 'check' in event]
plan_lines = (ROOT / 'docs/plans/v03-native-broker-g1b-design.md').read_text(encoding='utf-8').splitlines()
# Arithmetic only; these derived bounds do not validate a production decoder.
layout = {'header_bytes': 10 * 4 + 16 + 8, 'max_descriptors_bytes': 16 * 12,
          'max_header_plus_descriptors_bytes': 64 + 16 * 12,
          'counter_max_u32': 2**32 - 1,
          'wire_fields_in_order': ['magic', 'version', 'type', 'slot', 'incarnation',
                                  'generation', 'job', 'request', 'transfer', 'window'],
          'specified_nonce_range': [40, 55], 'specified_reserved_zero_range': [56, 63],
          'deadline_field_present_in_frozen_layout': False,
          'interpretation': 'The closed fields and zero bytes contain no deadline/duration; window is used for correlation, not defined as time.'}
result = {'scope': 'Independent static design/lifecycle review; no browser/native replay, full tests, large allocation or broker implementation.',
          'head_end': (OUT / 'head-end.log').read_text().strip(),
          'source_end': end, 'all_selected_sources_unchanged': all(r['matches_start'] for r in end),
          'plan_lines': len(plan_lines), 'author_evidence': author_checks,
          'author_probe_checks': len(checks), 'author_probe_checks_pass': all(e['pass'] for e in checks),
          'author_probe_error_list': probe['errors'],
          'author_probe_status': probe['status'], 'author_probe_replayed_by_this_reviewer': False,
          'abi_layout_arithmetic_only': layout}
(OUT / 'verification-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
assert result['head_end'] == '2a586bd3abe3c801e7fe23764fecc77b8c770b50'
assert result['all_selected_sources_unchanged']
assert all(r['matches_author_manifest'] for r in author_checks)
assert len(plan_lines) == 162
assert end[0]['sha256'] == '6b9d5ead108a81f32daf24bca112f2d33300274fe31dfb78858000e80943c558'
assert len(checks) == 12 and result['author_probe_checks_pass'] and not probe['errors']
assert layout['header_bytes'] == 64 and layout['max_header_plus_descriptors_bytes'] <= 1024
