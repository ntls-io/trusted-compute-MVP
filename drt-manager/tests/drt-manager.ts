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

function isPublicKeyLike(obj: any): boolean {
  return (
    obj &&
    typeof obj === 'object' &&
    (obj instanceof PublicKey ||
      '_bn' in obj ||
      (typeof obj.toBase58 === 'function'))
  );
}

function formatPublicKeyLike(obj: any): string {
  if (obj instanceof PublicKey) {
    return obj.toBase58();
  }
  try {
    // For both _bn objects and numeric strings
    return new PublicKey(obj.toString()).toBase58();
  } catch (e) {
    // If conversion fails, return original toString
    return obj.toString();
  }
}

/**
 * Helper: Recursively convert BN instances and PublicKeys in an object to their string representation
 * @param obj - The object to format
 * @returns The formatted object with BNs and PublicKeys converted to strings
 */
function formatBNs(obj: any): any {
  // Handle null/undefined
  if (obj == null) {
    return obj;
  }

  // Handle BN instances
  if (obj instanceof BN) {
    return obj.toString();
  }

  // Handle PublicKey-like objects - this should come before object check
  if (isPublicKeyLike(obj)) {
    return formatPublicKeyLike(obj);
  }

  // Handle Buffer instances
  if (Buffer.isBuffer(obj)) {
    return obj.toString('hex');
  }

  // Handle BigInt values
  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(formatBNs);
  }

  // Handle plain objects
  if (typeof obj === 'object') {
    const ret: any = {};
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      
      // Special case for known PublicKey fields
      const value = obj[key];
      if (['owner', 'ownershipMint', 'address', 'mint', 'mintAuthority', 'freezeAuthority'].includes(key) && value) {
        try {
          ret[key] = new PublicKey(value.toString()).toBase58();
          continue;
        } catch (e) {
          // If conversion fails, process normally
        }
      }
      
      ret[key] = formatBNs(value);
    }
    return ret;
  }

  // Return primitive values as is
  return obj;
}

async function processPoolData(poolData: any) {
  return {
    ...poolData,
    owner: poolData.owner instanceof PublicKey ? 
      poolData.owner : 
      new PublicKey(poolData.owner.toString()),
    ownershipMint: poolData.ownershipMint ? 
      (poolData.ownershipMint instanceof PublicKey ? 
        poolData.ownershipMint : 
        new PublicKey(poolData.ownershipMint.toString())) : 
      null,
    appendMint: poolData.appendMint ? 
      (poolData.appendMint instanceof PublicKey ? 
        poolData.appendMint : 
        new PublicKey(poolData.appendMint.toString())) : 
      null,
    wComputeMedianMint: poolData.wComputeMedianMint ? 
      (poolData.wComputeMedianMint instanceof PublicKey ? 
        poolData.wComputeMedianMint : 
        new PublicKey(poolData.wComputeMedianMint.toString())) : 
      null,
    pyComputeMedianMint: poolData.pyComputeMedianMint ? 
      (poolData.pyComputeMedianMint instanceof PublicKey ? 
        poolData.pyComputeMedianMint : 
        new PublicKey(poolData.pyComputeMedianMint.toString())) : 
      null,
  };
}

async function processMintInfo(mintInfo: any) {
  return {
    ...mintInfo,
    address: mintInfo.address instanceof PublicKey ? 
      mintInfo.address : 
      new PublicKey(mintInfo.address.toString()),
    mintAuthority: mintInfo.mintAuthority ? 
      (mintInfo.mintAuthority instanceof PublicKey ? 
        mintInfo.mintAuthority : 
        new PublicKey(mintInfo.mintAuthority.toString())) : 
      null,
    freezeAuthority: mintInfo.freezeAuthority ? 
      (mintInfo.freezeAuthority instanceof PublicKey ? 
        mintInfo.freezeAuthority : 
        new PublicKey(mintInfo.freezeAuthority.toString())) : 
      null,
  };
}

async function processTokenAccountInfo(tokenInfo: any) {
  return {
    ...tokenInfo,
    address: tokenInfo.address instanceof PublicKey ? 
      tokenInfo.address : 
      new PublicKey(tokenInfo.address.toString()),
    mint: tokenInfo.mint instanceof PublicKey ? 
      tokenInfo.mint : 
      new PublicKey(tokenInfo.mint.toString()),
    owner: tokenInfo.owner instanceof PublicKey ? 
      tokenInfo.owner : 
      new PublicKey(tokenInfo.owner.toString()),
  };
}

/**
 * Creates a new SPL mint with [mintAuthority] as both the mint and freeze authority.
 */
async function createNewMint(
  mintAuthority: web3.PublicKey,
  decimals: number = 0
): Promise<web3.PublicKey> {
  const mintKeypair = web3.Keypair.generate();
  const provider = anchor.getProvider();
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(82);
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

/**
 * Returns the PDA for the Metaplex metadata for a given mint.
 */
async function createMetadataAccount(
  mint: web3.PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<web3.PublicKey> {
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

/**
 * Helper to compute a pool PDA from:
 *   seeds = [b"pool", owner, pool_name, pool_id (as 8-byte little endian)]
 */
function getPoolPda(
  owner: web3.PublicKey,
  poolName: string,
  poolId: number,
  programId: web3.PublicKey
): [web3.PublicKey, number] {
  const poolIdBuffer = Buffer.alloc(8);
  poolIdBuffer.writeUInt32LE(poolId, 0); // Lower 32 bits
  poolIdBuffer.writeUInt32LE(0, 4); // Upper 32 bits (assuming poolId < 2^32)
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

describe("drt_manager", function () {
  // Increase timeout to 2 minutes.
  this.timeout(120000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DrtManager as Program<DrtManager>;
  const connection = provider.connection;

  it("\n\n=== START: 'Initializes pool with proper token metadata' ===", async () => {
    const poolName = "developer_salary";
    const poolId = 1; // Use poolId 1 for this pool.
    const ownershipSupply = new BN(1_000_000);
    const appendSupply = new BN(5000);
    const allowedDrts = ["append", "w_compute_median", "py_compute_median"];

    // Compute pool PDA.
    const [poolPda, poolBump] = getPoolPda(
      provider.wallet.publicKey,
      poolName,
      poolId,
      program.programId
    );
    console.log("Pool PDA:", poolPda.toBase58());

    // Derive vault PDA using poolPda.
    const [vaultPda, vaultBump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPda.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda.toBase58());

    // Create the ownership mint (using vaultPda as mint authority).
    console.log("Creating ownership mint...");
    const ownershipMint = await createNewMint(vaultPda);
    console.log("Ownership mint:", ownershipMint.toBase58());

    // Derive the vault's associated token account.
    const vaultTokenAccount = await getAssociatedTokenAddress(
      ownershipMint,
      vaultPda,
      true
    );
    console.log("Vault token account:", vaultTokenAccount.toBase58());

    // Prepare metadata PDA for the ownership mint.
    const ownershipMetadataPda = await createMetadataAccount(
      ownershipMint,
      `${poolName}_ownership`,
      "OWN",
      "https://arweave.net/your-metadata-uri"
    );
    console.log("Ownership metadata PDA:", ownershipMetadataPda.toBase58());

    // Initialize the pool.
    console.log("Initializing pool...");
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
        owner: provider.wallet.publicKey,
        ownershipMint,
        vault: vaultPda,
        vaultTokenAccount: vaultTokenAccount,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Pool initialized successfully!");

    // Set token metadata for the ownership token.
    console.log("Setting metadata for ownership token...");
    await program.methods
      .setTokenMetadata(
        `${poolName}_ownership`,
        "OWN",
        "https://arweave.net/your-metadata-uri"
      )
      .accounts({
        metadata: ownershipMetadataPda,
        mint: ownershipMint,
        pool: poolPda,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Ownership token metadata set successfully!");

    // Fetch and log on-chain data.
    const poolData = await program.account.pool.fetch(poolPda);
    const mintInfo = await getMint(connection, ownershipMint);
    const vaultTokenInfo = await getAccount(connection, vaultTokenAccount);

    // Use our helper functions to process the data
    const processedPoolData = await processPoolData(poolData);
    const processedMintInfo = await processMintInfo(mintInfo);
    const processedVaultTokenInfo = await processTokenAccountInfo(vaultTokenInfo);

    console.log("Pool data:\n", JSON.stringify(formatBNs(processedPoolData), null, 2));
    console.log("Ownership mint info:\n", JSON.stringify(formatBNs(processedMintInfo), null, 2));
    console.log("Vault token account info:\n", JSON.stringify(formatBNs(processedVaultTokenInfo), null, 2));
  });

  it("\n\n=== START: 'Initializes and redeems Append DRT with metadata using generic instructions' ===", async () => {
    const poolName = "append_drt_test";
    const poolId = 1;
    const ownershipSupply = new BN(100_000);
    const appendDrtSupply = new BN(100);
    const allowedDrts = ["append", "py_compute_median"];

    // Compute pool PDA.
    const [poolPda, poolBump] = getPoolPda(
      provider.wallet.publicKey,
      poolName,
      poolId,
      program.programId
    );
    console.log("Pool PDA:", poolPda.toBase58());

    // Derive vault PDA.
    const [vaultPda, vaultBump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPda.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda.toBase58());

    // Create the ownership mint.
    console.log("Creating ownership mint...");
    const ownershipMint = await createNewMint(vaultPda);
    console.log("Ownership mint:", ownershipMint.toBase58());

    // Derive vault associated token account for ownership.
    const vaultOwnershipTokenAcct = await getAssociatedTokenAddress(
      ownershipMint,
      vaultPda,
      true
    );
    console.log("Vault ownership token account:", vaultOwnershipTokenAcct.toBase58());

    // Initialize the pool.
    console.log("Initializing pool...");
    await program.methods
      .initializePool(
        poolName,
        new BN(poolId),
        ownershipSupply,
        appendDrtSupply,
        allowedDrts
      )
      .accounts({
        pool: poolPda,
        owner: provider.wallet.publicKey,
        ownershipMint,
        vault: vaultPda,
        vaultTokenAccount: vaultOwnershipTokenAcct,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Pool initialized successfully!");

    // Create the "append" DRT mint.
    console.log("Creating Append DRT mint...");
    const appendMint = await createNewMint(vaultPda);
    console.log("Append mint:", appendMint.toBase58());

    // Derive vault associated token account for the DRT.
    const vaultAppendTokenAcct = await getAssociatedTokenAddress(
      appendMint,
      vaultPda,
      true
    );
    console.log("Vault append token account:", vaultAppendTokenAcct.toBase58());

    // Initialize the "append" DRT.
    console.log("Initializing 'append' DRT...");
    await program.methods
      .initializeDrt("append", appendDrtSupply)
      .accounts({
        pool: poolPda,
        drtMint: appendMint,
        vault: vaultPda,
        vaultDrtTokenAccount: vaultAppendTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Append DRT initialized successfully!");

    // Set metadata for the Append DRT.
    console.log("Setting metadata for Append DRT...");
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
        pool: poolPda,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Append DRT metadata set successfully!");

    // Buyer buys 1 Append DRT.
    const buyer = provider.wallet.publicKey;
    const buyerAppendTokenAcct = await getAssociatedTokenAddress(
      appendMint,
      buyer
    );
    let ataInfo = await connection.getAccountInfo(buyerAppendTokenAcct);
    if (!ataInfo) {
      console.log("Buyer ATA for Append DRT does not exist; creating it...");
      const createAtaIx = createAssociatedTokenAccountInstruction(
        buyer,
        buyerAppendTokenAcct,
        buyer,
        appendMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(createAtaIx));
      console.log("Buyer ATA created for Append DRT.");
    }
    console.log("Buying 1 Append DRT with fee 1000...");
    const feePaid = new BN(1000);
    await program.methods
      .buyDrt("append", feePaid)
      .accounts({
        pool: poolPda,
        drtMint: appendMint,
        vaultDrtTokenAccount: vaultAppendTokenAcct,
        userDrtTokenAccount: buyerAppendTokenAcct,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Buy DRT succeeded!");

    // Buyer redeems 1 Append DRT.
    const buyerOwnershipTokenAcct = await getAssociatedTokenAddress(
      ownershipMint,
      buyer
    );
    let buyerOwnershipInfo = await connection.getAccountInfo(buyerOwnershipTokenAcct);
    if (!buyerOwnershipInfo) {
      console.log("Buyer ATA for ownership token does not exist; creating it...");
      const createAtaIx2 = createAssociatedTokenAccountInstruction(
        buyer,
        buyerOwnershipTokenAcct,
        buyer,
        ownershipMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(createAtaIx2));
      console.log("Buyer ATA created for ownership token.");
    }
    console.log("Redeeming 1 Append DRT...");
    await program.methods
      .redeemDrt("append")
      .accounts({
        pool: poolPda,
        drtMint: appendMint,
        ownershipMint,
        userDrtTokenAccount: buyerAppendTokenAcct,
        userOwnershipTokenAccount: buyerOwnershipTokenAcct,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        user: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Redeem DRT succeeded!");

    // Verify redemption result.
    const buyerOwnershipAcctInfo = await getAccount(connection, buyerOwnershipTokenAcct);
    const buyerAppendAcctInfo = await getAccount(connection, buyerAppendTokenAcct);
    console.log(
      "Buyer ownership token balance:",
      formatBNs(buyerOwnershipAcctInfo.amount)
    );
    console.log(
      "Buyer append token balance:",
      formatBNs(buyerAppendAcctInfo.amount)
    );
  });

  it("\n\n=== START: 'Manages multiple DRT types with metadata correctly' ===", async () => {
    const poolName = "multi_drt_pool";
    const poolId = 1;
    const ownershipSupply = new BN(200_000);
    const appendDrtSupply = new BN(20);
    const wComputeSupply = new BN(50);
    const pyComputeSupply = new BN(75);
    const allowedDrts = ["append", "w_compute_median", "py_compute_median"];

    // Compute pool PDA.
    const [poolPda, poolBump] = getPoolPda(
      provider.wallet.publicKey,
      poolName,
      poolId,
      program.programId
    );
    console.log("Pool PDA:", poolPda.toBase58());

    // Derive vault PDA.
    const [vaultPda, vaultBump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPda.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda.toBase58());

    // Create the ownership mint.
    console.log("Creating ownership mint...");
    const ownershipMint = await createNewMint(vaultPda);
    console.log("Ownership mint:", ownershipMint.toBase58());

    // Derive vault associated token account for ownership.
    const vaultOwnershipTokenAcct = await getAssociatedTokenAddress(
      ownershipMint,
      vaultPda,
      true
    );
    console.log("Vault ownership token account:", vaultOwnershipTokenAcct.toBase58());

    // Initialize the pool.
    console.log("Initializing pool...");
    await program.methods
      .initializePool(
        poolName,
        new BN(poolId),
        ownershipSupply,
        appendDrtSupply,
        allowedDrts
      )
      .accounts({
        pool: poolPda,
        owner: provider.wallet.publicKey,
        ownershipMint,
        vault: vaultPda,
        vaultTokenAccount: vaultOwnershipTokenAcct,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Pool initialized successfully!");

    // Initialize "append" DRT.
    console.log("Creating Append DRT mint...");
    const appendMint = await createNewMint(vaultPda);
    console.log("Append mint:", appendMint.toBase58());
    const vaultAppendTokenAcct = await getAssociatedTokenAddress(
      appendMint,
      vaultPda,
      true
    );
    console.log("Vault append token account:", vaultAppendTokenAcct.toBase58());
    console.log("Initializing 'append' DRT...");
    await program.methods
      .initializeDrt("append", appendDrtSupply)
      .accounts({
        pool: poolPda,
        drtMint: appendMint,
        vault: vaultPda,
        vaultDrtTokenAccount: vaultAppendTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("'append' DRT initialized successfully!");

    // Set metadata for the append DRT.
    console.log("Setting metadata for append DRT...");
    const appendMetadataPda = await createMetadataAccount(
      appendMint,
      "AppendDRT",
      "APPEND",
      "https://arweave.net/append_multi"
    );
    await program.methods
      .setTokenMetadata("AppendDRT", "APPEND", "https://arweave.net/append_multi")
      .accounts({
        metadata: appendMetadataPda,
        mint: appendMint,
        pool: poolPda,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("append DRT metadata set successfully!");

    // Initialize "w_compute_median" DRT.
    console.log("Creating w_compute_median mint...");
    const wComputeMint = await createNewMint(vaultPda);
    console.log("w_compute_median mint:", wComputeMint.toBase58());
    const vaultWComputeTokenAcct = await getAssociatedTokenAddress(
      wComputeMint,
      vaultPda,
      true
    );
    console.log("Vault w_compute_median token account:", vaultWComputeTokenAcct.toBase58());
    console.log("Initializing 'w_compute_median' DRT...");
    await program.methods
      .initializeDrt("w_compute_median", wComputeSupply)
      .accounts({
        pool: poolPda,
        drtMint: wComputeMint,
        vault: vaultPda,
        vaultDrtTokenAccount: vaultWComputeTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("'w_compute_median' DRT initialized successfully!");

    // Set metadata for w_compute_median.
    console.log("Setting metadata for w_compute_median...");
    const wComputeMetadataPda = await createMetadataAccount(
      wComputeMint,
      "WComputeMedian",
      "WCM",
      "https://arweave.net/wcompute"
    );
    await program.methods
      .setTokenMetadata("WComputeMedian", "WCM", "https://arweave.net/wcompute")
      .accounts({
        metadata: wComputeMetadataPda,
        mint: wComputeMint,
        pool: poolPda,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("w_compute_median metadata set successfully!");

    // Initialize "py_compute_median" DRT.
    console.log("Creating py_compute_median mint...");
    const pyComputeMint = await createNewMint(vaultPda);
    console.log("py_compute_median mint:", pyComputeMint.toBase58());
    const vaultPyComputeTokenAcct = await getAssociatedTokenAddress(
      pyComputeMint,
      vaultPda,
      true
    );
    console.log("Vault py_compute_median token account:", vaultPyComputeTokenAcct.toBase58());
    console.log("Initializing 'py_compute_median' DRT...");
    await program.methods
      .initializeDrt("py_compute_median", pyComputeSupply)
      .accounts({
        pool: poolPda,
        drtMint: pyComputeMint,
        vault: vaultPda,
        vaultDrtTokenAccount: vaultPyComputeTokenAcct,
        owner: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("'py_compute_median' DRT initialized successfully!");

    // Set metadata for py_compute_median.
    console.log("Setting metadata for py_compute_median...");
    const pyComputeMetadataPda = await createMetadataAccount(
      pyComputeMint,
      "PyComputeMedian",
      "PCM",
      "https://arweave.net/pycompute"
    );
    await program.methods
      .setTokenMetadata("PyComputeMedian", "PCM", "https://arweave.net/pycompute")
      .accounts({
        metadata: pyComputeMetadataPda,
        mint: pyComputeMint,
        pool: poolPda,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("py_compute_median metadata set successfully!");

    // Buyer buys and then redeems each DRT.
    const buyer = provider.wallet.publicKey;
    // For w_compute_median:
    const buyerWComputeAta = await getAssociatedTokenAddress(
      wComputeMint,
      buyer
    );
    let ataInfoWCompute = await connection.getAccountInfo(buyerWComputeAta);
    if (!ataInfoWCompute) {
      console.log("Buyer ATA for w_compute_median not found; creating...");
      const ix = createAssociatedTokenAccountInstruction(
        buyer,
        buyerWComputeAta,
        buyer,
        wComputeMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(ix));
    }
    console.log("Buying 1 'w_compute_median' DRT...");
    const feeWCompute = new BN(2000);
    await program.methods
      .buyDrt("w_compute_median", feeWCompute)
      .accounts({
        pool: poolPda,
        drtMint: wComputeMint,
        vaultDrtTokenAccount: vaultWComputeTokenAcct,
        userDrtTokenAccount: buyerWComputeAta,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Bought 1 w_compute_median DRT!");

    // For py_compute_median:
    const buyerPyComputeAta = await getAssociatedTokenAddress(
      pyComputeMint,
      buyer
    );
    let ataInfoPyCompute = await connection.getAccountInfo(buyerPyComputeAta);
    if (!ataInfoPyCompute) {
      console.log("Buyer ATA for py_compute_median not found; creating...");
      const ix = createAssociatedTokenAccountInstruction(
        buyer,
        buyerPyComputeAta,
        buyer,
        pyComputeMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(ix));
    }
    console.log("Buying 1 'py_compute_median' DRT...");
    const feePyCompute = new BN(3000);
    await program.methods
      .buyDrt("py_compute_median", feePyCompute)
      .accounts({
        pool: poolPda,
        drtMint: pyComputeMint,
        vaultDrtTokenAccount: vaultPyComputeTokenAcct,
        userDrtTokenAccount: buyerPyComputeAta,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Bought 1 py_compute_median DRT!");

    // Redeem w_compute_median.
    const buyerOwnershipAta = await getAssociatedTokenAddress(
      ownershipMint,
      buyer
    );
    let ataInfoOwnership = await connection.getAccountInfo(buyerOwnershipAta);
    if (!ataInfoOwnership) {
      console.log("Buyer ATA for ownership token not found; creating...");
      const ix = createAssociatedTokenAccountInstruction(
        buyer,
        buyerOwnershipAta,
        buyer,
        ownershipMint
      );
      await provider.sendAndConfirm(new web3.Transaction().add(ix));
    }
    console.log("Redeeming 1 w_compute_median DRT...");
    await program.methods
      .redeemDrt("w_compute_median")
      .accounts({
        pool: poolPda,
        drtMint: wComputeMint,
        ownershipMint,
        userDrtTokenAccount: buyerWComputeAta,
        userOwnershipTokenAccount: buyerOwnershipAta,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        user: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Redeemed w_compute_median DRT!");

    // Redeem py_compute_median.
    console.log("Redeeming 1 py_compute_median DRT...");
    await program.methods
      .redeemDrt("py_compute_median")
      .accounts({
        pool: poolPda,
        drtMint: pyComputeMint,
        ownershipMint,
        userDrtTokenAccount: buyerPyComputeAta,
        userOwnershipTokenAccount: buyerOwnershipAta,
        vault: vaultPda,
        owner: provider.wallet.publicKey,
        user: buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Redeemed py_compute_median DRT!");

    const buyerOwnershipInfo = await getAccount(connection, buyerOwnershipAta);
    console.log(
      "Buyer ownership token balance after redeems:",
      formatBNs(buyerOwnershipInfo.amount)
    );
  });

  it("\n\n=== START: 'Allows multiple pools with the same name' ===", async () => {
    // Here the same pool name is used but with different poolId values.
    const duplicatePoolName = "duplicate_pool";
    const ownershipSupply = new BN(500_000);
    const appendSupply = new BN(2500);
    const allowedDrts = ["append"];

    // First pool with poolId = 1.
    const poolId1 = 1;
    const [poolPda1] = getPoolPda(
      provider.wallet.publicKey,
      duplicatePoolName,
      poolId1,
      program.programId
    );
    console.log("Pool 1 PDA:", poolPda1.toBase58());
    const [vaultPda1] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPda1.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda1.toBase58()); 
    const ownershipMint1 = await createNewMint(vaultPda1);
    const vaultTokenAccount1 = await getAssociatedTokenAddress(
      ownershipMint1,
      vaultPda1,
      true
    );
    const metadataPda1 = await createMetadataAccount(
      ownershipMint1,
      `${duplicatePoolName}_ownership`,
      "OWN",
      "https://arweave.net/duplicate1"
    );
    console.log("Initializing first pool with duplicate name...");
    await program.methods
      .initializePool(
        duplicatePoolName,
        new BN(poolId1),
        ownershipSupply,
        appendSupply,
        allowedDrts
      )
      .accounts({
        pool: poolPda1,
        owner: provider.wallet.publicKey,
        ownershipMint: ownershipMint1,
        vault: vaultPda1,
        vaultTokenAccount: vaultTokenAccount1,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    await program.methods
      .setTokenMetadata(
        `${duplicatePoolName}_ownership`,
        "OWN",
        "https://arweave.net/duplicate1"
      )
      .accounts({
        metadata: metadataPda1,
        mint: ownershipMint1,
        pool: poolPda1,
        vault: vaultPda1,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Second pool with poolId = 2 (same name but different id).
    const poolId2 = 2;
    const [poolPda2] = getPoolPda(
      provider.wallet.publicKey,
      duplicatePoolName,
      poolId2,
      program.programId
    );
    console.log("Pool 2 PDA:", poolPda2.toBase58());
    const [vaultPda2] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPda2.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda2.toBase58()); 
    const ownershipMint2 = await createNewMint(vaultPda2);
    const vaultTokenAccount2 = await getAssociatedTokenAddress(
      ownershipMint2,
      vaultPda2,
      true
    );
    const metadataPda2 = await createMetadataAccount(
      ownershipMint2,
      `${duplicatePoolName}_ownership`,
      "OWN",
      "https://arweave.net/duplicate2"
    );
    console.log("Initializing second pool with duplicate name...");
    await program.methods
      .initializePool(
        duplicatePoolName,
        new BN(poolId2),
        ownershipSupply,
        appendSupply,
        allowedDrts
      )
      .accounts({
        pool: poolPda2,
        owner: provider.wallet.publicKey,
        ownershipMint: ownershipMint2,
        vault: vaultPda2,
        vaultTokenAccount: vaultTokenAccount2,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    await program.methods
      .setTokenMetadata(
        `${duplicatePoolName}_ownership`,
        "OWN",
        "https://arweave.net/duplicate2"
      )
      .accounts({
        metadata: metadataPda2,
        mint: ownershipMint2,
        pool: poolPda2,
        vault: vaultPda2,
        owner: provider.wallet.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Fetch both pool accounts.
    const rawPoolData1 = await program.account.pool.fetch(poolPda1);
    const rawPoolData2 = await program.account.pool.fetch(poolPda2);

    // Use our helper function
    const processedPoolData1 = await processPoolData(rawPoolData1);
    const processedPoolData2 = await processPoolData(rawPoolData2);

    console.log("Pool 1 data:", JSON.stringify(formatBNs(processedPoolData1), null, 2));
    console.log("Pool 2 data:", JSON.stringify(formatBNs(processedPoolData2), null, 2));
  });
});