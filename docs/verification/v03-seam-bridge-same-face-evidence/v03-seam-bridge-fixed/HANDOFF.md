# Same-face checker correction — execution handoff

Scope: fixed scratch copy only. The checker compares every ordered F/G triangle coordinate exactly with Fraction before the existing bridge checks and the complete public verification. No geometry/hash from the evidence is treated as external authority. No runtime API, numerical budget, original review input or repository file was changed.

## Actual executions

- RED: `python -B -m unittest -v test_review_regression.IndependentAdversarialTests.test_same_face_bridge_must_reject_real_ts_tilted_original_F` — exit 1; `ValueError not raised`. Log: `red-source-ac.log`.
- Same focused reviewer test after correction — exit 0; 1 test OK. Log: `green-review.log`.
- `python -B -m unittest -v test_spike` — exit 0; 12 tests OK. Log: `green-spike.log`.
- `python -B -m unittest -v test_same_face_binding` — exit 0; 3 tests OK. Includes the actual reviewer TS proof: old public verifier PASS (2 cases/8 leaves/10 samples), corrected checker ValueError. Permuted-F and wrong-G inputs are explicitly synthetic coverage, not TS producer output. The original ordered F/G control passes. Log: `green-same-face.log`.
- `python -B spike.py --curved` — exit 0; VALIDATED_LOCAL, public verifier PASS (2 cases/8 leaves/10 samples). Log: `green-curved-cli.log`.
- `python -B check_bridge.py --input runs/cli-a32a7e4a4cd5/results.json` — exit 0; PASS, 8 controls, delta+tau 1/200. Log: `green-standalone-bridge.log`.
- `python -B C:/Users/sandr/OrthoSculptCAD/tests/reference/v03_face_cubic_verify.py --input runs/cli-a32a7e4a4cd5/real-face-proof.json` — exit 0; PASS, 2 cases/8 leaves/10 samples. Log: `green-standalone-public.log`.

## SHA-256 from actual files

- `check_bridge.py`: `7ffa29798bfdb9fb750be766ee950755c271b53902f5f6d192f025cc933e7835`
- `README.md`: `4dcc9bd0722d2ef0b89eccc3191139cf07b0a5f4ec2527cfeabe6686f76de1fa`
- `test_same_face_binding.py`: `b8ff180cade093d6a5a1d5fd191a780e997a07d29ced29b9e18780060dc7f92c`
- `review-results.json`: `7b0b33d27739f5002eaa7ec25873d74a973d40712874377c614d878c4cec1e7b`
- `red-source-ac.log`: `76acd01014bb383ab79a0e82f830851240285f4d32691a9794c8947e0dcae7d5`
- `runs/cli-a32a7e4a4cd5/results.json`: `0fa02323f971c9cb091d384a15fec294fde0ec8279f69938b3cdf8d4288e55bb`
- `runs/cli-a32a7e4a4cd5/real-face-proof.json`: `6d59a2734a0a787e5074da743af5f795b8646f6bc7c7f48d5cd6b8f31fbde2ff`

This is local two-face bridge evidence only. Rational/PL approximants are not exact G1; long-curve construction, full-S source admission, global geometry and clinical readiness remain unproven.
