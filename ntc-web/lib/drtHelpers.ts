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
  getMint,
} from "@solana/spl-token";
import { 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  clusterApiUrl, 
  Connection 
} from "@solana/web3.js";

// Constants for retry logic and network configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries
const DEVNET_URL = clusterApiUrl('devnet');
const COMMITMENT = 'confirmed';

// Helper to create connection with proper configuration
export const getConnection = () => new Connection(DEVNET_URL, {
  commitment: COMMITMENT,
  confirmTransactionInitialTimeout: 60000
});

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

/** Create a new mint with improved error handling. */
export async function createNewMint(
    provider: anchor.AnchorProvider,
    mintAuthority: PublicKey,
    decimals: number = 0
): Promise<PublicKey> {
    let lastError: Error | null = null;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const mintKeypair = anchor.web3.Keypair.generate();
            const lamports = await provider.connection.getMinimumBalanceForRentExemption(82);

            const createMintIx = SystemProgram.createAccount({
                fromPubkey: provider.wallet.publicKey,
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

            const tx = new Transaction().add(createMintIx).add(initMintIx);
            tx.feePayer = provider.wallet.publicKey;

            const { blockhash, lastValidBlockHeight } = 
                await provider.connection.getLatestBlockhash(COMMITMENT);
            tx.recentBlockhash = blockhash;

    tx.partialSign(mintKeypair);
    tx.partialSign(mintKeypair);
  
    // Now, ask the wallet to sign the transaction (it signs for the fee payer).
            tx.partialSign(mintKeypair);
  
    // Now, ask the wallet to sign the transaction (it signs for the fee payer).
            const signedTx = await provider.wallet.signTransaction(tx);

            const txid = await provider.connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: false,
                preflightCommitment: COMMITMENT,
            });

            const confirmation = await provider.connection.confirmTransaction({
                signature: txid,
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight
            }, COMMITMENT);

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            return mintKeypair.publicKey;
        } catch (error) {
            console.warn(`Mint creation attempt ${attempt + 1} failed:`, error);
            lastError = error as Error;
            
            if (attempt < MAX_RETRIES - 1) {
                await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
                continue;
            }
        }
    }

    throw new Error(`Failed to create mint after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`);
}

export async function createPool(
    program: anchor.Program,
    provider: anchor.AnchorProvider,
    poolName: string,
    poolId: number,
    ownershipSupply: BN,
    appendSupply: BN,
    allowedDrts: string[],
    updateStatus?: (status: string) => void,
): Promise<{
    pool: PublicKey;
    vault: PublicKey;
    feeVault: PublicKey;
    ownershipMint: PublicKey;
}> {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    async function executeTransaction<T>(
        operation: () => Promise<T>,
        errorMessage: string
    ): Promise<T> {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.warn(`${errorMessage} - Attempt ${attempt + 1} failed:`, error);
                if (attempt < MAX_RETRIES - 1) {
                    await sleep(RETRY_DELAY * (attempt + 1));
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${errorMessage}`);
    }

    const owner = provider.wallet.publicKey;
    const [poolPda] = getPoolPda(owner, poolName, poolId, program.programId);

    const [vaultPda] = await PublicKey.findProgramAddress(
        [Buffer.from("vault"), poolPda.toBuffer()],
        program.programId
    );

    const [feeVaultPda] = await PublicKey.findProgramAddress(
        [Buffer.from("fee_vault"), poolPda.toBuffer()],
        program.programId
    );

    updateStatus?.("1/3: Creating ownership mint...");
    const ownershipMint = await executeTransaction(
        () => createNewMint(provider, vaultPda),
        "Failed to create ownership mint"
    );
    updateStatus?.("1/3: Ownership mint created.");

    updateStatus?.("2/3: Initializing pool on-chain...");
    // Get the vault token account address before the transaction
    const vaultTokenAccount = await getAssociatedTokenAddress(
        ownershipMint,
        vaultPda,
        true
    );

    await executeTransaction(
        async () => program.methods
            .initializePool(poolName, new BN(poolId), ownershipSupply, appendSupply, allowedDrts)
            .accounts({
                pool: poolPda,
                owner: owner,
                ownershipMint: ownershipMint,
                vault: vaultPda,
                vaultTokenAccount: vaultTokenAccount,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc({ commitment: COMMITMENT }),
        "Failed to initialize pool"
    );
    updateStatus?.("2/3: Pool initialized.");

    updateStatus?.("3/3: Initializing fee vault...");
    await executeTransaction(
        () => program.methods
            .initializeFeeVault()
            .accounts({
                feeVault: feeVaultPda,
                pool: poolPda,
                owner: owner,
                systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: COMMITMENT }),
        "Failed to initialize fee vault"
    );
    updateStatus?.("3/3: Fee vault initialized. All on-chain transactions complete.");

    return {
        pool: poolPda,
        vault: vaultPda,
        feeVault: feeVaultPda,
        ownershipMint,
    };
}

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
    .rpc({ commitment: COMMITMENT });

return vaultDRTTokenAccount;
}

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
    updateStatus?.("Creating user DRT token account...");
    instructions.push(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userDrtTokenAccount,
            wallet.publicKey,
            drtMint
        )
    );
}

// Ensure user has ownership account
if (!userOwnershipAccountInfo) {
    updateStatus?.("Creating user ownership token account...");
    instructions.push(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userOwnershipTokenAccount,
            wallet.publicKey,
            ownershipMint
        )
    );
}

updateStatus?.("Redeeming DRT on-chain...");
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
    .rpc({ commitment: COMMITMENT });

const ownershipTokenReceived = drtType === "append";
updateStatus?.(`DRT redeemed successfully, tx signature: ${tx}${ownershipTokenReceived ? ", ownership token received" : ""}`);

if (ownershipTokenReceived) {
    try {
        updateStatus?.("Saving ownership token instance...");
        const response = await fetch('/api/drt-instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mintAddress: userOwnershipTokenAccount.toBase58(),
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
        updateStatus?.("Ownership token instance saved successfully");
    } catch (error) {
        console.error("Error saving ownership token instance:", error);
        updateStatus?.(`Error saving ownership token: ${error instanceof Error ? error.message : String(error)}`);
    }
}

return { tx, ownershipTokenReceived };
}

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

const allowedDrtsField: string[] =
    Array.isArray(poolAccount.allowedDrts)
        ? poolAccount.allowedDrts
        : Array.isArray(poolAccount.allowed_drts)
            ? poolAccount.allowed_drts
            : [];

const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("vault"), poolPubkey.toBuffer()],
    program.programId
);

for (const drtType of allowedDrtsField) {
    let drtMint: PublicKey | null = null;
    
    if (drtType === "append") {
        drtMint = poolAccount.appendMint || poolAccount.append_mint;
    } else if (drtType === "w_compute_median") {
        drtMint = poolAccount.wComputeMedianMint || poolAccount.w_compute_median_mint;
    } else if (drtType === "py_compute_median") {
        drtMint = poolAccount.pyComputeMedianMint || poolAccount.py_compute_median_mint;
    }
    
    if (drtMint) {
        let initialSupply = 0;
        try {
            const mintInfo = await getMint(connection, drtMint);
            initialSupply = Number(mintInfo.supply);
        } catch (error) {
            console.error(`Error fetching mint info for ${drtType}:`, error);
            if (drtType === "append") {
                initialSupply = poolAccount.appendSupply?.toNumber() || poolAccount.append_supply?.toNumber() || 0;
            } else if (drtType === "w_compute_median") {
                initialSupply = poolAccount.wComputeSupply?.toNumber() || poolAccount.w_compute_supply?.toNumber() || 0;
            } else if (drtType === "py_compute_median") {
                initialSupply = poolAccount.pyComputeSupply?.toNumber() || poolAccount.py_compute_supply?.toNumber() || 0;
            }
        }

        const vaultDrtTokenPda = await getAssociatedTokenAddress(
            drtMint,
            vaultPda,
            true
        );

        let available = 0;
        try {
            const tokenBalance = await connection.getTokenAccountBalance(vaultDrtTokenPda);
            available = tokenBalance.value.uiAmount || 0;
        } catch (error) {
            console.error(`Error fetching token balance for ${drtType}:`, error);
        }

        availableDRTs.push({
            name: drtType,
            mint: drtMint.toBase58(),
            initialSupply,
            available,
        });
    }
}
return availableDRTs;
}

export async function buyDRT(
  program: anchor.Program,
  wallet: any,
  poolAddress: string,
  drtMintStr: string,
  drtType: string,
  fee: number,
  quantity: number = 1
): Promise<string[]> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  const drtMint = new PublicKey(drtMintStr);
  const connection = (program.provider as AnchorProvider).connection;
  const feeInLamports = Math.floor(fee * 1_000_000_000);

  console.log(`Fee: ${fee} SOL (${feeInLamports} lamports) × ${quantity} tokens`);

  if (feeInLamports <= 0) {
      throw new Error("Fee must be greater than zero");
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error("Quantity must be a positive integer");
  }

  const [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPubkey.toBuffer()],
      program.programId
  );

  const [feeVaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("fee_vault"), poolPubkey.toBuffer()],
      program.programId
  );

  const vaultDrtTokenPda = await getAssociatedTokenAddress(
      drtMint,
      vaultPda,
      true
  );

  const userDrtTokenAccount = await getAssociatedTokenAddress(
      drtMint,
      wallet.publicKey
  );

  try {
      const userAccountInfo = await connection.getAccountInfo(userDrtTokenAccount);
      const transactionSignatures: string[] = [];
      
      for (let i = 0; i < quantity; i++) {
          let transaction: string | undefined;
          let retryCount = 0;
          
          while (retryCount < MAX_RETRIES && !transaction) {
              try {
                  if (i === 0 && !userAccountInfo) {
                      console.log("Creating user token account and buying first DRT token...");
                      
                      const createTokenAccountIx = createAssociatedTokenAccountInstruction(
                          wallet.publicKey,
                          userDrtTokenAccount,
                          wallet.publicKey,
                          drtMint
                      );
                      
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
                          .rpc({ commitment: COMMITMENT });
                  } else {
                      console.log(`Buying DRT token ${i + 1} of ${quantity}...`);
                      
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
                          .rpc({ commitment: COMMITMENT });
                  }
              } catch (error) {
                  console.warn(`Attempt ${retryCount + 1} failed for token ${i + 1}:`, error);
                  retryCount++;
                  if (retryCount < MAX_RETRIES) {
                      await sleep(RETRY_DELAY * retryCount);
                      continue;
                  }
                  throw error;
              }
          }

          if (!transaction) {
              throw new Error(`Failed to purchase token ${i + 1} after ${MAX_RETRIES} attempts`);
          }

          console.log(`DRT token ${i + 1} purchase successful, tx signature:`, transaction);
          transactionSignatures.push(transaction);
          
          if (i < quantity - 1) {
              await sleep(1000);
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