# DRT examples

Reference computations that Digital Rights Tokens can authorise. Each one is
named on-chain by its GitHub URL and the SHA-256 of its artefact; before
running anything, the enclave downloads the file and refuses to execute unless
the hash matches. These are the `(r_j, h_j)` pairs a pool creator admits.

| Computation | Python | WASM |
|---|---|---|
| Mean | [`python/mean.py`](python/mean.py) | [`wasm/bin/mean.wasm`](wasm/bin/mean.wasm) |
| Median | [`python/median.py`](python/median.py) | [`wasm/bin/median.wasm`](wasm/bin/median.wasm) |
| Standard deviation | [`python/sd.py`](python/sd.py) | [`wasm/bin/sd.wasm`](wasm/bin/sd.wasm) |

Ported from [ntls-io/Python-Scripts-MVP](https://github.com/ntls-io/Python-Scripts-MVP)
and [ntls-io/WASM-Binaries-MVP](https://github.com/ntls-io/WASM-Binaries-MVP),
both AGPL-3.0. Filenames were shortened deliberately — see "Why the names are
short" below.

## Data shape

All six read the same column-oriented JSON and return one number per numeric
column:

```json
{ "sepal_length": [5.1, 4.9, 4.7], "sepal_width": [3.5, 3.0, 3.2] }
```

The WASM binaries additionally take the pool's JSON Schema and only aggregate
properties declared as `{"type": "array", "items": {"type": "number"}}`; the
Python scripts aggregate every column they are given. A schema and matching
seed dataset are in [`sample-data/`](sample-data/), which is what the pool
creation flow uploads.

## Hashes

```
d1bb84ecf1f107013df0fe5ea8a63c15bbd673a81a13a6871c6b43d7e85fd690  python/mean.py
c648a5eefbd58c1fe95c48a53ceb7f0957ee1c5842f043710a41b21123e170d7  python/median.py
65230a7a140e30f94fe4d070c9f9e8146a44c2f59d85bff2e83ac9ffa5db39ee  python/sd.py
b5ee81a20256dec2bd3db6e673b11eadae4baf8fafbe68cec1f36517bb569255  wasm/bin/mean.wasm
728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813  wasm/bin/median.wasm
feb835e2eb26115d1865f381ab80440442761f7c89bc7a56d05bca2cb151c37e  wasm/bin/sd.wasm
```

Regenerate with `shasum -a 256 python/*.py wasm/bin/*.wasm`. These values are
mirrored in `ntc-web/prisma/seed.ts`; if they disagree, the enclave rejects the
execution and the DRT is burned for nothing.

**Editing a file here breaks every DRT already minted against it.** The hash is
the identity of the computation, so a change — even whitespace — is a new
computation. Publish revisions as new entries rather than editing in place.

## Rebuilding the WASM binaries

```
cd wasm && make          # requires the wasm32-unknown-unknown target
make hashes              # print the new SHA-256 values
```

The committed binaries are the artefacts the catalogue references. A rebuild on
a different toolchain will almost certainly produce different bytes and
therefore a different hash, so treat `bin/` as the source of truth and rebuild
only when you intend to publish new DRTs.

## Why the names are short

`createPoolWithDrts` carries every DRT's URL and hash in a single Solana
instruction, and a transaction is capped at 1232 bytes. Each compute DRT costs
roughly 190 bytes, of which the URL is the only part under our control — so
`python/median.py` instead of `python/calculate_median.py` is the difference
between fitting three compute DRTs on a pool and fitting two.

Measured, with `append` plus N compute DRTs in one pool:

| URL length | +1 | +2 | +3 | +4 |
|---|---|---|---|---|
| 97 chars (these paths) | 795 | 991 | 1183 | 1382 ✗ |
| 107 chars (long paths) | 817 | 1035 | 1245 ✗ | 1457 ✗ |

The pool creation screen measures the real transaction as DRTs are selected, so
the limit is enforced rather than assumed.
