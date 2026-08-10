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

// tests/poolBudget.test.ts
//
// The pool creation screen disables DRT checkboxes using an analytic size
// model rather than building a transaction on every tick. That is only safe
// while the model agrees with a real serialized transaction, which is what
// this asserts. If it drifts, the UI will either block valid selections or —
// worse — allow one that fails in the wallet after the user has filled in
// everything else.

import test from "node:test";
import assert from "node:assert/strict";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

import idl from "../lib/idl/drt_manager.json";
import { buildPoolCreationTx, formatDrtConfigs } from "../lib/drtHelpers";
import { memoFor, memoInstruction, MAX_TRANSACTION_LEN } from "../lib/redemption";
import {
  canAdd,
  drtConfigBytes,
  maxPoolNameLength,
  MIN_POOL_NAME_LENGTH,
  poolBudget,
  poolCreationBytes,
  type DrtConfigShape,
} from "../lib/poolBudget";

const EXAMPLES =
  "https://github.com/Relational-Network/trusted-compute-MVP/blob/main/drt-examples";
const HASH = "a".repeat(64);

const APPEND: DrtConfigShape = { drtType: "append" };
const PY_MEDIAN: DrtConfigShape = {
  drtType: "py_compute_median",
  githubUrl: `${EXAMPLES}/python/median.py`,
  codeHash: HASH,
};
const PY_MEAN: DrtConfigShape = {
  drtType: "py_compute_mean",
  githubUrl: `${EXAMPLES}/python/mean.py`,
  codeHash: HASH,
};
const PY_SD: DrtConfigShape = {
  drtType: "py_compute_sd",
  githubUrl: `${EXAMPLES}/python/sd.py`,
  codeHash: HASH,
};
const W_MEDIAN: DrtConfigShape = {
  drtType: "w_compute_median",
  githubUrl: `${EXAMPLES}/wasm/bin/median.wasm`,
  codeHash: HASH,
};

/** Build and measure the transaction the wallet would actually be asked to sign. */
async function realSize(configs: DrtConfigShape[], poolName: string): Promise<number> {
  const owner = Keypair.generate();
  const provider = new anchor.AnchorProvider(
    new Connection("https://api.devnet.solana.com"),
    new anchor.Wallet(owner),
    {}
  );
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const withAmounts = configs.map((c) => ({
    ...c,
    githubUrl: c.githubUrl ?? undefined,
    codeHash: c.codeHash ?? undefined,
    supply: new BN(100),
    cost: new BN(1_000_000),
  }));
  const { transactions } = await buildPoolCreationTx(
    program as unknown as anchor.Program,
    provider,
    poolName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formatDrtConfigs(withAmounts as any),
    new BN(1000)
  );
  const tx = transactions[0];
  tx.add(memoInstruction(memoFor(new Uint8Array(32).fill(3), "{}", null)));
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = bs58.encode(new Uint8Array(32).fill(1));
  return (
    1 +
    64 * tx.compileMessage().header.numRequiredSignatures +
    tx.serializeMessage().length
  );
}

test("the size model matches a real serialized transaction", async () => {
  const cases: Array<[DrtConfigShape[], string]> = [
    [[APPEND], "pool"],
    [[APPEND, PY_MEDIAN], "pool"],
    [[APPEND, PY_MEDIAN, PY_MEAN], "my-data-pool"],
    [[APPEND, PY_MEDIAN, PY_MEAN, PY_SD], "clinical-measurements-2026"],
    [[APPEND, W_MEDIAN], "a-rather-long-pool-name-here-ok"],
    [[PY_SD], "x"],
  ];

  for (const [configs, name] of cases) {
    const predicted = poolCreationBytes(configs, name.length);
    const actual = await realSize(configs, name);
    assert.equal(
      predicted,
      actual,
      `${configs.length} DRTs, ${name.length}-char name: model ${predicted}, actual ${actual}`
    );
  }
});

test("append costs far less than a compute DRT", () => {
  // Append is native to the enclave, so it carries no URL or hash on-chain.
  assert.equal(drtConfigBytes(APPEND), 4 + 6 + 8 + 8 + 1 + 1);
  assert.ok(drtConfigBytes(PY_MEDIAN) > drtConfigBytes(APPEND) * 5);
});

test("three compute DRTs fit, four do not", () => {
  assert.ok(poolBudget([APPEND, PY_MEDIAN, PY_MEAN, PY_SD]).fits);
  assert.equal(poolBudget([APPEND, PY_MEDIAN, PY_MEAN, PY_SD, W_MEDIAN]).fits, false);
});

test("the pool name shares the budget with the DRT selection", () => {
  const three = [APPEND, PY_MEDIAN, PY_MEAN, PY_SD];
  const room = maxPoolNameLength(three);

  // A name exactly at the limit fits; one character more does not.
  assert.ok(poolCreationBytes(three, room) <= MAX_TRANSACTION_LEN);
  assert.ok(poolCreationBytes(three, room + 1) > MAX_TRANSACTION_LEN);

  // Dropping a DRT must buy room for a longer name.
  assert.ok(maxPoolNameLength([APPEND, PY_MEDIAN, PY_MEAN]) > room);
});

test("canAdd refuses the DRT that would leave no room for a name", () => {
  const three = [APPEND, PY_MEDIAN, PY_MEAN, PY_SD];
  assert.equal(canAdd([APPEND, PY_MEDIAN], PY_MEAN), true);
  assert.equal(canAdd(three, W_MEDIAN), false);
});

test("a selection is only accepted with room for a minimum name", () => {
  const three = [APPEND, PY_MEDIAN, PY_MEAN, PY_SD];
  const budget = poolBudget(three);
  assert.ok(budget.poolNameBudget >= MIN_POOL_NAME_LENGTH);
  assert.equal(budget.fits, budget.poolNameBudget >= MIN_POOL_NAME_LENGTH);
});
