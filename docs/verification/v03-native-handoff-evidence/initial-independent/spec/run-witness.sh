#!/usr/bin/env bash
# All source reads are real repository TS; all outputs stay in review scratch.
set -u
out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-spec-review
run="${1:-replay}"
case "$run" in *[!a-zA-Z0-9_-]*|'') printf 'invalid run label\n'; exit 2;; esac
if [ -e "$out/$run.command.log" ]; then printf 'refusing to overwrite run evidence\n'; exit 2; fi
printf 'node --max-old-space-size=128 --max-semi-space-size=8 C:/Users/sandr/OrthoSculptCAD/node_modules/typescript/bin/tsc -p %s/tsconfig.json\n' "$out" > "$out/$run.command.log"
node --max-old-space-size=128 --max-semi-space-size=8 C:/Users/sandr/OrthoSculptCAD/node_modules/typescript/bin/tsc -p "$out/tsconfig.json" > "$out/$run.compile.stdout.log" 2> "$out/$run.compile.stderr.log"
rc=$?; printf 'compile_exit=%s\n' "$rc" >> "$out/$run.command.log"; if [ "$rc" -ne 0 ]; then exit "$rc"; fi
node "$out/relink.mjs" > "$out/$run.relink.stdout.log" 2> "$out/$run.relink.stderr.log"
rc=$?; printf 'node relink.mjs exit=%s\n' "$rc" >> "$out/$run.command.log"; if [ "$rc" -ne 0 ]; then exit "$rc"; fi
printf 'node --max-old-space-size=128 --max-semi-space-size=8 %s/compiled/AppData/Local/hermes/cache/scratch/v03-native-handoff-spec-review/witness.js\n' "$out" >> "$out/$run.command.log"
node --max-old-space-size=128 --max-semi-space-size=8 "$out/compiled/AppData/Local/hermes/cache/scratch/v03-native-handoff-spec-review/witness.js" > "$out/$run.stdout.log" 2> "$out/$run.stderr.log"
rc=$?; printf 'witness_exit=%s\n' "$rc" >> "$out/$run.command.log"; printf 'actual-API witness exit=%s\n' "$rc"; exit "$rc"
