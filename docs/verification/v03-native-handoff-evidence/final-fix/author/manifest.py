from pathlib import Path
import json,hashlib,collections
OUT=Path(__file__).parent;ROOT=Path('C:/Users/sandr/OrthoSculptCAD')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=OUT/'artifact-manifest.json';assert not manifest.exists()
repo_paths=list(json.loads((OUT/'before.json').read_text()))
paths=sorted(p for p in OUT.rglob('*')if p.is_file()and 'vite-cache'not in p.relative_to(OUT).parts and p!=manifest)
handoff_path=OUT/'handoff.json';h=json.loads(handoff_path.read_text());h['manifest']={'path':'artifact-manifest.json','roots':{'scratch':str(OUT),'repository':str(ROOT)},'totalEntries':len(paths)+len(repo_paths),'rootCounts':{'scratch':len(paths),'repository':len(repo_paths)},'exclusions':['artifact-manifest.json itself (self hash excluded)','vite-cache/** (ephemeral Vitest transform cache)']};handoff_path.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
md=OUT/'HANDOFF.md';text=md.read_text();text+=f"\nManifest: **{len(paths)+len(repo_paths)} wpisów**: scratch {len(paths)}, repository {len(repo_paths)}; wyłączenia: sam manifest i efemeryczny `vite-cache/**`. Korzenie jawnie zapisane w `artifact-manifest.json`.\n";md.write_text(text,encoding='utf8')
entries=[{'root':'scratch','path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in paths]
entries += [{'root':'repository','path':f,'bytes':(ROOT/f).stat().st_size,'sha256':sha(ROOT/f)}for f in repo_paths]
m={'schema':1,'roots':{'scratch':str(OUT),'repository':str(ROOT)},'totalEntries':len(entries),'rootCounts':dict(collections.Counter(e['root']for e in entries)),'exclusions':h['manifest']['exclusions'],'files':entries}
manifest.write_text(json.dumps(m,indent=2)+'\n')
# Verify every declared target against the exact declared root, count and digest.
r=json.loads(manifest.read_text());roots={k:Path(v)for k,v in r['roots'].items()};assert len(r['files'])==r['totalEntries']
for e in r['files']:
 p=roots[e['root']]/e['path'];assert p.stat().st_size==e['bytes']and sha(p)==e['sha256'],str(p)
print(json.dumps({'manifest':str(manifest),'sha256':sha(manifest),'verifiedEntries':r['totalEntries'],'rootCounts':r['rootCounts'],'scope':'candidate handoff, not acceptance'},indent=2))
