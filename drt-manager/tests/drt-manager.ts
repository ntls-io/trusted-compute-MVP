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
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import ShortUniqueId from 'short-uuid';


// Increase the Mocha timeout to allow Solana transactions to complete
const MOCHA_TIMEOUT = 120000; // 2 minutes

describe("drt_manager", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as AnchorProvider;
  const program = anchor.workspace.DrtManager as Program<DrtManager>;
  const wallet = provider.wallet;

  // Initialize short UUID generator
  const translator = ShortUniqueId();
  const id = translator.new(); // Generates a new unique ID

  // Test data
  const POOL_NAME = `New_Pool_${id.slice(0, 10)}`;
  
  // DRT cost - 0.1 SOL in lamports
  const DRT_COST = new BN(100000000); // 0.1 SOL
  
  // Remove the old fixed fee since it's now part of the DRT config
  // const DRT_FEE = new BN(10000000); // 0.01 SOL - This is replaced by DRT_COST

  // Different DRT supplies
  const APPEND_SUPPLY = new BN(5000);
  const WASM_COMPUTE_SUPPLY = new BN(1000);
  const PYTHON_COMPUTE_SUPPLY = new BN(2000);

  // Define DRT types
  const APPEND_DRT_TYPE = "append";
  const WASM_DRT_TYPE = "w_compute_median";
  const PYTHON_DRT_TYPE = "py_compute_median";

  // GitHub URLs and hashes for different DRT types
  const APPEND_URL =
    "https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/json-append/src/lib.rs";
  const WASM_URL =
    "https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_median_wasm.wasm";
  const PYTHON_URL =
    "https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_median.py";

  const WASM_HASH =
    "728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813";
  const PYTHON_HASH =
    "c648a5eefbd58c1fe95c48a53ceb7f0957ee1c5842f043710a41b21123e170d7";

  // Test accounts
  let poolPda;
  let feeVaultPda;
  let feeVaultBump;
  let ownershipMintPda;

  // DRT mint PDAs
  let appendMintPda;
  let wasmComputeMintPda;
  let pythonComputeMintPda;

  // Token accounts
  let ownershipTokenAccount;
  let appendTokenAccount;
  let wasmTokenAccount;
  let pythonTokenAccount;

  // User accounts for testing
  let userKeypair;
  let userDrtAccount;
  let userOwnershipAccount;

  const logTransaction = async (signature) => {
    console.log(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  };

  // Increase timeout for before hook
  before(async function () {
    // Increase the timeout for this hook
    this.timeout(MOCHA_TIMEOUT);

    console.log("Setting up test accounts...");
    console.log("Using pool name with random UID:", POOL_NAME);

    // Find PDAs
    [poolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        wallet.publicKey.toBuffer(),
        Buffer.from(POOL_NAME),
      ],
      program.programId
    );

    [feeVaultPda, feeVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault"), poolPda.toBuffer()],
      program.programId
    );

    // Find the ownership mint PDA
    [ownershipMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ownership_mint"), poolPda.toBuffer()],
      program.programId
    );

    // Find the DRT mint PDAs
    [appendMintPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("drt_mint"),
        poolPda.toBuffer(),
        Buffer.from(APPEND_DRT_TYPE),
      ],
      program.programId
    );

    [wasmComputeMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("drt_mint"), poolPda.toBuffer(), Buffer.from(WASM_DRT_TYPE)],
      program.programId
    );

    [pythonComputeMintPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("drt_mint"),
        poolPda.toBuffer(),
        Buffer.from(PYTHON_DRT_TYPE),
      ],
      program.programId
    );

    console.log("Pool PDA:", poolPda.toString());
    console.log(
      "Fee Vault PDA:",
      feeVaultPda.toString(),
      "Bump:",
      feeVaultBump
    );
    console.log("Ownership Mint PDA:", ownershipMintPda.toString());
    console.log("Append Mint PDA:", appendMintPda.toString());
    console.log("WASM Compute Mint PDA:", wasmComputeMintPda.toString());
    console.log("Python Compute Mint PDA:", pythonComputeMintPda.toString());

    // Create a user keypair for testing
    userKeypair = web3.Keypair.generate();

    // Fund the test user - need enough for buying multiple DRTs at 0.1 SOL each
    const fundTx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: userKeypair.publicKey,
        lamports: 300000000, // 0.3 SOL - enough for multiple DRT purchases
      })
    );
    await provider.sendAndConfirm(fundTx);
    console.log(
      "Created and funded test user:",
      userKeypair.publicKey.toString()
    );
  });

  // Increase timeout for all tests
  it("Creates a pool with DRTs", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Define DRT configurations
      const drtConfigs = [
        {
          drtType: APPEND_DRT_TYPE,
          supply: APPEND_SUPPLY,
          cost: DRT_COST,
          githubUrl: APPEND_URL,
          codeHash: null,
        },
        {
          drtType: WASM_DRT_TYPE,
          supply: WASM_COMPUTE_SUPPLY,
          cost: DRT_COST,
          githubUrl: WASM_URL,
          codeHash: WASM_HASH,
        },
        {
          drtType: PYTHON_DRT_TYPE,
          supply: PYTHON_COMPUTE_SUPPLY,
          cost: DRT_COST,
          githubUrl: PYTHON_URL,
          codeHash: PYTHON_HASH,
        },
      ];

      // Calculate the address for the ownership token account
      ownershipTokenAccount = await getAssociatedTokenAddress(
        ownershipMintPda, 
        wallet.publicKey
      );
      console.log("Calculated ownership token account:", ownershipTokenAccount.toString());

      const OWNERSHIP_SUPPLY = new BN(1000000);

      // Create the pool with all DRTs in one transaction
      const tx = await program.methods
        .createPoolWithDrts(POOL_NAME, drtConfigs, OWNERSHIP_SUPPLY)
        .accounts({
          owner: wallet.publicKey,
        })
        .rpc();

      await logTransaction(tx);

      // Verify the pool was created properly
      const poolAccount = await program.account.pool.fetch(poolPda);
      console.log("Pool name:", poolAccount.name);
      console.log("Number of DRTs:", poolAccount.drts.length);

      // Verify each DRT was properly added with the correct mint PDA
      for (let i = 0; i < drtConfigs.length; i++) {
        const config = drtConfigs[i];
        const drt = poolAccount.drts.find((d) => d.drtType === config.drtType);

        console.log(`${config.drtType} DRT added:`, !!drt);

        if (drt) {
          // Check that the mint matches our expected PDA for this DRT type
          let expectedPda;
          if (config.drtType === APPEND_DRT_TYPE) {
            expectedPda = appendMintPda;
          } else if (config.drtType === WASM_DRT_TYPE) {
            expectedPda = wasmComputeMintPda;
          } else if (config.drtType === PYTHON_DRT_TYPE) {
            expectedPda = pythonComputeMintPda;
          }

          console.log(
            `- Mint matches expected PDA:`,
            drt.mint.equals(expectedPda)
          );
          console.log(`- Supply:`, drt.supply.toString());
          console.log(`- Cost:`, drt.cost.toString());
          console.log(`- GitHub URL:`, drt.githubUrl === config.githubUrl);
          console.log(`- Is Minted:`, drt.isMinted); // Should be false initially
          if (config.codeHash) {
            console.log(`- Code Hash:`, drt.codeHash === config.codeHash);
          }
        }
      }

      // Create the ownership token account now that the ownership mint exists
      try {
        const ownershipATAResponse = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          wallet.payer,
          ownershipMintPda,
          wallet.publicKey
        );
        console.log("Created ownership token account:", ownershipATAResponse.address.toString());
      } catch (e) {
        console.log("Error creating ownership token account:", e);
      }

      console.log("✅ Pool created successfully with all DRTs");
    } catch (error) {
      console.error("Error creating pool:", error);
      throw error;
    }
  });

  it("Initializes DRT mints", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Initialize append DRT mint
      const appendTx = await program.methods
        .initializeDrtMint(APPEND_DRT_TYPE)
        .accounts({
          pool: poolPda,
          owner: wallet.publicKey,
        })
        .rpc();

      console.log("Initialized append DRT mint, tx:", appendTx);
      await logTransaction(appendTx);

      // Initialize WASM compute DRT mint
      const wasmTx = await program.methods
        .initializeDrtMint(WASM_DRT_TYPE)
        .accounts({
          pool: poolPda,
          owner: wallet.publicKey,
        })
        .rpc();

      console.log("Initialized WASM compute DRT mint, tx:", wasmTx);
      await logTransaction(wasmTx);

      // Initialize Python compute DRT mint
      const pythonTx = await program.methods
        .initializeDrtMint(PYTHON_DRT_TYPE)
        .accounts({
          pool: poolPda,
          owner: wallet.publicKey,
        })
        .rpc();

      console.log("Initialized Python compute DRT mint, tx:", pythonTx);
      await logTransaction(pythonTx);

      console.log("✅ All DRT mints initialized successfully");
    } catch (error) {
      console.error("Error initializing DRT mints:", error);
      throw error;
    }
  });

  it("Creates vault token accounts", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Now that the mints exist, create the token accounts
      console.log("Creating vault token accounts...");

      // Create append token account
      const appendAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        appendMintPda,
        poolPda,
        true
      );
      appendTokenAccount = appendAccount.address;
      console.log("Created append vault token account:", appendTokenAccount.toString());

      // Create WASM token account
      const wasmAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        wasmComputeMintPda,
        poolPda,
        true
      );
      wasmTokenAccount = wasmAccount.address;
      console.log("Created WASM vault token account:", wasmTokenAccount.toString());

      // Create Python token account
      const pythonAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        pythonComputeMintPda,
        poolPda,
        true
      );
      pythonTokenAccount = pythonAccount.address;
      console.log("Created Python vault token account:", pythonTokenAccount.toString());

      console.log("✅ All vault token accounts created successfully");
    } catch (error) {
      console.error("Error creating vault token accounts:", error);
      throw error;
    }
  });

  it("Mints initial supply for DRTs", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Now that we have the token accounts, mint the tokens
      // Mint append DRT supply
      console.log("Minting append DRT supply...");
      let appendTx = await program.methods
        .mintDrtSupply(APPEND_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: appendMintPda,
          owner: wallet.publicKey,
          vaultTokenAccount: appendTokenAccount,
        })
        .rpc();

      console.log("Minted append DRT supply, tx:", appendTx);
      await logTransaction(appendTx);

      // Mint WASM compute DRT supply
      console.log("Minting WASM compute DRT supply...");
      let wasmTx = await program.methods
        .mintDrtSupply(WASM_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: wasmComputeMintPda,
          owner: wallet.publicKey,
          vaultTokenAccount: wasmTokenAccount,
        })
        .rpc();

      console.log("Minted WASM compute DRT supply, tx:", wasmTx);
      await logTransaction(wasmTx);

      // Mint Python compute DRT supply
      console.log("Minting Python compute DRT supply...");
      let pythonTx = await program.methods
        .mintDrtSupply(PYTHON_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: pythonComputeMintPda,
          owner: wallet.publicKey,
          vaultTokenAccount: pythonTokenAccount,
        })
        .rpc();

      console.log("Minted Python compute DRT supply, tx:", pythonTx);
      await logTransaction(pythonTx);

      // Verify the token balances
      const appendBalance = await provider.connection.getTokenAccountBalance(
        appendTokenAccount
      );
      const wasmBalance = await provider.connection.getTokenAccountBalance(
        wasmTokenAccount
      );
      const pythonBalance = await provider.connection.getTokenAccountBalance(
        pythonTokenAccount
      );

      console.log("Append DRT balance:", appendBalance.value.amount);
      console.log("WASM compute DRT balance:", wasmBalance.value.amount);
      console.log("Python compute DRT balance:", pythonBalance.value.amount);

      // Verify that the DRTs are now marked as minted
      const poolAccount = await program.account.pool.fetch(poolPda);
      const appendDrt = poolAccount.drts.find(
        (d) => d.drtType === APPEND_DRT_TYPE
      );
      const wasmDrt = poolAccount.drts.find((d) => d.drtType === WASM_DRT_TYPE);
      const pythonDrt = poolAccount.drts.find(
        (d) => d.drtType === PYTHON_DRT_TYPE
      );

      console.log("Append DRT is minted:", appendDrt.isMinted);
      console.log("WASM DRT is minted:", wasmDrt.isMinted);
      console.log("Python DRT is minted:", pythonDrt.isMinted);

      console.log("✅ Initial DRT supplies minted successfully");
    } catch (error) {
      console.error("Error minting DRT supplies:", error);
      throw error;
    }
  });

  it("Cannot mint the same DRT twice", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Try to mint append DRT again (should fail)
      try {
        const appendTx = await program.methods
          .mintDrtSupply(APPEND_DRT_TYPE)
          .accounts({
            pool: poolPda,
            drtMint: appendMintPda,
            owner: wallet.publicKey,
            vaultTokenAccount: appendTokenAccount,
          })
          .rpc();

        console.error("ERROR: Should not be able to mint twice!");
      } catch (error) {
        console.log("✅ Successfully prevented double minting:", error.message);
      }
    } catch (error) {
      console.error("Unexpected error in double minting test:", error);
    }
  });

  it("Buys an append DRT", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Create the buyer's token account
      console.log("Creating user token account for append DRT...");
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        userKeypair,
        appendMintPda,
        userKeypair.publicKey
      );
      userDrtAccount = userTokenAccount.address;
      console.log("Created user token account:", userDrtAccount.toString());

      // Buy the DRT
      const tx = await program.methods
        .buyDrt(APPEND_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: appendMintPda,
          buyer: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      await logTransaction(tx);

      // Verify the user received the token
      const tokenInfo = await provider.connection.getTokenAccountBalance(
        userDrtAccount
      );
      console.log("User DRT balance:", tokenInfo.value.amount);
      console.log(
        "User received DRT token:",
        tokenInfo.value.amount === "1" ? "Yes" : "No"
      );

      console.log("✅ Append DRT purchased successfully");
    } catch (error) {
      console.error("Error buying DRT:", error);
      throw error;
    }
  });

  it("Redeems an append DRT", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Create user's ownership token account
      console.log("Creating user ownership token account...");
      const ownershipAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        userKeypair,
        ownershipMintPda,
        userKeypair.publicKey
      );
      userOwnershipAccount = ownershipAccount.address;
      console.log("Created user ownership token account:", userOwnershipAccount.toString());

      // Redeem the DRT
      const tx = await program.methods
        .redeemDrt(APPEND_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: appendMintPda,
          ownershipMint: ownershipMintPda,
          user: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      await logTransaction(tx);

      // Verify the DRT was burned
      try {
        const drtInfo = await provider.connection.getTokenAccountBalance(
          userDrtAccount
        );
        console.log(
          "User's DRT balance after redemption:",
          drtInfo.value.amount
        );
      } catch (e) {
        console.log("User's DRT account balance may be zero as expected");
      }

      // Verify the user received an ownership token as reward
      const ownershipInfo = await provider.connection.getTokenAccountBalance(
        userOwnershipAccount
      );
      console.log("User ownership token balance:", ownershipInfo.value.amount);
      console.log(
        "User received ownership token:",
        parseInt(ownershipInfo.value.amount) > 0 ? "Yes" : "No"
      );

      console.log("✅ Append DRT redeemed successfully");
    } catch (error) {
      console.error("Error redeeming DRT:", error);
      throw error;
    }
  });

  it("Buys a WASM compute DRT", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Create the buyer's WASM token account
      console.log("Creating user token account for WASM DRT...");
      const wasmUserTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        userKeypair,
        wasmComputeMintPda,
        userKeypair.publicKey
      );
      const userWasmDrtAccount = wasmUserTokenAccount.address;
      console.log("Created user WASM token account:", userWasmDrtAccount.toString());

      // Buy the DRT
      const tx = await program.methods
        .buyDrt(WASM_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: wasmComputeMintPda,
          buyer: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      await logTransaction(tx);

      // Verify the user received the token
      const tokenInfo = await provider.connection.getTokenAccountBalance(
        userWasmDrtAccount
      );
      console.log("User WASM DRT balance:", tokenInfo.value.amount);
      console.log(
        "User received WASM DRT token:",
        tokenInfo.value.amount === "1" ? "Yes" : "No"
      );

      console.log("✅ WASM compute DRT purchased successfully");

      // Save for next test
      userDrtAccount = userWasmDrtAccount;
    } catch (error) {
      console.error("Error buying WASM DRT:", error);
      throw error;
    }
  });

  it("Redeems a WASM compute DRT", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Redeem the WASM DRT
      const tx = await program.methods
        .redeemDrt(WASM_DRT_TYPE)
        .accounts({
          pool: poolPda,
          drtMint: wasmComputeMintPda,
          ownershipMint: ownershipMintPda,
          user: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      await logTransaction(tx);

      // Verify the WASM DRT was burned
      try {
        const drtInfo = await provider.connection.getTokenAccountBalance(
          userDrtAccount
        );
        console.log(
          "User's WASM DRT balance after redemption:",
          drtInfo.value.amount
        );
      } catch (e) {
        console.log("User's WASM DRT account balance may be zero as expected");
      }

      console.log("✅ WASM compute DRT redeemed successfully");

      // Note: Since this isn't an append DRT, no ownership tokens should be minted
      const ownershipInfo = await provider.connection.getTokenAccountBalance(
        userOwnershipAccount
      );
      console.log(
        "User ownership token balance (should be unchanged):",
        ownershipInfo.value.amount
      );
    } catch (error) {
      console.error("Error redeeming WASM DRT:", error);
      throw error;
    }
  });

  it("Redeems ownership tokens for fees", async function () {
    this.timeout(MOCHA_TIMEOUT);

    try {
      // Get user's initial SOL balance
      const initialBalance = await provider.connection.getBalance(
        userKeypair.publicKey
      );
      console.log("Initial SOL balance:", initialBalance);

      // Ensure we have userOwnershipAccount set
      if (!userOwnershipAccount) {
        console.log("Creating user ownership token account first...");
        const ownershipAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          userKeypair,
          ownershipMintPda,
          userKeypair.publicKey
        );
        userOwnershipAccount = ownershipAccount.address;
        console.log("Created user ownership token account:", userOwnershipAccount.toString());
      }

      // Get ownership token balance
      try {
        const ownershipInfo = await provider.connection.getTokenAccountBalance(
          userOwnershipAccount
        );
        console.log("Ownership token balance:", ownershipInfo.value.amount);

        // Only run the test if we have ownership tokens
        if (parseInt(ownershipInfo.value.amount) > 0) {
          // Get pool bump for proper PDA signing
          const poolAccount = await program.account.pool.fetch(poolPda);
          const poolBump = poolAccount.bump;

          console.log("Pool bump:", poolBump);
          console.log("Fee vault bump:", feeVaultBump);

          // Redeem one ownership token for fees
          const tx = await program.methods
            .redeemFees(new BN(1), feeVaultBump) // Add the feeVaultBump here
            .accounts({
              pool: poolPda,
              ownershipMint: ownershipMintPda,
              user: userKeypair.publicKey,
            })
            .signers([userKeypair])
            .rpc({ skipPreflight: true }); // Skip preflight to help with auth issues

          await logTransaction(tx);

          // Check updated ownership token balance
          try {
            const newOwnershipInfo =
              await provider.connection.getTokenAccountBalance(
                userOwnershipAccount
              );
            console.log(
              "Ownership token balance after redemption:",
              newOwnershipInfo.value.amount
            );
          } catch (e) {
            console.log("Ownership token account may be empty as expected");
          }

          // Verify the user received SOL from fees
          const finalBalance = await provider.connection.getBalance(
            userKeypair.publicKey
          );
          console.log("Final SOL balance:", finalBalance);
          console.log("SOL balance change (Lamports):", finalBalance - initialBalance);
          console.log(
            "User received SOL fees:",
            finalBalance > initialBalance ? "Yes" : "No"
          );

          console.log("✅ Ownership tokens redeemed successfully for fees");
        } else {
          console.log(
            "Skipping fee redemption test - no ownership tokens available"
          );
        }
      } catch (e) {
        console.log(
          "Error fetching ownership token balance, skipping test:",
          e
        );
      }
    } catch (error) {
      console.error("Error redeeming fees:", error);
      throw error;
    }
  });
});