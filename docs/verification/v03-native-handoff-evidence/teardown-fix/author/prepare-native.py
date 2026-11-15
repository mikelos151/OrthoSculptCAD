from pathlib import Path
import hashlib,json,shutil
out=Path('C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix')
original=out.parent/'v03-native-handoff-core'
native=out/'native';native.mkdir()
runner=(original/'native-cli.mjs').read_bytes()
old=str(original).replace('\\','/').encode();new=str(native).replace('\\','/').encode()
assert runner.count(old)==1
relocated=runner.replace(old,new)
(native/'native-cli.mjs').write_bytes(relocated)
assert relocated.replace(new,old)==runner
for name in ['fixture-matrix.mjs','fixture-roundtrip.mjs']:shutil.copyfile(original/name,native/name)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof={'native':{'original_root':str(original),'replay_root':str(native),'runner_original_sha256':sha(original/'native-cli.mjs'),'runner_relocated_sha256':sha(native/'native-cli.mjs'),'only_change':'one output/fixture dir literal; root repository and assertions unchanged','normalized_bytes_equal':True,'fixtures':{}},'quality':{}}
for name in ['fixture-matrix.mjs','fixture-roundtrip.mjs']:
 assert (original/name).read_bytes()==(native/name).read_bytes()
 proof['native']['fixtures'][name]={'original_sha256':sha(original/name),'replay_sha256':sha(native/name),'bytes_identical':True}
for name in ['witness.mjs','loader.mjs']:
 original_quality=out.parent/'v03-native-handoff-quality-review'/name
 assert original_quality.read_bytes()==(out/'quality'/name).read_bytes()
 proof['quality'][name]={'original_sha256':sha(original_quality),'replay_sha256':sha(out/'quality'/name),'bytes_identical':True}
(out/'relocation-proof.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(proof,indent=2))
