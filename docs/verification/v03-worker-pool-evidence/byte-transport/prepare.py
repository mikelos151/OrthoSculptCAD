from pathlib import Path
import hashlib,json
r=Path('C:/Users/sandr/OrthoSculptCAD');b=Path(__file__).parent
names=['.gitattributes','src/compute/workerPool.ts','tests/v03-worker-pool.test.ts','docs/plans/v03-native-broker-g1b-design.md','docs/verification/v03-native-broker-design-results.json','docs/verification/v03-worker-pool-parent-results.json','src/compute/resourceLedger.ts']
owned=names[:-1]
for name in ['docs/verification/v03-native-broker-design-evidence','docs/verification/v03-worker-pool-evidence']:
 owned.extend(p.relative_to(r).as_posix()for p in(r/name).rglob('*')if p.is_file())
owned=sorted(set(owned));names=sorted(set(names+owned))
manifest={n:hashlib.sha256((r/n).read_bytes()).hexdigest()for n in names}
(b/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(b/'owned.paths').write_bytes(b''.join(n.encode()+b'\0'for n in owned))
(b/'export.paths').write_bytes(b''.join(n.encode()+b'\0'for n in names))
print(json.dumps({'owned':len(owned),'export':len(names)}))
