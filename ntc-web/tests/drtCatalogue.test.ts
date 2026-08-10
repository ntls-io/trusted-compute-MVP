/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// tests/drtCatalogue.test.ts
//
// The catalogue is where a mistake is most expensive: everything it declares is
// written into pool state at creation and can never be edited, and every way of
// getting it wrong is only detected by the enclave *after* the user's DRT has
// been burned. These tests cover the three ways it can drift.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DRT_CATALOGUE, chainTypeFor, isSelectable, runtimeFor } from "../lib/drtCatalogue";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SEED = readFileSync(join(HERE, "..", "prisma", "seed.ts"), "utf8");

/**
 * The deployed Anchor program's own rule for deriving execution_type from
 * drt_type. Reproduced here so a renamed catalogue entry fails the suite rather
 * than minting DRTs the enclave will refuse.
 */
function executionTypeOnChain(drtType: string): string {
  if (drtType.startsWith("py_compute_")) return "python";
  if (drtType.startsWith("w_compute_")) return "wasm";
  if (drtType === "append") return "append";
  return "unknown";
}

test("every chain type resolves to the runtime it claims", () => {
  for (const entry of DRT_CATALOGUE) {
    assert.equal(
      executionTypeOnChain(entry.chainType),
      entry.runtime,
      `${entry.id}: drt_type "${entry.chainType}" is execution_type ` +
        `"${executionTypeOnChain(entry.chainType)}" on-chain, not "${entry.runtime}"`
    );
  }
});

test("chain types are distinct", () => {
  const seen = new Set(DRT_CATALOGUE.map((entry) => entry.chainType));
  assert.equal(seen.size, DRT_CATALOGUE.length);
});

test("an unknown id throws rather than guessing a chain type", () => {
  assert.throws(() => chainTypeFor("EXECUTE_VARIANCE_PYTHON"), /not in the catalogue/);
  assert.equal(isSelectable("EXECUTE_VARIANCE_PYTHON"), false);
  assert.equal(runtimeFor("EXECUTE_VARIANCE_PYTHON"), undefined);
});

test("the seed offers exactly the catalogue, plus the non-selectable ownership token", () => {
  const seeded = [...SEED.matchAll(/^\s*id: '([A-Z_]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(
    seeded.slice().sort(),
    [...DRT_CATALOGUE.map((e) => e.id), "OWNERSHIP_TOKEN"].sort()
  );
  // Ownership is minted by the program on append, never picked by a creator.
  assert.equal(isSelectable("OWNERSHIP_TOKEN"), false);
});

test("every seeded hash matches the committed artefact", () => {
  // The hash is the identity of the computation: the enclave downloads the URL
  // and refuses to execute unless it matches, so a stale hash here burns a DRT
  // for nothing.
  const seeded = [...SEED.matchAll(/\$\{EXAMPLES\}\/(\S+?)`,\s*\n\s*isActive: true,\s*\n\s*hash: '([0-9a-f]{64})'/g)];
  assert.equal(seeded.length, 6, "expected six compute DRTs with URL + hash in the seed");

  for (const [, path, hash] of seeded) {
    const bytes = readFileSync(join(REPO, "drt-examples", path));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      hash,
      `drt-examples/${path} does not hash to the value seeded for it`
    );
  }
});
