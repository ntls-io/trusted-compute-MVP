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
  getMint, // Added to fetch mint supply
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

/** Initializes a DRT (for example, the “append” type).
 *  Returns the vault’s associated DRT token account.
 */
export async function initializeDRT(
  program: anchor.Program,
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
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
  return vaultDRTTokenAccount;
}

/** Redeem a DRT on-chain and receive an ownership token if "append". */
export async function redeemDrt(
  program: anchor.Program,
  pool: PublicKey,
  drtMint: PublicKey,
  ownershipMint: PublicKey,
  userDrtTokenAccount: PublicKey,
  userOwnershipTokenAccount: PublicKey,
  drtType: string,
  wallet: any,
  updateStatus?: (status: string) => void,
  databasePoolId?: string
): Promise<{ tx: string; ownershipTokenReceived: boolean }> {
  const provider = program.provider as AnchorProvider;
  const user = wallet.publicKey;
  const connection = provider.connection;

  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), pool.toBuffer()],
    program.programId
  );

  const userDrtAccountInfo = await connection.getAccountInfo(userDrtTokenAccount);
  const userOwnershipAccountInfo = await connection.getAccountInfo(userOwnershipTokenAccount);

  const instructions: anchor.web3.TransactionInstruction[] = [];
  if (!userDrtAccountInfo) {
    updateStatus && updateStatus("Creating user DRT token account...");
    const createDrtTokenAccountIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      userDrtTokenAccount,
      wallet.publicKey,
      drtMint
    );
    instructions.push(createDrtTokenAccountIx);
  }
  if (!userOwnershipAccountInfo && drtType === "append") {
    updateStatus && updateStatus("Creating user ownership token account...");
    const createOwnershipTokenAccountIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      userOwnershipTokenAccount,
      wallet.publicKey,
      ownershipMint
    );
    instructions.push(createOwnershipTokenAccountIx);
  }

  updateStatus && updateStatus("Redeeming DRT on-chain...");
  const tx = await program.methods
    .redeemDrt(drtType)
    .accounts({
      pool,
      drtMint,
      ownershipMint,
      userDrtTokenAccount,
      userOwnershipTokenAccount,
      vault: vaultPda,
      user,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions(instructions)
    .rpc();

  const ownershipTokenReceived = drtType === "append";
  updateStatus && updateStatus(`DRT redeemed successfully, tx signature: ${tx}${ownershipTokenReceived ? ", ownership token received" : ""}`);

  // Save ownership token instance to Prisma if "append"
  if (ownershipTokenReceived) {
    try {
      updateStatus && updateStatus("Saving ownership token instance...");
      const response = await fetch('/api/drt-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAddress: userOwnershipTokenAccount.toBase58(), // Use ATA as unique identifier
          drtId: 'OWNERSHIP_TOKEN',
          poolId: databasePoolId,
          ownerId: user.toBase58(),
          state: 'active',
          isListed: false,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save ownership token instance');
      }
      updateStatus && updateStatus("Ownership token instance saved successfully");
    } catch (error) {
      console.error("Error saving ownership token instance:", error);
      updateStatus && updateStatus(`Error saving ownership token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { tx, ownershipTokenReceived };
}

/**
 * Fetch live available DRT data for a given pool.
 * @param program - an initialized anchor.Program instance
 * @param poolAddress - the on-chain pool address as a string
 */
export async function fetchAvailableDRTs(
  program: anchor.Program,
  poolAddress: string
) {
  const poolPubkey = new PublicKey(poolAddress);
  const poolAccount = await program.account.pool.fetch(poolPubkey);
  const connection = (program.provider as AnchorProvider).connection;
  const availableDRTs: Array<{
    name: string;
    mint: string;
    initialSupply: number;
    available: number;
  }> = [];

  // Get the allowed DRT types from the account - handle both camelCase and snake_case fields
  const allowedDrtsField: string[] =
    Array.isArray(poolAccount.allowedDrts)
      ? poolAccount.allowedDrts
      : Array.isArray(poolAccount.allowed_drts)
      ? poolAccount.allowed_drts
      : [];

  // Compute the vault PDA once
  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), poolPubkey.toBuffer()],
    program.programId
  );

  // Loop through allowed DRT types stored on-chain
  for (const drtType of allowedDrtsField) {
    let drtMint: PublicKey | null = null;
    
    // Handle both camelCase and snake_case field names for compatibility
    if (drtType === "append") {
      drtMint = poolAccount.appendMint || poolAccount.append_mint;
    } else if (drtType === "w_compute_median") {
      drtMint = poolAccount.wComputeMedianMint || poolAccount.w_compute_median_mint;
    } else if (drtType === "py_compute_median") {
      drtMint = poolAccount.pyComputeMedianMint || poolAccount.py_compute_median_mint;
    }
    
    if (drtMint) {
      // Fetch the mint info to get the total supply (accounts for burns)
      let initialSupply = 0;
      try {
        const mintInfo = await getMint(connection, drtMint);
        initialSupply = Number(mintInfo.supply); // Current total supply from the mint account
      } catch (error) {
        console.error(`Error fetching mint info for ${drtType}:`, error);
        // Fallback to pool data if mint fetch fails (though this should rarely happen)
        if (drtType === "append") {
          initialSupply = poolAccount.appendSupply?.toNumber() || poolAccount.append_supply?.toNumber() || 0;
        } else if (drtType === "w_compute_median") {
          initialSupply = poolAccount.wComputeSupply?.toNumber() || poolAccount.w_compute_supply?.toNumber() || 0;
        } else if (drtType === "py_compute_median") {
          initialSupply = poolAccount.pyComputeSupply?.toNumber() || poolAccount.py_compute_supply?.toNumber() || 0;
        }
      }

      // Use getAssociatedTokenAddress to calculate the correct vault DRT token account address
      const vaultDrtTokenPda = await getAssociatedTokenAddress(
        drtMint,
        vaultPda,
        true  // Allow owner off-curve (since vault is a PDA)
      );

      // Query the token account balance (available supply)
      let available = 0;
      try {
        const tokenBalance = await connection.getTokenAccountBalance(vaultDrtTokenPda);
        available = tokenBalance.value.uiAmount || 0;
      } catch (error) {
        console.error(`Error fetching token balance for ${drtType}:`, error);
        // This means the token account probably doesn't exist yet
      }

      availableDRTs.push({
        name: drtType,
        mint: drtMint.toBase58(),
        initialSupply, // Now reflects the current total supply from the blockchain
        available,
      });
    }
  }
  return availableDRTs;
}

/**
 * Executes the buy_drt instruction with quantity support.
 * @param program - an initialized anchor.Program instance
 * @param wallet - the connected wallet
 * @param poolAddress - the on-chain pool address as string
 * @param drtMintStr - the mint address (as string) for the chosen DRT type
 * @param drtType - the DRT type (e.g. "append")
 * @param fee - cost in SOL (will be converted to lamports)
 * @param quantity - number of tokens to purchase (default: 1)
 * @returns Array of transaction signatures
 */
export async function buyDRT(
  program: anchor.Program,
  wallet: any,
  poolAddress: string,
  drtMintStr: string,
  drtType: string,
  fee: number,
  quantity: number = 1
): Promise<string[]> {
  const poolPubkey = new PublicKey(poolAddress);
  const drtMint = new PublicKey(drtMintStr);
  const connection = (program.provider as AnchorProvider).connection;

  // Convert fee from SOL to lamports
  const feeInLamports = Math.floor(fee * 1_000_000_000);
  
  console.log(`Fee: ${fee} SOL (${feeInLamports} lamports) × ${quantity} tokens`);
  
  if (feeInLamports <= 0) {
    throw new Error("Fee must be greater than zero");
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("Quantity must be a positive integer");
  }

  // Compute vault PDA ("vault" seed)
  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), poolPubkey.toBuffer()],
    program.programId
  );

  // Compute fee_vault PDA ("fee_vault" seed)
  const [feeVaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("fee_vault"), poolPubkey.toBuffer()],
    program.programId
  );

  // Use standard associated token account address calculation
  const vaultDrtTokenPda = await getAssociatedTokenAddress(
    drtMint,
    vaultPda,
    true  // Allow owner off-curve (since vault is a PDA)
  );

  // Get the buyer's associated token account for the DRT mint
  const userDrtTokenAccount = await getAssociatedTokenAddress(
    drtMint,
    wallet.publicKey
  );

  try {
    // Check if the user's token account exists
    const userAccountInfo = await connection.getAccountInfo(userDrtTokenAccount);
    
    const transactionSignatures: string[] = [];
    
    // For each token in the quantity
    for (let i = 0; i < quantity; i++) {
      let transaction: string;
      
      if (i === 0 && !userAccountInfo) {
        // For the first token, create the token account if it doesn't exist
        console.log("Creating user token account and buying first DRT token...");
        
        // Create instruction to initialize the user's token account
        const createTokenAccountIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,             // payer
          userDrtTokenAccount,          // associated token account address
          wallet.publicKey,             // owner
          drtMint                       // mint
        );
        
        // Execute the transaction with both instructions
        transaction = await program.methods
          .buyDrt(drtType, new BN(feeInLamports))
          .accounts({
            pool: poolPubkey,
            drtMint: drtMint,
            vaultDrtTokenAccount: vaultDrtTokenPda,
            userDrtTokenAccount: userDrtTokenAccount,
            vault: vaultPda,
            feeVault: feeVaultPda,
            buyerWallet: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .preInstructions([createTokenAccountIx])
          .rpc();
      } else {
        // For subsequent tokens or if account exists
        console.log(`Buying DRT token ${i + 1} of ${quantity}...`);
        
        // Execute the buy instruction
        transaction = await program.methods
          .buyDrt(drtType, new BN(feeInLamports))
          .accounts({
            pool: poolPubkey,
            drtMint: drtMint,
            vaultDrtTokenAccount: vaultDrtTokenPda,
            userDrtTokenAccount: userDrtTokenAccount,
            vault: vaultPda,
            feeVault: feeVaultPda,
            buyerWallet: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      console.log(`DRT token ${i + 1} purchase successful, tx signature:`, transaction);
      transactionSignatures.push(transaction);
      
      // Small delay between transactions to prevent rate limiting
      if (i < quantity - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return transactionSignatures;
  } catch (error) {
    console.error("Error executing buyDRT instruction:", error);
    if (error instanceof Error && 'logs' in error) {
      console.error("Transaction logs:", error.logs);
    }
    throw error;
  }
}