# Sample data

A schema and dataset that exercise every computation in this directory, so a
pool can be created and all of its DRTs redeemed without inventing data.

| File | Use |
|---|---|
| `schema.json` | The pool schema. Upload at step 1 of pool creation. |
| `seed.json` | Seed dataset sealed into the enclave at pool creation. |
| `contribution.json` | A second dataset for redeeming an Append DRT. |

Four numeric columns — `systolic_bp`, `diastolic_bp`, `resting_hr`, `bmi` — all
declared as `{"type": "array", "items": {"type": "number"}}`, which is the shape
the WASM binaries filter on. Values are synthetic, generated from a fixed random
seed so the committed files are reproducible.

Expected results over `seed.json` alone, for checking an execution returned
something sensible:

| Column | Mean | Median | SD |
|---|---|---|---|
| `systolic_bp` | 124.76 | 126.30 | 13.14 |
| `diastolic_bp` | 77.33 | 77.80 | 6.88 |
| `resting_hr` | 70.21 | 69.00 | 9.13 |
| `bmi` | 25.10 | 24.65 | 4.04 |

Both runtimes should agree to rounding. SD is the **population** estimator
(divide by N): `numpy.std` defaults to `ddof=0`, and the WASM divides by `n`.
Comparing against a sample SD (`statistics.stdev`, divide by N-1) gives
noticeably larger numbers — 13.30 rather than 13.14 for `systolic_bp` — which
is the estimator, not a fault.

Appending `contribution.json` first will move all of these, which is the point:
it is how you confirm the append actually landed in the sealed pool rather than
the enclave replaying a cached result.
