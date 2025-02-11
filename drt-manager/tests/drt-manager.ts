/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
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

import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN, AnchorProvider } from "@coral-xyz/anchor";
import { DrtManager } from "../target/types/drt_manager";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  getMint,
  createInitializeMintInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

// The Metaplex Token Metadata program id.
const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// === Helper Functions (Reusable for Front-end and Tests) ===

function isPublicKeyLike(obj: any): boolean {
  return (
    obj &&
    typeof obj === "object" &&
    (obj instanceof PublicKey ||
      "_bn" in obj ||
      typeof obj.toBase58 === "function")
  );
}

function formatPublicKeyLike(obj: any): string {
  if (obj instanceof PublicKey) return obj.toBase58();
  try {
    return new PublicKey(obj.toString()).toBase58();
  } catch (e) {
    return obj.toString();
  }
}

function formatBNs(obj: any): any {
  if (obj == null) return obj;
  if (obj instanceof BN) return obj.toString();
  if (isPublicKeyLike(obj)) return formatPublicKeyLike(obj);
  if (Buffer.isBuffer(obj)) return obj.toString("hex");
  if (typeof obj === "bigint") return obj.toString();
  if (Array.isArray(obj)) return obj.map(formatBNs);
  if (typeof obj === "object") {
    const ret: any = {};
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const value = obj[key];
      if (
        [
          "owner",
          "ownershipMint",
          "address",
          "mint",
          "mintAuthority",
          "freezeAuthority",
        ].includes(key) &&
        value
      ) {
        try {
          ret[key] = new PublicKey(value.toString()).toBase58();
          continue;
        } catch (e) { }
      }
      ret[key] = formatBNs(value);
    }
    return ret;
  }
  return obj;
}

async function processPoolData(poolData: any) {
  return {
    ...poolData,
    owner:
      poolData.owner instanceof PublicKey
        ? poolData.owner
        : new PublicKey(poolData.owner.toString()),
    ownershipMint: poolData.ownershipMint
      ? poolData.ownershipMint instanceof PublicKey
        ? poolData.ownershipMint
        : new PublicKey(poolData.ownershipMint.toString())
      : null,
    appendMint: poolData.appendMint
      ? poolData.appendMint instanceof PublicKey
        ? poolData.appendMint
        : new PublicKey(poolData.appendMint.toString())
      : null,
    wComputeMedianMint: poolData.wComputeMedianMint
      ? poolData.wComputeMedianMint instanceof PublicKey
        ? poolData.wComputeMedianMint
        : new PublicKey(poolData.wComputeMedianMint.toString())
      : null,
    pyComputeMedianMint: poolData.pyComputeMedianMint
      ? poolData.pyComputeMedianMint instanceof PublicKey
        ? poolData.pyComputeMedianMint
        : new PublicKey(poolData.pyComputeMedianMint.toString())
      : null,
  };
}

async function processMintInfo(mintInfo: any) {
  return {
    ...mintInfo,
    address:
      mintInfo.address instanceof PublicKey
        ? mintInfo.address
        : new PublicKey(mintInfo.address.toString()),
    mintAuthority: mintInfo.mintAuthority
      ? mintInfo.mintAuthority instanceof PublicKey
        ? mintInfo.mintAuthority
        : new PublicKey(mintInfo.mintAuthority.toString())
      : null,
    freezeAuthority: mintInfo.freezeAuthority
      ? mintInfo.freezeAuthority instanceof PublicKey
        ? mintInfo.freezeAuthority
        : new PublicKey(mintInfo.freezeAuthority.toString())
      : null,
  };
}

async function processTokenAccountInfo(tokenInfo: any) {
  return {
    ...tokenInfo,
    address:
      tokenInfo.address instanceof PublicKey
        ? tokenInfo.address
        : new PublicKey(tokenInfo.address.toString()),
    mint:
      tokenInfo.mint instanceof PublicKey
        ? tokenInfo.mint
        : new PublicKey(tokenInfo.mint.toString()),
    owner:
      tokenInfo.owner instanceof PublicKey
        ? tokenInfo.owner
        : new PublicKey(tokenInfo.owner.toString()),
  };
}

async function createNewMint(
  mintAuthority: PublicKey,
  decimals: number = 0
): Promise<PublicKey> {
  const mintKeypair = web3.Keypair.generate();
  const provider = anchor.getProvider();
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    82
  );
  const createMintIx = web3.SystemProgram.createAccount({
    fromPubkey: (provider as AnchorProvider).publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: 82,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  });
  const initMintIx = createInitializeMintInstruction(
    mintKeypair.publicKey,
    decimals,
    mintAuthority,
    mintAuthority
  );
  const tx = new web3.Transaction().add(createMintIx).add(initMintIx);
  await provider.sendAndConfirm(tx, [mintKeypair]);
  return mintKeypair.publicKey;
}

async function createMetadataAccount(
  mint: PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<PublicKey> {
  const [metadataPda] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return metadataPda;
}

function getPoolPda(
  owner: PublicKey,
  poolName: string,
  poolId: number,
  programId: PublicKey
): [PublicKey, number] {
  const poolIdBuffer = Buffer.alloc(8);
  poolIdBuffer.writeUInt32LE(poolId, 0);
  poolIdBuffer.writeUInt32LE(0, 4);
  return web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      owner.toBuffer(),
      Buffer.from(poolName),
      poolIdBuffer,
    ],
    programId
  );
}

/** Creates a new pool along with its vault and fee vault.
 *  Returns an object containing the pool PDA, vault PDA, fee vault PDA,
 *  the ownership mint and the vault’s associated token account.
 */
async function createPool(
  program: Program<DrtManager>,
  poolName: string,
  poolId: number,
  ownershipSupply: BN,
  appendSupply: BN,
  allowedDrts: string[]
): Promise<{
  pool: PublicKey;
  vault: PublicKey;
  feeVault: PublicKey;
  ownershipMint: PublicKey;
  vaultTokenAccount: PublicKey;
}> {
  const [poolPda] = getPoolPda(
    (anchor.getProvider() as AnchorProvider).wallet.publicKey,
    poolName,
    poolId,
    program.programId
  );
  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), poolPda.toBuffer()],
    program.programId
  );
  const [feeVaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("fee_vault"), poolPda.toBuffer()],
    program.programId
  );
  const ownershipMint = await createNewMint(vaultPda);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    ownershipMint,
    vaultPda,
    true
  );

  await program.methods
    .initializePool(
      poolName,
      new BN(poolId),
      ownershipSupply,
      appendSupply,
      allowedDrts
    )
    .accounts({
      pool: poolPda,
      owner: (anchor.getProvider() as AnchorProvider).wallet.publicKey,
      ownershipMint,
      vault: vaultPda,
      vaultTokenAccount: vaultTokenAccount,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  // Initialize fee vault.
  await program.methods
    .initializeFeeVault()
    .accounts({
      feeVault: feeVaultPda,
      pool: poolPda,
      owner: (anchor.getProvider() as AnchorProvider).wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  return {
    pool: poolPda,
    vault: vaultPda,
    feeVault: feeVaultPda,
    ownershipMint,
    vaultTokenAccount,
  };
}

/** Sets metadata for a given mint. Returns the metadata PDA. */
async function setMetadata(
  program: Program<DrtManager>,
  mint: PublicKey,
  pool: PublicKey,
  vault: PublicKey,
  owner: PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<PublicKey> {
  const metadataPda = await createMetadataAccount(mint, name, symbol, uri);
  await program.methods
    .setTokenMetadata(name, symbol, uri)
    .accounts({
      metadata: metadataPda,
      mint: mint,
      pool: pool,
      vault: vault,
      owner: owner,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  return metadataPda;
}

/** Initializes a DRT (for example, the “append” type).
 *  Returns the vault’s associated DRT token account.
 */
async function initializeDRT(
  program: Program<DrtManager>,
  pool: PublicKey,
  vault: PublicKey,
  owner: PublicKey,
  drtMint: PublicKey,
  drtSupply: BN,
  drtType: string
): Promise<PublicKey> {
  const vaultDRTTokenAccount = await getAssociatedTokenAddress(
    drtMint,
    vault,
    true
  );
  await program.methods
    .initializeDrt(drtType, drtSupply)
    .accounts({
      pool: pool,
      drtMint: drtMint,
      vault: vault,
      vaultDrtTokenAccount: vaultDRTTokenAccount,
      owner: owner,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
  return vaultDRTTokenAccount;
}

// === Tests ===

describe("drt_manager", function () {
  this.timeout(120000);
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DrtManager as Program<DrtManager>;
  const connection = provider.connection;

  it("\n\n=== START: 'Initializes pool with proper token metadata' ===", async () => {
    const poolName = "developer_salary";
    const poolId = 1;
    const ownershipSupply = new BN(1_000_000);
    const appendSupply = new BN(5000);
    const allowedDrts = ["append", "w_compute_median", "py_compute_median"];

    const { pool, vault, feeVault, ownershipMint, vaultTokenAccount } =
      await createPool(
        program,
        poolName,
        poolId,
        ownershipSupply,
        appendSupply,
        allowedDrts
      );

    console.log("Pool data:");
    const poolData = await program.account.pool.fetch(pool);
    console.log(
      JSON.stringify(formatBNs(await processPoolData(poolData)), null, 2)
    );

    console.log("Ownership mint info:");
    const mintInfo = await getMint(connection, ownershipMint);
    console.log(
      JSON.stringify(formatBNs(await processMintInfo(mintInfo)), null, 2)
    );

    console.log("Vault token account info:");
    const vaultInfo = await getAccount(connection, vaultTokenAccount);
    console.log(
      JSON.stringify(
        formatBNs(await processTokenAccountInfo(vaultInfo)),
        null,
        2
      )
    );

    const metadataPda = await setMetadata(
      program,
      ownershipMint,
      pool,
      vault,
      provider.wallet.publicKey,
      `${poolName}_ownership`,
      "OWN",
      "https://arweave.net/your-metadata-uri"
    );
    console.log("Ownership metadata PDA:", metadataPda.toBase58());
  });

  it("\n\n=== START: 'Initializes and redeems Append DRT with metadata using generic instructions' ===", async () => {
    const poolName = "append_drt_test";
    const poolId = 1;
    const ownershipSupply = new BN(100_000);
    const appendDrtSupply = new BN(100);
    const allowedDrts = ["append", "py_compute_median"];

    const { pool, vault, feeVault, ownershipMint } = await createPool(
      program,
      poolName,
      poolId,
      ownershipSupply,
      appendDrtSupply,
      allowedDrts
    );

    await setMetadata(
      program,
      ownershipMint,
      pool,
      vault,
      provider.wallet.publicKey,
      `${poolName}_ownership`,
      "OWN",
      "https://arweave.net/your-metadata-uri"
    );

    const appendMint = await createNewMint(vault);
    console.log("Append mint:", appendMint.toBase58());

    const vaultDRTTokenAccount = await initializeDRT(
      program,
      pool,
      vault,
      provider.wallet.publicKey,
      appendMint,
      appendDrtSupply,
      "append"
    );

    const appendDrtMetadataPda = await createMetadataAccount(
      appendMint,
      "AppendDRT",
      "APPEND",
      "https://arweave.net/append-drt"
    );
    await program.methods
      .setTokenMetadata("AppendDRT", "APPEND", "https://arweave.net/append-drt")
      .accounts({
        metadata: appendDrtMetadataPda,
        mint: appendMint,
        pool: pool,
        vault: vault,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Append DRT metadata set.");

    const buyer = provider.wallet.publicKey;
    const buyerAppendTokenAcct = await getAssociatedTokenAddress(
      appendMint,
      buyer
    );
    let ataInfo = await connection.getAccountInfo(buyerAppendTokenAcct);
    if (!ataInfo) {
      console.log("Creating buyer's ATA for Append DRT...");
      const createAtaIx = createAssociatedTokenAccountInstruction(
        buyer,
        buyerAppendTokenAcct,
        buyer,
        appendMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(createAtaIx));
    }
    const feePaid = new BN(1000);
    await program.methods
      .buyDrt("append", feePaid)
      .accounts({
        pool: pool,
        drtMint: appendMint,
        vaultDrtTokenAccount: vaultDRTTokenAccount,
        userDrtTokenAccount: buyerAppendTokenAcct,
        vault: vault,
        feeVault: feeVault,
        buyerWallet: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Buy DRT succeeded.");

    const buyerOwnershipTokenAcct = await getAssociatedTokenAddress(
      ownershipMint,
      buyer
    );
    let ownershipAtaInfo = await connection.getAccountInfo(
      buyerOwnershipTokenAcct
    );
    if (!ownershipAtaInfo) {
      console.log("Creating buyer's ATA for ownership token...");
      const createAtaIx2 = createAssociatedTokenAccountInstruction(
        buyer,
        buyerOwnershipTokenAcct,
        buyer,
        ownershipMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(createAtaIx2));
    }
    await program.methods
      .redeemDrt("append")
      .accounts({
        pool: pool,
        drtMint: appendMint,
        ownershipMint: ownershipMint,
        userDrtTokenAccount: buyerAppendTokenAcct,
        userOwnershipTokenAccount: buyerOwnershipTokenAcct,
        vault: vault,
        owner: buyer,
        user: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Redeem DRT succeeded.");
  });

  it("\n\n=== START: 'Allows multiple pools with the same name' ===", async () => {
    const duplicatePoolName = "duplicate_pool";
    const ownershipSupply = new BN(500_000);
    const appendSupply = new BN(2500);
    const allowedDrts = ["append"];

    const poolData1 = await createPool(
      program,
      duplicatePoolName,
      1,
      ownershipSupply,
      appendSupply,
      allowedDrts
    );
    const metadataPda1 = await createMetadataAccount(
      poolData1.ownershipMint,
      `${duplicatePoolName}_ownership`,
      "OWN",
      "https://arweave.net/duplicate1"
    );
    await program.methods
      .setTokenMetadata(
        `${duplicatePoolName}_ownership`,
        "OWN",
        "https://arweave.net/duplicate1"
      )
      .accounts({
        metadata: metadataPda1,
        mint: poolData1.ownershipMint,
        pool: poolData1.pool,
        vault: poolData1.vault,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const poolData2 = await createPool(
      program,
      duplicatePoolName,
      2,
      ownershipSupply,
      appendSupply,
      allowedDrts
    );
    const metadataPda2 = await createMetadataAccount(
      poolData2.ownershipMint,
      `${duplicatePoolName}_ownership`,
      "OWN",
      "https://arweave.net/duplicate2"
    );
    await program.methods
      .setTokenMetadata(
        `${duplicatePoolName}_ownership`,
        "OWN",
        "https://arweave.net/duplicate2"
      )
      .accounts({
        metadata: metadataPda2,
        mint: poolData2.ownershipMint,
        pool: poolData2.pool,
        vault: poolData2.vault,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const rawPoolData1 = await program.account.pool.fetch(poolData1.pool);
    const rawPoolData2 = await program.account.pool.fetch(poolData2.pool);
    console.log(
      "Pool 1 data:",
      JSON.stringify(formatBNs(await processPoolData(rawPoolData1)), null, 2)
    );
    console.log(
      "Pool 2 data:",
      JSON.stringify(formatBNs(await processPoolData(rawPoolData2)), null, 2)
    );
  });

  it("\n\n=== START: 'Credit Data Pool with Full DRT Lifecycle Test' ===", async () => {
    const poolName = "credit_data";
    const poolId = 1;
    const ownershipSupply = new BN(100);
    const appendSupply = new BN(100);
    const wComputeSupply = new BN(50);
    const pyComputeSupply = new BN(50);
    const allowedDrts = ["append", "w_compute_median", "py_compute_median"];
    const fee = new BN(100000000);

    console.log("Initializing Credit Data Pool...");
    const { pool, vault, feeVault, ownershipMint } = await createPool(
      program,
      poolName,
      poolId,
      ownershipSupply,
      appendSupply,
      allowedDrts
    );
    console.log("Fee Vault PDA:", feeVault.toBase58());
    await setMetadata(
      program,
      ownershipMint,
      pool,
      vault,
      provider.wallet.publicKey,
      `${poolName}_ownership`,
      "OWN",
      "https://arweave.net/creditdata/ownership"
    );
    console.log("Ownership metadata set.");

    console.log("Initializing Append DRT...");
    const appendMint = await createNewMint(vault);
    const vaultAppendTokenAcct = await getAssociatedTokenAddress(
      appendMint,
      vault,
      true
    );
    await program.methods
      .initializeDrt("append", appendSupply)
      .accounts({
        pool: pool,
        drtMint: appendMint,
        vault: vault,
        vaultDrtTokenAccount: vaultAppendTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Append DRT initialized.");

    console.log("Initializing W-Compute Median DRT...");
    const wComputeMint = await createNewMint(vault);
    const vaultWComputeTokenAcct = await getAssociatedTokenAddress(
      wComputeMint,
      vault,
      true
    );
    await program.methods
      .initializeDrt("w_compute_median", wComputeSupply)
      .accounts({
        pool: pool,
        drtMint: wComputeMint,
        vault: vault,
        vaultDrtTokenAccount: vaultWComputeTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("W-Compute Median DRT initialized.");

    console.log("Initializing Py-Compute Median DRT...");
    const pyComputeMint = await createNewMint(vault);
    const vaultPyComputeTokenAcct = await getAssociatedTokenAddress(
      pyComputeMint,
      vault,
      true
    );
    await program.methods
      .initializeDrt("py_compute_median", pyComputeSupply)
      .accounts({
        pool: pool,
        drtMint: pyComputeMint,
        vault: vault,
        vaultDrtTokenAccount: vaultPyComputeTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Py-Compute Median DRT initialized.");

    const buyer = provider.wallet.publicKey;
    const buyerAppendAta = await getAssociatedTokenAddress(appendMint, buyer);
    let ataInfo = await connection.getAccountInfo(buyerAppendAta);
    if (!ataInfo) {
      console.log("Creating buyer's ATA for Append DRT...");
      const createAtaIx = createAssociatedTokenAccountInstruction(
        buyer,
        buyerAppendAta,
        buyer,
        appendMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(createAtaIx));
    }
    for (let i = 0; i < 5; i++) {
      await program.methods
        .buyDrt("append", fee)
        .accounts({
          pool: pool,
          drtMint: appendMint,
          vaultDrtTokenAccount: vaultAppendTokenAcct,
          userDrtTokenAccount: buyerAppendAta,
          vault: vault,
          feeVault: feeVault,
          buyerWallet: buyer,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`Bought Append DRT #${i + 1}`);
    }
    const buyerOwnershipAta = await getAssociatedTokenAddress(
      ownershipMint,
      buyer
    );
    let ownershipAtaInfo = await connection.getAccountInfo(buyerOwnershipAta);
    if (!ownershipAtaInfo) {
      console.log("Creating buyer's ATA for ownership token...");
      const createOwnershipAtaIx = createAssociatedTokenAccountInstruction(
        buyer,
        buyerOwnershipAta,
        buyer,
        ownershipMint
      );
      await provider.sendAndConfirm(
        new web3.Transaction().add(createOwnershipAtaIx)
      );
    }
    for (let i = 0; i < 5; i++) {
      await program.methods
        .redeemDrt("append")
        .accounts({
          pool: pool,
          drtMint: appendMint,
          ownershipMint: ownershipMint,
          userDrtTokenAccount: buyerAppendAta,
          userOwnershipTokenAccount: buyerOwnershipAta,
          vault: vault,
          owner: buyer,
          user: buyer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(`Redeemed Append DRT #${i + 1}`);
    }
    const buyerOwnershipInfo = await getAccount(connection, buyerOwnershipAta);
    console.log(
      "Final ownership token balance:",
      buyerOwnershipInfo.amount.toString()
    );
    const feeVaultBalance = await connection.getBalance(feeVault);
    console.log("Final fee vault balance:", feeVaultBalance.toString());
    await program.methods
      .redeemOwnershipTokens(new BN(5))
      .accounts({
        pool: pool,
        ownershipMint: ownershipMint,
        userOwnershipTokenAccount: buyerOwnershipAta,
        userWallet: buyer,
        vault: vault,
        feeVault: feeVault,
        user: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    const finalFeeVaultBalance = await connection.getBalance(feeVault);
    console.log(
      "Fee vault balance after redemption:",
      finalFeeVaultBalance.toString()
    );
    const finalOwnershipInfo = await getAccount(connection, buyerOwnershipAta);
    console.log(
      "Final ownership token balance:",
      finalOwnershipInfo.amount.toString()
    );
  });
});
