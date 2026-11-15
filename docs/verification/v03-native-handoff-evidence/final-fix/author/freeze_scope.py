from pathlib import Path
import json,hashlib
out=Path(__file__).parent;root=Path('C:/Users/sandr/OrthoSculptCAD')
paths=set((out/'tracked-before.bin').read_bytes().decode().strip('\0').split('\0'))
for directory in ['src','tests','docs/plans']:
 paths.update(p.relative_to(root).as_posix() for p in (root/directory).rglob('*')if p.is_file())
files={p:hashlib.sha256((root/p).read_bytes()).hexdigest()if(root/p).is_file()else None for p in sorted(paths)}
assert not(out/'scope-before.json').exists();(out/'scope-before.json').write_text(json.dumps({'roots':{'repo':str(root)},'coverage':'all existing tracked paths plus every production/test/norm path under src, tests, docs/plans; excludes untracked docs/verification parent-owned metadata/evidence, .git and node_modules','files':files},indent=2)+'\n');print('frozen',len(files),'paths')
