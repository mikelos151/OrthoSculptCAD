#!/usr/bin/env bash
set -o pipefail
S=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts
cd C:/Users/sandr/OrthoSculptCAD || exit 99
run() {
  local label=$1; shift
  printf '%s\n' "$*" > "$S/$label.command.txt"
  "$@" 2>&1 | tee "$S/$label.log"
  local code=${PIPESTATUS[0]}
  printf '%s\n' "$code" > "$S/$label.exit.txt"
  return "$code"
}
export NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8'
run tsc-final node node_modules/typescript/bin/tsc --noEmit || exit $?
run tsc-emit node node_modules/typescript/bin/tsc --target ES2022 --module ES2022 --moduleResolution bundler --strict --skipLibCheck --outDir "$S/compiled" src/compute/resourceLedger.ts || exit $?
run native-smoke node "$S/native-smoke.mjs"
