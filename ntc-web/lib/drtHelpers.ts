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

// lib/drtHelpers.ts
import * as anchor from "@coral-xyz/anchor";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

// --- Helper functions used by both tests and front end ---

export function getPoolPda(
  owner: PublicKey,
  poolName: string,
  poolId: number,
  programId: PublicKey
): [PublicKey, number] {
  const poolIdBuffer = Buffer.alloc(8);
  poolIdBuffer.writeUInt32LE(poolId, 0);
  poolIdBuffer.writeUInt32LE(0, 4);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), owner.toBuffer(), Buffer.from(poolName), poolIdBuffer],
    programId
  );
}

/** Create a new mint. */
export async function createNewMint(
    provider: anchor.AnchorProvider,
    mintAuthority: PublicKey,
    decimals: number = 0
  ): Promise<PublicKey> {
    // Generate the new mint keypair.
    const mintKeypair = anchor.web3.Keypair.generate();
  
    // Get minimum lamports required for rent exemption.
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(82);
  
    // Create instruction to create the mint account.
    const createMintIx = SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: 82,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    });
  
    // Create instruction to initialize the mint.
    const initMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      mintAuthority
    );
  
    // Build the transaction.
    const tx = new Transaction().add(createMintIx).add(initMintIx);
    tx.feePayer = provider.wallet.publicKey;
  
    // **Fetch a fresh blockhash** right before signing.
    const latestBlockhash = await provider.connection.getLatestBlockhash("processed");
    tx.recentBlockhash = latestBlockhash.blockhash;
  
    // **Partially sign the transaction with the mint keypair.**
    // This adds the signature required by the new account.
    tx.partialSign(mintKeypair);
  
    // Now, ask the wallet to sign the transaction (it signs for the fee payer).
    const signedTx = await provider.wallet.signTransaction(tx);
  
    // Send the transaction.
    const txid = await provider.connection.sendRawTransaction(signedTx.serialize());
  
    // Confirm the transaction using the blockhash info.
    await provider.connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: txid,
    });
  
    return mintKeypair.publicKey;
  }

/** Create a new pool by calling the smart contract’s initializePool method.
 *  Returns an object with pool PDA, vault PDA, fee vault PDA, ownership mint.
 */
export async function createPool(
  program: anchor.Program,
  provider: anchor.AnchorProvider,
  poolName: string,
  poolId: number,
  ownershipSupply: BN,
  appendSupply: BN,
  allowedDrts: string[],
  updateStatus?: (status: string) => void, // status updates
): Promise<{
  pool: PublicKey;
  vault: PublicKey;
  feeVault: PublicKey;
  ownershipMint: PublicKey;
}> {
  // Derive pool PDA using the wallet as the owner.
  const owner = provider.wallet.publicKey;
  const [poolPda] = getPoolPda(owner, poolName, poolId, program.programId);

  // Derive vault and fee vault addresses.
  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), poolPda.toBuffer()],
    program.programId
  );
  const [feeVaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("fee_vault"), poolPda.toBuffer()],
    program.programId
  );

  // --- Transaction 1: Create the mint ---
  updateStatus && updateStatus("1/3: Creating ownership mint...");  
  const ownershipMint = await createNewMint(provider, vaultPda);
  updateStatus && updateStatus("1/3: Ownership mint created.");

  // --- Transaction 2: Initialize the pool ---
  updateStatus && updateStatus("2/3: Initializing pool on-chain...");
  await program.methods
    .initializePool(poolName, new BN(poolId), ownershipSupply, appendSupply, allowedDrts)
    .accounts({
      pool: poolPda,
      owner: owner,
      ownershipMint: ownershipMint,
      vault: vaultPda,
      vaultTokenAccount: await getAssociatedTokenAddress(ownershipMint, vaultPda, true),
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  updateStatus && updateStatus("2/3: Pool initialized.");

  // --- Transaction 3: Initialize the fee vault ---
  updateStatus && updateStatus("3/3: Initializing fee vault...");
  await program.methods
    .initializeFeeVault()
    .accounts({
      feeVault: feeVaultPda,
      pool: poolPda,
      owner: owner,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  updateStatus && updateStatus("3/3: Fee vault initialized. All on-chain transactions complete.");

  return {
    pool: poolPda,
    vault: vaultPda,
    feeVault: feeVaultPda,
    ownershipMint,
  };
}

/** Buy a DRT of a given type.
 *  (This is a simplified version; adjust accounts and parameters as needed.)
 */
export async function buyDrt(
  program: anchor.Program,
  pool: PublicKey,
  drtMint: PublicKey,
  vaultDrtTokenAccount: PublicKey,
  userDrtTokenAccount: PublicKey,
  vault: PublicKey,
  feeVault: PublicKey,
  fee: BN
) {
  const buyerWallet = (anchor.getProvider() as AnchorProvider).wallet.publicKey;
  await program.methods
    .buyDrt("append", fee) // Here we hard-code the drt type “append”
    .accounts({
      pool,
      drtMint,
      vaultDrtTokenAccount,
      userDrtTokenAccount,
      vault,
      feeVault,
      buyerWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

/** Redeem a DRT (again, a simplified version). */
export async function redeemDrt(
  program: anchor.Program,
  pool: PublicKey,
  drtMint: PublicKey,
  ownershipMint: PublicKey,
  userDrtTokenAccount: PublicKey,
  userOwnershipTokenAccount: PublicKey
) {
  const owner = (anchor.getProvider() as AnchorProvider).wallet.publicKey;
  await program.methods
    .redeemDrt("append")
    .accounts({
      pool,
      drtMint,
      ownershipMint,
      userDrtTokenAccount,
      userOwnershipTokenAccount,
      vault: (await getAssociatedTokenAddress(ownershipMint, owner)),
      owner,
      user: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}