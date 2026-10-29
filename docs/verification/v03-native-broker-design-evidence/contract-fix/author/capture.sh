#!/usr/bin/env bash
set -u
out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-contract-fix
repo=C:/Users/sandr/OrthoSculptCAD
phase=$1
capture() {
  key=$1; shift
  git -C "$repo" "$@" > "$out/$phase-$key.stdout" 2> "$out/$phase-$key.stderr"
  result=$?
  printf '%s\n' "$result" > "$out/$phase-$key.exit"
  printf 'git %s exit=%s\n' "$*" "$result"
  test "$result" -eq 0 || exit "$result"
}
capture head rev-parse HEAD
capture branch branch --show-current
capture status status --short
capture tracked ls-files -z
capture diff diff --exit-code
capture index_diff diff --cached --exit-code
python "$out/audit.py" "$phase" > "$out/audit-$phase-retry.log" 2>&1
result=$?
printf 'audit %s exit=%s\n' "$phase" "$result"
exit "$result"
