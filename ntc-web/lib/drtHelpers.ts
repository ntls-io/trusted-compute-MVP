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
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@/lib/solanaToken";
import {
  type Commitment,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
  ComputeBudgetProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import bs58 from "bs58";

import { SOLANA_ENDPOINT } from "@/lib/config";
import { MAX_TRANSACTION_LEN } from "@/lib/redemption";

// Constants for retry logic and network configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries
const DEVNET_URL = SOLANA_ENDPOINT;
const COMMITMENT = 'confirmed';

// Minimal wallet shape needed by the helpers below
interface WalletLike {
  publicKey: PublicKey | null;
}

/** A wallet that can sign a transaction without immediately sending it. */
export interface SigningWallet extends WalletLike {
  signTransaction?: <T extends Transaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction>(transactions: T[]) => Promise<T[]>;
}

/**
 * Raised when a multi-transaction operation fails partway. The earlier
 * transactions are already on-chain and cannot be rolled back, so the caller
 * has to surface what did land rather than report a clean failure.
 */
export class PartialBatchError extends Error {
  constructor(
    message: string,
    readonly landed: string[],
    readonly failedIndex: number,
    readonly cause: unknown
  ) {
    super(message);
    this.name = "PartialBatchError";
  }
}

/** A sent transaction, including the exact bytes the wallet signed. */
export interface SentTransaction {
  /** Base58 transaction signature. */
  tx: string;
  /** The 64 raw signature bytes, for the ephemeral possession proof. */
  signature: Uint8Array;
  /** Serialized signed transaction; the enclave verifies these bytes. */
  signedTransaction: Uint8Array;
}

/**
 * Sign and send a transaction with the redemption memo attached, returning the
 * signed bytes.
 *
 * This exists instead of `.rpc()` / `provider.sendAndConfirm` because those
 * return only a signature, and the enclave needs the signed transaction
 * itself: verifying it is what lets a single wallet prompt authorize both the
 * burn and the enclave operation. Still one prompt — `signTransaction`
 * followed by a raw send.
 */
export async function signSendWithMemo(
  connection: Connection,
  wallet: SigningWallet,
  transaction: Transaction,
  memoIx: TransactionInstruction,
  updateStatus?: (status: string) => void,
  commitment: Commitment = COMMITMENT
): Promise<SentTransaction> {
  const [sent] = await signSendBatchWithMemo(
    connection,
    wallet,
    [transaction],
    memoIx,
    updateStatus,
    commitment
  );
  return sent;
}

/**
 * Serialized size of an unsigned transaction, for the packing budget.
 *
 * Measured from the compiled message rather than `serialize()`, which asserts
 * on oversize and would throw before the caller can report a useful error.
 */
function unsignedSize(transaction: Transaction): number {
  const message = transaction.serializeMessage();
  const signers = transaction.compileMessage().header.numRequiredSignatures;
  // compact-u16 length prefix on the signature array
  const prefix = signers < 0x80 ? 1 : 2;
  return prefix + signers * 64 + message.length;
}

/**
 * Greedily pack instructions into as few transactions as fit under the packet
 * limit, preserving order.
 *
 * Pool creation with three DRTs is 1274 bytes as a single transaction — over
 * the 1232 limit before any memo is added — so it has to be split. Packing
 * rather than hardcoding a split keeps this correct if the DRT catalogue grows.
 */
export function packInstructions(
  instructions: TransactionInstruction[],
  feePayer: PublicKey
): Transaction[] {
  // Any 32-byte value serializes to the same length as a real blockhash.
  const placeholder = bs58.encode(new Uint8Array(32).fill(1));
  const prepare = (ixs: TransactionInstruction[]) => {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = feePayer;
    tx.recentBlockhash = placeholder;
    return tx;
  };

  const batches: TransactionInstruction[][] = [];
  let current: TransactionInstruction[] = [];
  for (const ix of instructions) {
    const candidate = [...current, ix];
    if (current.length > 0 && unsignedSize(prepare(candidate)) > MAX_TRANSACTION_LEN) {
      batches.push(current);
      current = [ix];
    } else {
      current = candidate;
    }
    if (unsignedSize(prepare(current)) > MAX_TRANSACTION_LEN) {
      throw new Error(
        "A single instruction does not fit in one Solana transaction; it cannot be batched"
      );
    }
  }
  if (current.length > 0) batches.push(current);
  return batches.map(prepare);
}

/**
 * Sign a batch of transactions with one wallet approval and send them in
 * order, attaching the commitment memo to the first.
 *
 * The memo goes on `transactions[0]`, which must be the transaction carrying
 * the event the enclave is authorized against — `createPoolWithDrts` or
 * `redeemDrt`. Later transactions are follow-on setup and carry no commitment.
 *
 * They are sent sequentially because later transactions depend on accounts the
 * earlier ones create; Solana gives no ordering guarantee within a block.
 */
export async function signSendBatchWithMemo(
  connection: Connection,
  wallet: SigningWallet,
  transactions: Transaction[],
  memoIx: TransactionInstruction,
  updateStatus?: (status: string) => void,
  commitment: Commitment = COMMITMENT
): Promise<SentTransaction[]> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (transactions.length === 0) throw new Error("No transactions to send");
  const signAll = wallet.signAllTransactions;
  const signOne = wallet.signTransaction;
  if (transactions.length > 1 ? typeof signAll !== "function" : typeof signOne !== "function") {
    throw new Error(
      "Connected wallet cannot sign transactions without sending them, which " +
        "is required to authorize enclave operations."
    );
  }

  transactions[0].add(memoIx);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(commitment);
  for (const transaction of transactions) {
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = blockhash;
    const size = unsignedSize(transaction);
    if (size > MAX_TRANSACTION_LEN) {
      throw new Error(
        `Transaction is ${size} bytes, over Solana's ${MAX_TRANSACTION_LEN}-byte limit`
      );
    }
  }

  // One approval for the whole batch.
  updateStatus?.(
    transactions.length > 1
      ? `Waiting for wallet signature (${transactions.length} transactions)…`
      : "Waiting for wallet signature…"
  );
  const signed =
    transactions.length > 1
      ? await signAll!(transactions)
      : [await signOne!(transactions[0])];

  const sent: SentTransaction[] = [];
  for (const [index, transaction] of signed.entries()) {
    if (signed.length > 1) {
      updateStatus?.(`Sending transaction ${index + 1} of ${signed.length}…`);
    }
    const raw = transaction.serialize();
    try {
      const tx = await connection.sendRawTransaction(raw, {
        preflightCommitment: commitment,
      });
      updateStatus?.(
        commitment === "finalized"
          ? "Waiting for on-chain finality (usually 10-30s)…"
          : "Confirming on-chain…"
      );
      await connection.confirmTransaction(
        { signature: tx, blockhash, lastValidBlockHeight },
        commitment
      );
      sent.push({
        tx,
        signature: bs58.decode(tx),
        signedTransaction: Uint8Array.from(raw),
      });
    } catch (error) {
      if (index === 0) throw error;
      // Earlier transactions are already on-chain. Say so, with their
      // signatures, rather than reporting a clean failure the caller might
      // retry from scratch against a pool that already exists.
      throw new PartialBatchError(
        `Transaction ${index + 1} of ${signed.length} failed after ${index} ` +
          `already landed on-chain (${sent.map((s) => s.tx).join(", ")}). ` +
          `The pool exists but its DRT mints are not fully initialised.`,
        sent.map((s) => s.tx),
        index,
        error
      );
    }
  }
  return sent;
}

// Raw on-chain DRT/pool account shapes (Anchor account fetch results aren't
// strongly typed from the raw IDL here, so we describe the fields we use).
interface RawDrtAccount {
  drtType?: string;
  drt_type?: string;
  mint: PublicKey;
  supply?: number | { toNumber(): number };
  cost?: number | { toNumber(): number };
  githubUrl?: string;
  github_url?: string;
  codeHash?: string;
  code_hash?: string;
  isMinted?: boolean;
  is_minted?: boolean;
}

interface RawPoolAccount {
  owner?: PublicKey;
  name?: string;
  bump?: number;
  ownershipMint: PublicKey;
  drts: RawDrtAccount[];
}

function getPoolAccounts(program: anchor.Program) {
  return program.account as unknown as {
    pool: { fetch(pubkey: PublicKey): Promise<RawPoolAccount> };
  };
}

// Helper to create connection with proper configuration
export const getConnection = () => new Connection(DEVNET_URL, {
  commitment: COMMITMENT,
  confirmTransactionInitialTimeout: 60000
});

// On-chain code identity for a DRT. The wallet-signed enclave claim must
// carry these values from chain state, not from the off-chain database.
export interface OnChainDrtMetadata {
  githubUrl: string | null;
  codeHash: string | null;
}

/**
 * Read a DRT's GitHub URL and code hash from the on-chain pool account.
 * Throws if the DRT type is not configured on the pool.
 */
export async function getOnChainDrtMetadata(
  program: anchor.Program,
  poolAddress: string,
  drtType: string
): Promise<OnChainDrtMetadata> {
  const poolAccount = await getPoolAccounts(program).pool.fetch(
    new PublicKey(poolAddress)
  );
  const drtConfig = poolAccount.drts.find(
    (drt: RawDrtAccount) => drt.drtType === drtType || drt.drt_type === drtType
  );
  if (!drtConfig) {
    throw new Error(`DRT type '${drtType}' not found in on-chain pool state`);
  }
  return {
    githubUrl: drtConfig.githubUrl ?? drtConfig.github_url ?? null,
    codeHash: drtConfig.codeHash ?? drtConfig.code_hash ?? null,
  };
}

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
        } catch {
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
 * @param quantity The number of DRTs to buy (default is 1)
 * @param updateStatus Optional callback for status updates
 */
export async function buyDrt(
  program: anchor.Program,
  wallet: WalletLike,
  poolAddress: string,
  drtType: string,
  quantity = 1,
  updateStatus?: (status: string) => void
): Promise<string> {

  if (quantity < 1) throw new Error("quantity must be ≥ 1");
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const poolPubkey = new PublicKey(poolAddress);
  
  // Fetch pool account to get DRT information
  updateStatus?.("Fetching pool data...");
  const poolAccount = await getPoolAccounts(program).pool.fetch(poolPubkey);
  
  // Find the DRT config
  const drtConfig = poolAccount.drts.find((drt: RawDrtAccount) => 
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

  /* ---------- build instructions ---------- */
  const ixs: anchor.web3.TransactionInstruction[] = [];

  // optional: raise compute budget (use CBI = Compute-Budget Ix)
  ixs.push(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10 }),
  );
  
  for (let i = 0; i < quantity; i++) {
    const ix = await program.methods
      .buyDrt(drtType)
      .accounts({
        pool:                 poolPubkey,
        drtMint:              drtMint,
        vaultDrtTokenAccount: vaultDrtTokenAccount,
        buyer:                wallet.publicKey,
        buyerTokenAccount:    buyerTokenAccount,
        feeVault,
        tokenProgram:         TOKEN_PROGRAM_ID,
        systemProgram:        SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent:                 SYSVAR_RENT_PUBKEY,
      })
      .instruction();                // build, don’t send yet
    ixs.push(ix);
  }

  /* ---------- send tx (can split if gigantic) ---------- */
  const tx     = new Transaction().add(...ixs);
  const provider = program.provider as anchor.AnchorProvider;
  if (!provider) throw new Error("Anchor provider not initialised");
  const sig    = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  updateStatus?.(`Bought ${quantity} ${drtType} token(s). Tx: ${sig}`);

  return sig;
}

/**
 * Redeem a DRT token, carrying the enclave commitment in the same transaction.
 *
 * @param program The anchor program instance
 * @param wallet The wallet to use for redemption
 * @param poolAddress The address of the pool
 * @param drtType The type of DRT to redeem
 * @param memoIx Memo instruction committing to the enclave request
 * @param updateStatus Optional callback for status updates
 */
export async function redeemDrt(
  program: anchor.Program,
  wallet: SigningWallet,
  poolAddress: string,
  drtType: string,
  memoIx: TransactionInstruction,
  updateStatus?: (status: string) => void
): Promise<SentTransaction & { ownershipTokenReceived: boolean }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  
  // Fetch pool account
  updateStatus?.("Fetching pool data...");
  const poolAccount = await getPoolAccounts(program).pool.fetch(poolPubkey);
  
  // Find the DRT config
  const drtConfig = poolAccount.drts.find((drt: RawDrtAccount) => 
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
      const redeemIx = await program.methods
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
        .instruction();

      // Wait for finality here rather than at `confirmed`. The oracle reads
      // the transaction at finalized commitment, so confirming early just
      // moves the wait into the enclave call, where it surfaces as a series of
      // failed requests instead of a progress message.
      const sent = await signSendWithMemo(
        program.provider.connection,
        wallet,
        new Transaction().add(redeemIx),
        memoIx,
        updateStatus,
        "finalized"
      );

      const ownershipTokenReceived = drtType === "append";
      updateStatus?.(`DRT redeemed successfully. Transaction: ${sent.tx}${ownershipTokenReceived ? ", ownership token received" : ""}`);

      return { ...sent, ownershipTokenReceived };
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
  wallet: WalletLike,
  poolAddress: string,
  amount: BN,
  updateStatus?: (status: string) => void
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const poolPubkey = new PublicKey(poolAddress);
  
  // Fetch pool account
  updateStatus?.("Fetching pool data...");
  const poolAccount = await getPoolAccounts(program).pool.fetch(poolPubkey);
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
  const poolAccount = await getPoolAccounts(program).pool.fetch(poolPubkey);
  const availableDRTs = [];
  
  // Process each DRT in the pool
  for (const drt of poolAccount.drts) {
    const drtType = drt.drtType || drt.drt_type || '';
    const drtMint = drt.mint;
    const supply = Number(drt.supply);
    const cost = Number(drt.cost) / 1_000_000_000; // Convert lamports to SOL
    const isMinted = drt.isMinted || drt.is_minted || false;
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

// Helper function to format DRT configurations
export const formatDrtConfigs = <
  T extends { drtType: string; supply: BN; cost: BN; githubUrl?: string; codeHash?: string }
>(cfg: T[]) =>
  cfg.map(c => ({
    drtType:  c.drtType,
    supply:   c.supply,
    cost:     c.cost,
    githubUrl: c.githubUrl ?? null,
    codeHash:  c.codeHash  ?? null,
  }));

// Helper function to bundle PDAs
export function derivePoolPdas(
  poolName: string,
  drtCfg: ReturnType<typeof formatDrtConfigs>,
  programId: PublicKey,
  owner: PublicKey,
) {
  const [poolPda]         = getPoolPda(owner, poolName, programId);
  const [feeVaultPda]     = getFeeVaultPda(poolPda, programId);
  const [ownershipMintPda]= getOwnershipMintPda(poolPda, programId);

  const drtMintPdas: Record<string, PublicKey> = {};
  for (const c of drtCfg) {
    const [pda] = getDrtMintPda(poolPda, c.drtType, programId);
    drtMintPdas[c.drtType] = pda;
  }
  return { poolPda, feeVaultPda, ownershipMintPda, drtMintPdas };
}

/**
 * Build a single-signature pool-creation TX:
 *  ▸ ix0  create_pool_with_drts
 *  ▸ ix1…n initialize_drt_mint   (one per DRT)
 *  ▸ ixN… mint_drt_supply        (one per DRT)
 */
export async function buildPoolCreationTx(
  program: anchor.Program,
  provider: AnchorProvider,
  poolName: string,
  drtConfigs: ReturnType<typeof formatDrtConfigs>,   // reuse your formatter
  ownershipSupply: BN
): Promise<{
  transactions: anchor.web3.Transaction[];
  pdas: ReturnType<typeof derivePoolPdas>;
}> {
  const owner = provider.wallet.publicKey;
  const { poolPda, feeVaultPda, ownershipMintPda, drtMintPdas } =
        derivePoolPdas(poolName, drtConfigs, program.programId, owner);

  /* -- ix0 ──────────────────────────────────────────────────────────── */
  const createPoolIx = await program.methods
    .createPoolWithDrts(poolName, drtConfigs, ownershipSupply)
    .accounts({
      pool: poolPda,
      owner,
      ownershipMint:        ownershipMintPda,
      ownershipTokenAccount: await getAssociatedTokenAddress(ownershipMintPda, owner),
      feeVault:             feeVaultPda,
      systemProgram:        SystemProgram.programId,
      tokenProgram:         TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent:                 SYSVAR_RENT_PUBKEY,
    })
    .instruction();                            // <-- NOT rpc()

  /* -- ix1…n initialise each DRT mint ───────────────────────────────── */
  const initMintIxs = await Promise.all(
    Object.entries(drtMintPdas).map(([drtType, mintPda]) =>
      program.methods
        .initializeDrtMint(drtType)
        .accounts({
          pool: poolPda,
          drtMint: mintPda,
          owner,
          systemProgram: SystemProgram.programId,
          tokenProgram:  TOKEN_PROGRAM_ID,
          rent:          SYSVAR_RENT_PUBKEY,
        })
        .instruction()
    )
  );

  /* -- ix(n+1)… create vault ATAs  ──────────────────────────────────── */
  const createVaultIxs = Object.values(drtMintPdas).map(mintPda => {
    const vaultAta = getAssociatedTokenAddressSync(mintPda, poolPda, true);
    return createAssociatedTokenAccountInstruction(
      owner,        // fee-payer
      vaultAta,     // new ATA
      poolPda,      // owner (off curve PDA, allowed)
      mintPda
    );
  });

  /* -- ixN… mint initial supplies ───────────────────────────────────── */
  const mintSupplyIxs = await Promise.all(
    Object.entries(drtMintPdas).map(([drtType, mintPda]) => {
      const vaultAta = getAssociatedTokenAddressSync(mintPda, poolPda, true);
      return program.methods
        .mintDrtSupply(drtType)
        .accounts({
          pool: poolPda,
          drtMint: mintPda,
          owner,
          vaultTokenAccount: vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
    })
  );

  /* -- build transactions --------------------------------------------- */
  // createPoolWithDrts goes alone in the first transaction: it emits the
  // PoolCreated event the enclave is authorized against, so it is the one the
  // commitment memo must ride in. With three DRTs the mint setup no longer
  // fits alongside it, so the rest is packed into follow-on transactions and
  // signed in the same approval.
  const setupIxs = [...initMintIxs, ...createVaultIxs, ...mintSupplyIxs];
  const transactions = [
    new anchor.web3.Transaction().add(createPoolIx),
    ...packInstructions(setupIxs, owner),
  ];

  return {
    transactions,
    pdas: { poolPda, feeVaultPda, ownershipMintPda, drtMintPdas },
  };
}
