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
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
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
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), owner.toBuffer(), Buffer.from(poolName)],
    programId
  );
}

export function getFeeVaultPda(
  pool: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault"), pool.toBuffer()],
    programId
  );
}

export function getOwnershipMintPda(
  pool: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ownership_mint"), pool.toBuffer()],
    programId
  );
}

export function getDrtMintPda(
  pool: PublicKey,
  drtType: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("drt_mint"), pool.toBuffer(), Buffer.from(drtType)],
    programId
  );
}

/**
 * Create a pool with DRTs
 * 
 * @param program The anchor program instance
 * @param provider The anchor provider
 * @param poolName Name of the pool to create
 * @param drtConfigs Array of DRT configurations
 * @param ownershipSupply Initial supply of ownership tokens
 * @param updateStatus Optional callback for status updates
 */
export async function createPoolWithDrts(
    program: anchor.Program,
    provider: anchor.AnchorProvider,
    poolName: string,
    drtConfigs: Array<{
      drtType: string,
      supply: BN,
      cost: BN,
      githubUrl?: string,
      codeHash?: string
    }>,
    ownershipSupply: BN,
    updateStatus?: (status: string) => void,
  ): Promise<{
    pool: PublicKey;
    feeVault: PublicKey;
    ownershipMint: PublicKey;
    drtMints: Record<string, PublicKey>;
  }> {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const owner = provider.wallet.publicKey;
    
    // Create PDA for the pool
    const [poolPda] = getPoolPda(owner, poolName, program.programId);
    
    // Check if pool already exists before trying to create it
    try {
      updateStatus?.("Checking if pool already exists...");
      const existingPool = await provider.connection.getAccountInfo(poolPda);
      if (existingPool !== null) {
        throw new Error(`Pool with name "${poolName}" already exists. Please use a different name.`);
      }
      updateStatus?.("Pool name is available. Proceeding with creation...");
    } catch (error) {
      // If the error is not our custom error about existing pool, it means the getAccountInfo failed
      // which is normal for a non-existent account - we can proceed
      if (error instanceof Error && !error.message.includes("already exists")) {
        console.log("Pool doesn't exist, can proceed with creation");
      } else {
        throw error;
      }
    }
    
    // Find fee vault PDA
    const [feeVaultPda] = getFeeVaultPda(poolPda, program.programId);
    
    // Find ownership mint PDA
    const [ownershipMintPda] = getOwnershipMintPda(poolPda, program.programId);
    
    // Get ownership token account
    const ownershipTokenAccount = await getAssociatedTokenAddress(
      ownershipMintPda,
      owner
    );
    
    // Convert DRT configs to format expected by the contract
    const formattedDrtConfigs = drtConfigs.map(config => ({
      drtType: config.drtType,
      supply: config.supply,
      cost: config.cost,
      githubUrl: config.githubUrl || null,
      codeHash: config.codeHash || null
    }));
    
    updateStatus?.("1/3: Creating pool with DRTs...");
    
    // Attempt to create pool with retry logic
    let tx: string;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        tx = await program.methods
          .createPoolWithDrts(
            poolName,
            formattedDrtConfigs,
            ownershipSupply
          )
          .accounts({
            pool: poolPda,
            owner: owner,
            ownershipMint: ownershipMintPda,
            ownershipTokenAccount: ownershipTokenAccount,
            feeVault: feeVaultPda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc({ commitment: COMMITMENT });
          
        updateStatus?.(`Pool created successfully. Transaction: ${tx}`);
        break;
      } catch (error) {
        console.warn(`Pool creation attempt ${attempt + 1} failed:`, error);
        
        // Check if error is due to existing account
        if (error instanceof Error && 
            (error.message.includes("already in use") || 
             error.message.includes("already exists"))) {
          throw new Error(`Pool with name "${poolName}" or a related account already exists. Please use a different name.`);
        }
        
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
        } else {
          throw new Error(`Failed to create pool after ${MAX_RETRIES} attempts. Last error: ${error}`);
        }
      }
    }
    
    // Initialize DRT mints
    updateStatus?.("2/3: Initializing DRT mints...");
    const drtMints: Record<string, PublicKey> = {};
    
    for (const config of drtConfigs) {
      const drtType = config.drtType;
      const [drtMintPda] = getDrtMintPda(poolPda, drtType, program.programId);
      drtMints[drtType] = drtMintPda;
      
      updateStatus?.(`Initializing mint for ${drtType}...`);
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const tx = await program.methods
            .initializeDrtMint(drtType)
            .accounts({
              pool: poolPda,
              drtMint: drtMintPda,
              owner: owner,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .rpc({ commitment: COMMITMENT });
            
          updateStatus?.(`Initialized mint for ${drtType}. Transaction: ${tx}`);
          break;
        } catch (error) {
          console.warn(`DRT mint initialization attempt ${attempt + 1} for ${drtType} failed:`, error);
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
          } else {
            throw new Error(`Failed to initialize DRT mint for ${drtType} after ${MAX_RETRIES} attempts. Last error: ${error}`);
          }
        }
      }
    }
    
    // Mint initial DRT supplies
    updateStatus?.("3/3: Minting initial DRT supplies...");
    for (const config of drtConfigs) {
      const drtType = config.drtType;
      const drtMint = drtMints[drtType];
      
      updateStatus?.(`Creating vault token account for ${drtType}...`);
      
      // Get the address for the vault token account
      const vaultTokenAccount = await getAssociatedTokenAddress(
        drtMint,
        poolPda,
        true // Allow owner off curve for PDA
      );
      
      // Create the account explicitly with a transaction
      try {
        // First check if the account already exists
        try {
          await provider.connection.getTokenAccountBalance(vaultTokenAccount);
          updateStatus?.(`Vault token account already exists for ${drtType}`);
        } catch (e) {
          // Account doesn't exist, create it
          updateStatus?.(`Creating new vault token account for ${drtType}...`);
          
          const createAccountIx = createAssociatedTokenAccountInstruction(
            provider.wallet.publicKey, // Fee payer
            vaultTokenAccount,         // Associated account address
            poolPda,                   // Owner of the token account
            drtMint                    // Mint address
          );
          
          // Send the transaction
          const tx = await provider.sendAndConfirm(
            new anchor.web3.Transaction().add(createAccountIx),
            [],
            { commitment: COMMITMENT }
          );
          
          updateStatus?.(`Created vault token account for ${drtType}, tx: ${tx}`);
        }
      } catch (error) {
        console.error(`Error creating vault token account for ${drtType}:`, error);
        throw new Error(`Failed to create vault token account for ${drtType}: ${error}`);
      }
      
      updateStatus?.(`Minting initial supply for ${drtType}...`);
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const tx = await program.methods
            .mintDrtSupply(drtType)
            .accounts({
              pool: poolPda,
              drtMint: drtMint,
              owner: owner,
              vaultTokenAccount: vaultTokenAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc({ commitment: COMMITMENT });
            
          updateStatus?.(`Minted initial supply for ${drtType}. Transaction: ${tx}`);
          break;
        } catch (error) {
          console.warn(`DRT supply minting attempt ${attempt + 1} for ${drtType} failed:`, error);
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
          } else {
            throw new Error(`Failed to mint DRT supply for ${drtType} after ${MAX_RETRIES} attempts. Last error: ${error}`);
          }
        }
      }
    }
    
    updateStatus?.("Pool creation complete!");
    
    return {
      pool: poolPda,
      feeVault: feeVaultPda,
      ownershipMint: ownershipMintPda,
      drtMints
    };
}

/**
 * Buy a DRT token
 * 
 * @param program The anchor program instance
 * @param wallet The wallet to use for the purchase
 * @param poolAddress The address of the pool
 * @param drtType The type of DRT to buy
 * @param updateStatus Optional callback for status updates
 */
export async function buyDrt(
  program: anchor.Program,
  wallet: any,
  poolAddress: string,
  drtType: string,
  updateStatus?: (status: string) => void
): Promise<string> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  const connection = (program.provider as AnchorProvider).connection;
  
  // Fetch pool account to get DRT information
  updateStatus?.("Fetching pool data...");
  const poolAccount = await program.account.pool.fetch(poolPubkey);
  
  // Find the DRT config
  const drtConfig = poolAccount.drts.find((drt: any) => 
    drt.drtType === drtType || drt.drt_type === drtType
  );
  
  if (!drtConfig) {
    throw new Error(`DRT type '${drtType}' not found in pool`);
  }
  
  const drtMint = drtConfig.mint;
  
  // Find fee vault
  const [feeVault] = getFeeVaultPda(poolPubkey, program.programId);
  
  // Get vault token account for this DRT
  const vaultDrtTokenAccount = await getAssociatedTokenAddress(
    drtMint,
    poolPubkey,
    true // Allow owner off curve for PDA
  );
  
  // Get buyer's token account
  const buyerTokenAccount = await getAssociatedTokenAddress(
    drtMint,
    wallet.publicKey
  );
  
  updateStatus?.(`Buying ${drtType} DRT...`);
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const tx = await program.methods
        .buyDrt(drtType)
        .accounts({
          pool: poolPubkey,
          drtMint: drtMint,
          vaultDrtTokenAccount: vaultDrtTokenAccount,
          buyer: wallet.publicKey,
          buyerTokenAccount: buyerTokenAccount,
          feeVault: feeVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc({ commitment: COMMITMENT });
        
      updateStatus?.(`DRT purchased successfully. Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.warn(`DRT purchase attempt ${attempt + 1} failed:`, error);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
      } else {
        throw new Error(`Failed to buy DRT after ${MAX_RETRIES} attempts. Last error: ${error}`);
      }
    }
  }
  
  throw new Error("Failed to buy DRT token");
}

/**
 * Redeem a DRT token
 * 
 * @param program The anchor program instance
 * @param wallet The wallet to use for redemption
 * @param poolAddress The address of the pool
 * @param drtType The type of DRT to redeem
 * @param updateStatus Optional callback for status updates
 */
export async function redeemDrt(
  program: anchor.Program,
  wallet: any,
  poolAddress: string,
  drtType: string,
  updateStatus?: (status: string) => void
): Promise<{ tx: string; ownershipTokenReceived: boolean }> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  
  // Fetch pool account
  updateStatus?.("Fetching pool data...");
  const poolAccount = await program.account.pool.fetch(poolPubkey);
  
  // Find the DRT config
  const drtConfig = poolAccount.drts.find((drt: any) => 
    drt.drtType === drtType || drt.drt_type === drtType
  );
  
  if (!drtConfig) {
    throw new Error(`DRT type '${drtType}' not found in pool`);
  }
  
  const drtMint = drtConfig.mint;
  const ownershipMint = poolAccount.ownershipMint;
  
  // Get user's token accounts
  const userTokenAccount = await getAssociatedTokenAddress(
    drtMint,
    wallet.publicKey
  );
  
  const userOwnershipAccount = await getAssociatedTokenAddress(
    ownershipMint,
    wallet.publicKey
  );
  
  updateStatus?.(`Redeeming ${drtType} DRT...`);
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const tx = await program.methods
        .redeemDrt(drtType)
        .accounts({
          pool: poolPubkey,
          drtMint: drtMint,
          ownershipMint: ownershipMint,
          user: wallet.publicKey,
          userTokenAccount: userTokenAccount,
          userOwnershipAccount: userOwnershipAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc({ commitment: COMMITMENT });
        
      const ownershipTokenReceived = drtType === "append";
      updateStatus?.(`DRT redeemed successfully. Transaction: ${tx}${ownershipTokenReceived ? ", ownership token received" : ""}`);
      
      return { tx, ownershipTokenReceived };
    } catch (error) {
      console.warn(`DRT redemption attempt ${attempt + 1} failed:`, error);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
      } else {
        throw new Error(`Failed to redeem DRT after ${MAX_RETRIES} attempts. Last error: ${error}`);
      }
    }
  }
  
  throw new Error("Failed to redeem DRT token");
}

/**
 * Redeem ownership tokens for fees
 * 
 * @param program The anchor program instance
 * @param wallet The wallet to use for redemption
 * @param poolAddress The address of the pool
 * @param amount The amount of ownership tokens to redeem
 * @param updateStatus Optional callback for status updates
 */
export async function redeemFees(
  program: anchor.Program,
  wallet: any,
  poolAddress: string,
  amount: BN,
  updateStatus?: (status: string) => void
): Promise<string> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  
  // Fetch pool account
  updateStatus?.("Fetching pool data...");
  const poolAccount = await program.account.pool.fetch(poolPubkey);
  const ownershipMint = poolAccount.ownershipMint;
  
  // Find fee vault and its bump
  const [feeVault, feeVaultBump] = getFeeVaultPda(poolPubkey, program.programId);
  
  // Get user's ownership token account
  const userOwnershipAccount = await getAssociatedTokenAddress(
    ownershipMint,
    wallet.publicKey
  );
  
  updateStatus?.(`Redeeming ${amount.toString()} ownership tokens for fees...`);
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const tx = await program.methods
        .redeemFees(amount, feeVaultBump)
        .accounts({
          pool: poolPubkey,
          ownershipMint: ownershipMint,
          user: wallet.publicKey,
          userOwnershipAccount: userOwnershipAccount,
          feeVault: feeVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: COMMITMENT });
        
      updateStatus?.(`Fees redeemed successfully. Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.warn(`Fee redemption attempt ${attempt + 1} failed:`, error);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
      } else {
        throw new Error(`Failed to redeem fees after ${MAX_RETRIES} attempts. Last error: ${error}`);
      }
    }
  }
  
  throw new Error("Failed to redeem fees");
}

/**
 * Fetch available DRTs in a pool
 * 
 * @param program The anchor program instance
 * @param poolAddress The address of the pool
 * @returns Array of available DRT information
 */
export async function fetchAvailableDRTs(
  program: anchor.Program,
  poolAddress: string
): Promise<Array<{
  name: string;
  mint: string;
  supply: number;
  cost: number;
  available: number;
  isMinted: boolean;
  githubUrl?: string;
  codeHash?: string;
}>> {
  const poolPubkey = new PublicKey(poolAddress);
  const connection = (program.provider as AnchorProvider).connection;
  
  // Fetch pool account
  const poolAccount = await program.account.pool.fetch(poolPubkey);
  const availableDRTs = [];
  
  // Process each DRT in the pool
  for (const drt of poolAccount.drts) {
    const drtType = drt.drtType || drt.drt_type;
    const drtMint = drt.mint;
    const supply = Number(drt.supply);
    const cost = Number(drt.cost) / 1_000_000_000; // Convert lamports to SOL
    const isMinted = drt.isMinted || drt.is_minted;
    const githubUrl = drt.githubUrl || drt.github_url;
    const codeHash = drt.codeHash || drt.code_hash;
    
    // Get vault token account for this DRT to check available balance
    const vaultDrtTokenAccount = await getAssociatedTokenAddress(
      drtMint,
      poolPubkey,
      true
    );
    
    let available = 0;
    try {
      if (isMinted) {
        const tokenBalance = await connection.getTokenAccountBalance(vaultDrtTokenAccount);
        available = tokenBalance.value.uiAmount || 0;
      }
    } catch (error) {
      console.error(`Error fetching token balance for ${drtType}:`, error);
    }
    
    availableDRTs.push({
      name: drtType,
      mint: drtMint.toBase58(),
      supply,
      cost,
      available,
      isMinted,
      githubUrl,
      codeHash
    });
  }
  
  return availableDRTs;
}