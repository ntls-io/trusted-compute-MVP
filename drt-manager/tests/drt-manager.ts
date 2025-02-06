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
import { Program, web3, BN } from "@coral-xyz/anchor";
import { DrtManager } from "../target/types/drt_manager";
import { assert } from "chai";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getAssociatedTokenAddress,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

// The Metaplex Token Metadata program id.
const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

/**
 * Helper to format BN values for console logging.
 */
function formatBN(bn: BN | any): string {
  return bn instanceof BN ? bn.toString() : bn;
}

describe("drt_manager", () => {
  // Set up provider and program.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DrtManager as Program<DrtManager>;

  console.log("Program ID:", program.programId.toString());

  // Generate keypairs for pool state and main mints.
  const poolAccount = web3.Keypair.generate();
  const ownershipMint = web3.Keypair.generate();
  const appendMint = web3.Keypair.generate();

  // Generate keypairs for the new DRT mints.
  const wComputeMedianMint = web3.Keypair.generate();
  const pyComputeMedianMint = web3.Keypair.generate();
  const addDataMint = web3.Keypair.generate();

  // The pool owner is the provider's wallet.
  const owner = provider.wallet.publicKey;

  // Create a new buyer.
  const buyer = web3.Keypair.generate();

  // Associated token account variables.
  let ownerOwnershipTokenAccount: web3.PublicKey;
  let poolAppendTokenAccount: web3.PublicKey;
  let buyerAppendTokenAccount: web3.PublicKey;
  let buyerOwnershipTokenAccount: web3.PublicKey;

  // New token accounts for wComputeMedian, pyComputeMedian, and addData DRTs.
  let poolWComputeMedianTokenAccount: web3.PublicKey;
  let poolPyComputeMedianTokenAccount: web3.PublicKey;
  let poolAddDataTokenAccount: web3.PublicKey;
  let buyerWComputeMedianTokenAccount: web3.PublicKey;
  let buyerPyComputeMedianTokenAccount: web3.PublicKey;
  let buyerAddDataTokenAccount: web3.PublicKey;

  before(async () => {
    const balance = await provider.connection.getBalance(owner);
    console.log("Owner wallet balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");
    if (balance < web3.LAMPORTS_PER_SOL) {
      console.warn("Low balance; please fund your wallet on devnet manually.");
    }
  });

  it("Initialize Pool", async () => {
    // Derive associated token accounts.
    ownerOwnershipTokenAccount = await getAssociatedTokenAddress(
      ownershipMint.publicKey,
      owner
    );
    poolAppendTokenAccount = await getAssociatedTokenAddress(
      appendMint.publicKey,
      owner
    );
    buyerAppendTokenAccount = await getAssociatedTokenAddress(
      appendMint.publicKey,
      buyer.publicKey
    );
    buyerOwnershipTokenAccount = await getAssociatedTokenAddress(
      ownershipMint.publicKey,
      buyer.publicKey
    );

    console.log("Owner Ownership Token Account:", ownerOwnershipTokenAccount.toString());
    console.log("Pool Append Token Account:", poolAppendTokenAccount.toString());
    console.log("Buyer Append Token Account:", buyerAppendTokenAccount.toString());
    console.log("Buyer Ownership Token Account:", buyerOwnershipTokenAccount.toString());

    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    const tx = new web3.Transaction();

    // Create ownership mint.
    tx.add(
      web3.SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: ownershipMint.publicKey,
        space: MINT_SIZE,
        lamports: lamportsForMint,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    tx.add(
      createInitializeMintInstruction(ownershipMint.publicKey, 0, owner, owner)
    );

    // Create append mint.
    tx.add(
      web3.SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: appendMint.publicKey,
        space: MINT_SIZE,
        lamports: lamportsForMint,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    tx.add(
      createInitializeMintInstruction(appendMint.publicKey, 0, owner, owner)
    );

    // Create associated token accounts.
    tx.add(
      createAssociatedTokenAccountInstruction(owner, ownerOwnershipTokenAccount, owner, ownershipMint.publicKey)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, poolAppendTokenAccount, owner, appendMint.publicKey)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, buyerAppendTokenAccount, buyer.publicKey, appendMint.publicKey)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, buyerOwnershipTokenAccount, buyer.publicKey, ownershipMint.publicKey)
    );

    await provider.sendAndConfirm(tx, [ownershipMint, appendMint]);
    console.log("##### Ownership Mint Address:", ownershipMint.publicKey.toString(), "#####");
    console.log("##### Append Mint Address:", appendMint.publicKey.toString(), "#####");

    // Allowed DRTs for this pool.
    const allowedDrts = ["append", "w_compute", "py_compute", "add_data"];

    const poolName = "developer_salary";
    const ownershipSupply = new BN(1000000);
    const appendSupply = new BN(100);

    const accountsStruct = {
      pool: poolAccount.publicKey,
      owner: owner,
      ownershipMint: ownershipMint.publicKey,
      appendMint: appendMint.publicKey,
      poolAppendTokenAccount: poolAppendTokenAccount,
      ownerOwnershipTokenAccount: ownerOwnershipTokenAccount,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
    };

    // Call initialize_pool with allowedDrts.
    await program.methods
      .initializePool(poolName, ownershipSupply, appendSupply, allowedDrts)
      .accounts(accountsStruct)
      .signers([poolAccount])
      .rpc();

    console.log("Pool Account:", poolAccount.publicKey.toString());
    const poolAccountData = await program.account.pool.fetch(poolAccount.publicKey);
    console.log("Pool Account Data:", {
      name: poolAccountData.name,
      owner: poolAccountData.owner.toString(),
      feeAccumulator: formatBN(poolAccountData.feeAccumulator),
      ownershipMint: poolAccountData.ownershipMint.toString(),
      appendMint: poolAccountData.appendMint.toString(),
      // Map over our DrtType objects to display the inner string.
      allowedDrts: poolAccountData.allowedDrts.map((drt: any) => drt.value),
      ownershipSupply: formatBN(poolAccountData.ownershipSupply),
      appendSupply: formatBN(poolAccountData.appendSupply),
      wComputeMedianMint: poolAccountData.w_compute_median_mint,
      pyComputeMedianMint: poolAccountData.py_compute_median_mint,
      addDataMint: poolAccountData.add_data_mint,
    });
    assert.equal(poolAccountData.name, poolName);
    assert.ok(poolAccountData.feeAccumulator.eq(new BN(0)));
    assert.ok(poolAccountData.ownershipSupply.eq(ownershipSupply));
    assert.ok(poolAccountData.appendSupply.eq(appendSupply));
    assert.deepEqual(poolAccountData.allowedDrts.map((drt: any) => drt.value), allowedDrts);
  });

  // Set metadata for each token.
  it("Set Token Metadata for Ownership Mint", async () => {
    const [metadataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), ownershipMint.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("##### Ownership Token Address:", ownershipMint.publicKey.toString(), "#####");
    await program.methods
      .setTokenMetadata("developer_salary_ownership", "devsal_o", "https://example.com/ownership.json")
      .accounts({
        metadata: metadataPDA,
        mint: ownershipMint.publicKey,
        mintAuthority: owner,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Set token metadata for Ownership Mint completed.");
  });

  it("Set Token Metadata for Append Mint", async () => {
    const [metadataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), appendMint.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("##### Append Token Address:", appendMint.publicKey.toString(), "#####");
    await program.methods
      .setTokenMetadata("developer_salary_append", "devsal_a", "https://example.com/append.json")
      .accounts({
        metadata: metadataPDA,
        mint: appendMint.publicKey,
        mintAuthority: owner,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Set token metadata for Append Mint completed.");
  });

  // Buy and redeem AppendDRT.
  it("Buy Append DRT and Redeem Append DRT", async () => {
    const fee = new BN(1000);
    await program.methods
      .buyAppendDrt(fee)
      .accounts({
        pool: poolAccount.publicKey,
        poolAppendTokenAccount: poolAppendTokenAccount,
        userAppendTokenAccount: buyerAppendTokenAccount,
        owner: owner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Buyer bought an AppendDRT with fee:", fee.toString());

    const buyerAppendBalance = await provider.connection.getTokenAccountBalance(buyerAppendTokenAccount);
    console.log("Buyer Append Token Balance:", buyerAppendBalance.value.amount);
    assert.equal(buyerAppendBalance.value.amount, "1");

    const poolAccountData = await program.account.pool.fetch(poolAccount.publicKey);
    console.log("Updated Pool Fee Accumulator:", formatBN(poolAccountData.feeAccumulator));
    assert.ok(poolAccountData.feeAccumulator.eq(fee));

    await program.methods
      .redeemAppendDrt()
      .accounts({
        pool: poolAccount.publicKey,
        appendMint: appendMint.publicKey,
        ownershipMint: ownershipMint.publicKey,
        userAppendTokenAccount: buyerAppendTokenAccount,
        userOwnershipTokenAccount: buyerOwnershipTokenAccount,
        owner: owner,
        user: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    console.log("Buyer redeemed an AppendDRT.");

    const buyerAppendAfter = await provider.connection.getTokenAccountBalance(buyerAppendTokenAccount);
    console.log("Buyer Append Token Balance after redemption:", buyerAppendAfter.value.amount);
    assert.equal(buyerAppendAfter.value.amount, "0");

    const appendSupplyAfter = await provider.connection.getTokenSupply(appendMint.publicKey);
    console.log("##### Append Token Supply after redemption:", appendSupplyAfter.value.amount, "#####");
  });

  // Initialize, set metadata, buy and redeem wComputeMedianDRT.
  it("Initialize, Set Metadata, Buy, and Redeem wComputeMedian DRT", async () => {
    poolWComputeMedianTokenAccount = await getAssociatedTokenAddress(
      wComputeMedianMint.publicKey,
      owner
    );
    buyerWComputeMedianTokenAccount = await getAssociatedTokenAddress(
      wComputeMedianMint.publicKey,
      buyer.publicKey
    );

    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    let tx = new web3.Transaction();
    tx.add(
      web3.SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: wComputeMedianMint.publicKey,
        space: MINT_SIZE,
        lamports: lamportsForMint,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    tx.add(
      createInitializeMintInstruction(wComputeMedianMint.publicKey, 0, owner, owner)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, poolWComputeMedianTokenAccount, owner, wComputeMedianMint.publicKey)
    );
    await provider.sendAndConfirm(tx, [wComputeMedianMint]);
    console.log("##### wComputeMedian Mint Address:", wComputeMedianMint.publicKey.toString(), "#####");
    console.log("Pool wComputeMedian Token Account:", poolWComputeMedianTokenAccount.toString());

    const [wMetadataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), wComputeMedianMint.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Setting metadata for wComputeMedian Mint...");
    await program.methods
      .setTokenMetadata("developer_salary_wc_med", "devsal_wc", "https://example.com/w_compute_median.json")
      .accounts({
        metadata: wMetadataPDA,
        mint: wComputeMedianMint.publicKey,
        mintAuthority: owner,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Set token metadata for wComputeMedian Mint completed.");

    const wSupply = new BN(500);
    await program.methods
      .initializeWComputeMedianDrt(wSupply)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        wComputeMedianMint: wComputeMedianMint.publicKey,
        poolWComputeMedianTokenAccount: poolWComputeMedianTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Initialized wComputeMedian DRT with supply:", wSupply.toString());

    tx = new web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(owner, buyerWComputeMedianTokenAccount, buyer.publicKey, wComputeMedianMint.publicKey)
    );
    await provider.sendAndConfirm(tx, []);
    
    const fee = new BN(2000);
    await program.methods
      .buyWComputeMedianDrt(fee)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        poolWComputeMedianTokenAccount: poolWComputeMedianTokenAccount,
        userWComputeMedianTokenAccount: buyerWComputeMedianTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Buyer bought a wComputeMedian DRT with fee:", fee.toString());
    const buyerWBalance = await provider.connection.getTokenAccountBalance(buyerWComputeMedianTokenAccount);
    console.log("Buyer wComputeMedian Token Balance:", buyerWBalance.value.amount);
    assert.equal(buyerWBalance.value.amount, "1");

    await program.methods
      .redeemWComputeMedianDrt()
      .accounts({
        wComputeMedianMint: wComputeMedianMint.publicKey,
        userWComputeMedianTokenAccount: buyerWComputeMedianTokenAccount,
        user: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    console.log("Buyer redeemed a wComputeMedian DRT.");
    const buyerWBalanceAfter = await provider.connection.getTokenAccountBalance(buyerWComputeMedianTokenAccount);
    console.log("Buyer wComputeMedian Token Balance after redemption:", buyerWBalanceAfter.value.amount);
    assert.equal(buyerWBalanceAfter.value.amount, "0");

    const wComputeMedianSupply = await provider.connection.getTokenSupply(wComputeMedianMint.publicKey);
    console.log("##### wComputeMedian Token Supply after redemption:", wComputeMedianSupply.value.amount, "#####");
  });

  // Initialize, set metadata, buy and redeem pyComputeMedianDRT.
  it("Initialize, Set Metadata, Buy, and Redeem pyComputeMedian DRT", async () => {
    poolPyComputeMedianTokenAccount = await getAssociatedTokenAddress(
      pyComputeMedianMint.publicKey,
      owner
    );
    buyerPyComputeMedianTokenAccount = await getAssociatedTokenAddress(
      pyComputeMedianMint.publicKey,
      buyer.publicKey
    );

    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    let tx = new web3.Transaction();
    tx.add(
      web3.SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: pyComputeMedianMint.publicKey,
        space: MINT_SIZE,
        lamports: lamportsForMint,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    tx.add(
      createInitializeMintInstruction(pyComputeMedianMint.publicKey, 0, owner, owner)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, poolPyComputeMedianTokenAccount, owner, pyComputeMedianMint.publicKey)
    );
    await provider.sendAndConfirm(tx, [pyComputeMedianMint]);
    console.log("##### pyComputeMedian Mint Address:", pyComputeMedianMint.publicKey.toString(), "#####");
    console.log("Pool pyComputeMedian Token Account:", poolPyComputeMedianTokenAccount.toString());

    const [pyMetadataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), pyComputeMedianMint.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Setting metadata for pyComputeMedian Mint...");
    await program.methods
      .setTokenMetadata("developer_salary_py_med", "devsal_pc", "https://example.com/py_compute_median.json")
      .accounts({
        metadata: pyMetadataPDA,
        mint: pyComputeMedianMint.publicKey,
        mintAuthority: owner,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Set token metadata for pyComputeMedian Mint completed.");

    const pySupply = new BN(800);
    await program.methods
      .initializePyComputeMedianDrt(pySupply)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        pyComputeMedianMint: pyComputeMedianMint.publicKey,
        poolPyComputeMedianTokenAccount: poolPyComputeMedianTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Initialized pyComputeMedian DRT with supply:", pySupply.toString());

    tx = new web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(owner, buyerPyComputeMedianTokenAccount, buyer.publicKey, pyComputeMedianMint.publicKey)
    );
    await provider.sendAndConfirm(tx, []);
    
    const fee = new BN(3000);
    await program.methods
      .buyPyComputeMedianDrt(fee)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        poolPyComputeMedianTokenAccount: poolPyComputeMedianTokenAccount,
        userPyComputeMedianTokenAccount: buyerPyComputeMedianTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Buyer bought a pyComputeMedian DRT with fee:", fee.toString());
    const buyerPyBalance = await provider.connection.getTokenAccountBalance(buyerPyComputeMedianTokenAccount);
    console.log("Buyer pyComputeMedian Token Balance:", buyerPyBalance.value.amount);
    assert.equal(buyerPyBalance.value.amount, "1");

    await program.methods
      .redeemPyComputeMedianDrt()
      .accounts({
        pyComputeMedianMint: pyComputeMedianMint.publicKey,
        userPyComputeMedianTokenAccount: buyerPyComputeMedianTokenAccount,
        user: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    console.log("Buyer redeemed a pyComputeMedian DRT.");
    const buyerPyBalanceAfter = await provider.connection.getTokenAccountBalance(buyerPyComputeMedianTokenAccount);
    console.log("Buyer pyComputeMedian Token Balance after redemption:", buyerPyBalanceAfter.value.amount);
    assert.equal(buyerPyBalanceAfter.value.amount, "0");

    const pyComputeMedianSupply = await provider.connection.getTokenSupply(pyComputeMedianMint.publicKey);
    console.log("##### pyComputeMedian Token Supply after redemption:", pyComputeMedianSupply.value.amount, "#####");
  });

  // Initialize, set metadata, buy and redeem addDataDRT.
  it("Initialize, Set Metadata, Buy, and Redeem addData DRT", async () => {
    // Derive addData token accounts.
    poolAddDataTokenAccount = await getAssociatedTokenAddress(
      addDataMint.publicKey,
      owner
    );
    buyerAddDataTokenAccount = await getAssociatedTokenAddress(
      addDataMint.publicKey,
      buyer.publicKey
    );

    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    let tx = new web3.Transaction();
    tx.add(
      web3.SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: addDataMint.publicKey,
        space: MINT_SIZE,
        lamports: lamportsForMint,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    tx.add(
      createInitializeMintInstruction(addDataMint.publicKey, 0, owner, owner)
    );
    tx.add(
      createAssociatedTokenAccountInstruction(owner, poolAddDataTokenAccount, owner, addDataMint.publicKey)
    );
    await provider.sendAndConfirm(tx, [addDataMint]);
    console.log("##### addData Mint Address:", addDataMint.publicKey.toString(), "#####");
    console.log("Pool addData Token Account:", poolAddDataTokenAccount.toString());

    const [addDataMetadataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), addDataMint.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Setting metadata for addData Mint...");
    await program.methods
      .setTokenMetadata("developer_salary_add_data", "devsal_ad", "https://example.com/add_data.json")
      .accounts({
        metadata: addDataMetadataPDA,
        mint: addDataMint.publicKey,
        mintAuthority: owner,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("Set token metadata for addData Mint completed.");

    const adSupply = new BN(600);
    await program.methods
      .initializeAddDataDrt(adSupply)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        addDataMint: addDataMint.publicKey,
        poolAddDataTokenAccount: poolAddDataTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Initialized addData DRT with supply:", adSupply.toString());

    tx = new web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(owner, buyerAddDataTokenAccount, buyer.publicKey, addDataMint.publicKey)
    );
    await provider.sendAndConfirm(tx, []);
    
    const fee = new BN(1500);
    await program.methods
      .buyAddDataDrt(fee)
      .accounts({
        pool: poolAccount.publicKey,
        owner: owner,
        poolAddDataTokenAccount: poolAddDataTokenAccount,
        userAddDataTokenAccount: buyerAddDataTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Buyer bought an addData DRT with fee:", fee.toString());
    const buyerAdBalance = await provider.connection.getTokenAccountBalance(buyerAddDataTokenAccount);
    console.log("Buyer addData Token Balance:", buyerAdBalance.value.amount);
    assert.equal(buyerAdBalance.value.amount, "1");

    await program.methods
      .redeemAddDataDrt()
      .accounts({
        addDataMint: addDataMint.publicKey,
        userAddDataTokenAccount: buyerAddDataTokenAccount,
        user: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    console.log("Buyer redeemed an addData DRT.");
    const buyerAdBalanceAfter = await provider.connection.getTokenAccountBalance(buyerAddDataTokenAccount);
    console.log("Buyer addData Token Balance after redemption:", buyerAdBalanceAfter.value.amount);
    assert.equal(buyerAdBalanceAfter.value.amount, "0");

    const addDataSupplyAfter = await provider.connection.getTokenSupply(addDataMint.publicKey);
    console.log("##### addData Token Supply after redemption:", addDataSupplyAfter.value.amount, "#####");
  });
});
