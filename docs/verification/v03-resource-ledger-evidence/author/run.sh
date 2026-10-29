#!/usr/bin/env bash
set -o pipefail
S=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts
R=C:/Users/sandr/OrthoSculptCAD
label=$1
shift
cd "$R" || exit 99
printf '%s\n' "NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node node_modules/vitest/vitest.mjs run $* --maxWorkers=1 --no-file-parallelism" > "$S/$label.command.txt"
NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node node_modules/vitest/vitest.mjs run "$@" --maxWorkers=1 --no-file-parallelism 2>&1 | tee "$S/$label.log"
code=${PIPESTATUS[0]}
printf '%s\n' "$code" > "$S/$label.exit.txt"
mkdir -p "$S/phases/$label"
cp src/compute/resourceLedger.ts "$S/phases/$label/resourceLedger.ts"
cp tests/v03-resource-ledger.test.ts "$S/phases/$label/v03-resource-ledger.test.ts"
exit "$code"
