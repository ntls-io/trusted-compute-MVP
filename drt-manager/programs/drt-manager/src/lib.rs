// Nautilus Trusted Compute
// Copyright (C) 2025 Nautilus
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};

declare_id!("6Y2vLKUapZT72uA22j7zDekTW1FVs85CEvvS4SiFu9Ai");

// --------------------------------
// Event Definitions
// --------------------------------

#[event]
pub struct DrtRedeemed {
    pub pool: Pubkey,
    pub drt_type: String,
    pub execution_type: String, // "append", "wasm", "python", etc.
    pub redeemer: Pubkey,
    pub github_url: Option<String>,
    pub code_hash: Option<String>,
    pub timestamp: i64,
}

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub ownership_mint: Pubkey,
    pub name: String,
    pub drt_types: Vec<String>,
}

// --------------------------------
// Account Structures
// --------------------------------

#[account]
pub struct Pool {
    pub bump: u8,
    pub name: String,
    pub owner: Pubkey,
    pub ownership_mint: Pubkey,
    pub drts: Vec<DrtConfig>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DrtConfig {
    pub drt_type: String,
    pub mint: Pubkey,
    pub supply: u64,
    pub github_url: Option<String>,
    pub code_hash: Option<String>,
    pub is_minted: bool,
}

// --------------------------------
// Error Codes
// --------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid DRT type")]
    InvalidDRTType,
    #[msg("Invalid pool name")]
    InvalidPoolName,
    #[msg("DRT not found")]
    DRTNotFound,
    #[msg("Unauthorized operation")]
    Unauthorized,
    #[msg("Insufficient tokens")]
    InsufficientTokens,
    #[msg("No fees available")]
    NoFeesAvailable,
    #[msg("Maximum DRTs reached")]
    MaxDrtsReached,
    #[msg("Invalid DRT supply")]
    InvalidSupply,
    #[msg("Minting already performed")]
    MintingAlreadyPerformed,
    #[msg("Metadata already set")]
    MetadataAlreadySet,
}

// --------------------------------
// Helper Functions
// --------------------------------

/// Helper: Get execution type based on DRT type
fn get_execution_type(drt_type: &str) -> String {
    if drt_type == "append" {
        "append".to_string()
    } else if drt_type.starts_with("w_compute_") {
        "wasm".to_string()
    } else if drt_type.starts_with("py_compute_") {
        "python".to_string()
    } else {
        "unknown".to_string()
    }
}

// --------------------------------
// Program Module
// --------------------------------

#[program]
pub mod drt_manager {
    use super::*;

    /// Creates a pool and initializes all DRTs in a single transaction.
    ///
    /// This function requires just one signature from the owner and handles:
    /// 1. Creating the pool
    /// 2. Registering all DRTs with their metadata
    /// 3. Setting up fee collection and ownership mint
    ///
    /// The DRTs are optional - you can provide just the ones you need.
    /// Each DRT has a recorded supply, but tokens are not minted during pool creation.
    /// Use the `mint_drt` function after pool creation to mint tokens (can only be done once per DRT).
    pub fn create_pool_with_drts(
        ctx: Context<CreatePoolWithDrts>,
        name: String,
        drt_configs: Vec<DrtInitConfig>,
    ) -> Result<()> {
        // Validate inputs
        require!(!name.is_empty(), ErrorCode::InvalidPoolName);
        
        // Get the pool bump
        let pool_bump = ctx.bumps.pool;

        // Extract pool info and owner key for use in seeds
        let pool_info = ctx.accounts.pool.to_account_info();
        let pool_key = pool_info.key();
        let owner_key = ctx.accounts.owner.key();
        let name_bytes = name.as_bytes();

        // Initialize pool data
        let pool = &mut ctx.accounts.pool;
        pool.bump = pool_bump;
        pool.name = name.clone();
        pool.owner = ctx.accounts.owner.key();
        pool.ownership_mint = ctx.accounts.ownership_mint.key();
        pool.drts = Vec::new();

        // Get the PDA seeds for signing
        let pool_seeds = &[b"pool", owner_key.as_ref(), name_bytes, &[pool_bump]];

        // Set up the ownership mint (controlled by the program through the pool PDA)
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ownership_mint.to_account_info(),
                    to: ctx.accounts.ownership_token_account.to_account_info(),
                    authority: pool_info.clone(),
                },
                &[pool_seeds],
            ),
            1000000, // Initial supply of ownership tokens
        )?;

        // Process each DRT config
        let mut drt_types = Vec::new();

        for config in drt_configs.iter() {
            // Validate DRT config
            require!(!config.drt_type.is_empty(), ErrorCode::InvalidDRTType);
            require!(config.supply > 0, ErrorCode::InvalidSupply);

            // Create DRT config - mint address will be derived from pool and drt_type
            let (drt_mint_address, _) = Pubkey::find_program_address(
                &[
                    b"drt_mint", 
                    pool_key.as_ref(), 
                    config.drt_type.as_bytes()
                ], 
                &ctx.program_id
            );

            let drt_config = DrtConfig {
                drt_type: config.drt_type.clone(),
                mint: drt_mint_address,
                supply: config.supply,
                github_url: config.github_url.clone(),
                code_hash: config.code_hash.clone(),
                is_minted: false, // Initialize as not minted
            };

            // Add DRT config to pool
            pool.drts.push(drt_config);
            drt_types.push(config.drt_type.clone());

            // Log the DRT creation (tokens will be minted in a separate step)
            msg!(
                "Added DRT: {} with supply {} to pool",
                config.drt_type.clone(),
                config.supply.clone()
            );
        }

        // Emit event for pool creation
        emit!(PoolCreated {
            pool: ctx.accounts.pool.key(),
            owner: ctx.accounts.owner.key(),
            ownership_mint: ctx.accounts.ownership_mint.key(),
            name,
            drt_types,
        });

        Ok(())
    }

    /// Initializes a DRT mint as a PDA
    /// This creates the mint account as a PDA owned by the program
    pub fn initialize_drt_mint(ctx: Context<InitializeDrtMint>, drt_type: String) -> Result<()> {
        // The initialization is handled by the accounts context
        // We just need to verify the provided mint address matches the expected DRT
        
        // Find the requested DRT
        let drt_config = ctx
            .accounts
            .pool
            .drts
            .iter()
            .find(|d| d.drt_type == drt_type)
            .ok_or(ErrorCode::DRTNotFound)?;

        // Verify the provided mint address matches the expected PDA
        require!(
            drt_config.mint == ctx.accounts.drt_mint.key(),
            ErrorCode::DRTNotFound
        );

        msg!("Initialized DRT mint for type: {}", drt_type);
        Ok(())
    }

    /// Mint initial supply for a DRT
    ///
    /// This function allows minting the initial supply for a DRT after pool creation.
    /// It can only be called by the pool owner and can only be executed once per DRT.
    pub fn mint_drt_supply(ctx: Context<MintDrtSupply>, drt_type: String) -> Result<()> {
        // Verify caller is the pool owner
        require!(
            ctx.accounts.owner.key() == ctx.accounts.pool.owner,
            ErrorCode::Unauthorized
        );

        // Extract pool data first to avoid borrow conflicts
        let pool_owner = ctx.accounts.pool.owner;
        let pool_name = ctx.accounts.pool.name.clone();
        let pool_bump = ctx.accounts.pool.bump;

        // Find the requested DRT and check if already minted
        let drt_position = {
            let position = ctx
                .accounts
                .pool
                .drts
                .iter()
                .position(|d| d.drt_type == drt_type)
                .ok_or(ErrorCode::DRTNotFound)?;

            // Check if already minted
            if ctx.accounts.pool.drts[position].is_minted {
                return Err(ErrorCode::MintingAlreadyPerformed.into());
            }

            position
        };

        // Get DRT info before mutating
        let drt_supply = ctx.accounts.pool.drts[drt_position].supply;
        let drt_mint = ctx.accounts.pool.drts[drt_position].mint;

        // Ensure the correct mint is provided
        require!(
            drt_mint == ctx.accounts.drt_mint.key(),
            ErrorCode::DRTNotFound
        );

        // Get the PDA seeds for signing
        let owner_ref = pool_owner.as_ref();
        let name_bytes = pool_name.as_bytes();
        let pool_seeds = &[b"pool", owner_ref, name_bytes, &[pool_bump]];

        // Get the pool account info
        let pool_info = ctx.accounts.pool.to_account_info();

        // Mint the initial supply to the vault token account
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.drt_mint.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: pool_info,
                },
                &[pool_seeds],
            ),
            drt_supply,
        )?;

        // Mark the DRT as minted so it can't be minted again
        ctx.accounts.pool.drts[drt_position].is_minted = true;

        msg!("Minted {} tokens for DRT type: {}", drt_supply, drt_type);
        Ok(())
    }

    pub fn buy_drt(ctx: Context<BuyDrt>, drt_type: String, fee: u64) -> Result<()> {
        // Extract pool data first to avoid borrow conflicts
        let pool_owner = ctx.accounts.pool.owner;
        let pool_name = ctx.accounts.pool.name.clone();
        let pool_bump = ctx.accounts.pool.bump;

        // Find the requested DRT
        let drt_config = ctx
            .accounts
            .pool
            .drts
            .iter()
            .find(|d| d.drt_type == drt_type)
            .ok_or(ErrorCode::DRTNotFound)?;

        // Ensure the correct mint is provided
        require!(
            drt_config.mint == ctx.accounts.drt_mint.key(),
            ErrorCode::DRTNotFound
        );

        // Ensure the DRT has been minted
        require!(drt_config.is_minted, ErrorCode::InsufficientTokens);

        // Transfer SOL fee from buyer to fee vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            fee,
        )?;

        // Get the account info and create key bindings
        let pool_info = ctx.accounts.pool.to_account_info();
        let owner_ref = pool_owner.as_ref();
        let name_bytes = pool_name.as_bytes();

        // Get the PDA seeds for signing
        let pool_seeds = &[b"pool", owner_ref, name_bytes, &[pool_bump]];

        // Mint one DRT token to the buyer
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.drt_mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: pool_info,
                },
                &[pool_seeds],
            ),
            1, // Always mint exactly 1 token
        )?;

        msg!("Bought 1 {} DRT token", drt_type);
        Ok(())
    }

    /// Redeem a DRT token to perform an operation
    /// This emits an event that can be monitored by TEEs
    pub fn redeem_drt(ctx: Context<RedeemDrt>, drt_type: String) -> Result<()> {
        // Extract pool data first to avoid borrow conflicts
        let pool_owner = ctx.accounts.pool.owner;
        let pool_name = ctx.accounts.pool.name.clone();
        let pool_bump = ctx.accounts.pool.bump;

        // Find the requested DRT
        let drt_config = ctx
            .accounts
            .pool
            .drts
            .iter()
            .find(|d| d.drt_type == drt_type)
            .ok_or(ErrorCode::DRTNotFound)?;

        // Capture any data we need from the DRT config
        let github_url = drt_config.github_url.clone();
        let code_hash = drt_config.code_hash.clone();

        // Ensure the correct mint is provided
        require!(
            drt_config.mint == ctx.accounts.drt_mint.key(),
            ErrorCode::DRTNotFound
        );

        // Burn the token
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.drt_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1, // Always burn exactly 1 token
        )?;

        // Get execution type for the DRT
        let execution_type = get_execution_type(&drt_type);

        // For append DRTs, mint an ownership token as reward
        if drt_type == "append" {
            // Get the pool account info
            let pool_info = ctx.accounts.pool.to_account_info();

            // Get PDA seeds for signing
            let owner_ref = pool_owner.as_ref();
            let name_bytes = pool_name.as_bytes();
            let pool_seeds = &[b"pool", owner_ref, name_bytes, &[pool_bump]];

            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.ownership_mint.to_account_info(),
                        to: ctx.accounts.user_ownership_account.to_account_info(),
                        authority: pool_info,
                    },
                    &[pool_seeds],
                ),
                1, // Mint 1 ownership token as reward
            )?;

            msg!("Redeemed append DRT, minted 1 ownership token as reward");
        } else {
            msg!("Redeemed {} compute operation", execution_type);
        }

        // Emit the redemption event with all metadata for TEE verification
        emit!(DrtRedeemed {
            pool: ctx.accounts.pool.key(),
            drt_type,
            execution_type,
            redeemer: ctx.accounts.user.key(),
            github_url,
            code_hash,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Redeem ownership tokens for fees
    pub fn redeem_fees(ctx: Context<RedeemFees>, amount: u64, fee_vault_bump: u8) -> Result<()> {
        // Get the total ownership supply
        let total_supply = ctx.accounts.ownership_mint.supply;

        // Get the available fee balance
        let fee_vault_balance = ctx.accounts.fee_vault.lamports();
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(0);

        require!(fee_vault_balance > min_balance, ErrorCode::NoFeesAvailable);

        let available_fees = fee_vault_balance.saturating_sub(min_balance);
        let fee_share = (available_fees as u128)
            .checked_mul(amount as u128)
            .unwrap()
            .checked_div(total_supply as u128)
            .unwrap() as u64;

        require!(fee_share > 0, ErrorCode::NoFeesAvailable);

        // Burn the ownership tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.ownership_mint.to_account_info(),
                    from: ctx.accounts.user_ownership_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Create a binding for the pool key
        let pool_key = ctx.accounts.pool.key();
        
        // Use the fee vault's seeds and bump for signing
        let fee_vault_seeds = &[
            b"fee_vault",
            pool_key.as_ref(),
            &[fee_vault_bump],
        ];

        // Transfer fee share to user
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                &[&fee_vault_seeds[..]], // This is the key change: &[&[...]] instead of &[...]
            ),
            fee_share,
        )?;

        msg!(
            "Redeemed {} ownership tokens for {} lamports",
            amount,
            fee_share
        );
        Ok(())
    }
}

// --------------------------------
// DRT Initialization Configuration
// --------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DrtInitConfig {
    pub drt_type: String,
    pub supply: u64,
    pub github_url: Option<String>,
    pub code_hash: Option<String>,
}

// --------------------------------
// Account Contexts
// --------------------------------

#[derive(Accounts)]
#[instruction(name: String, drt_configs: Vec<DrtInitConfig>)]
pub struct CreatePoolWithDrts<'info> {
    #[account(
        init,
        seeds = [b"pool", owner.key().as_ref(), name.as_bytes()],
        bump,
        payer = owner,
        space = 8 + // discriminator
               1 + // bump
               4 + name.len() + // name as String
               32 + // owner pubkey
               32 + // ownership_mint
               4 + // vector length prefix
               drt_configs.iter().map(|c| {
                   4 + c.drt_type.len() + // drt_type
                   32 + // mint
                   8 + // supply
                   1 + (c.github_url.is_some() as usize) * (4 + c.github_url.as_ref().map_or(0, |s| s.len())) + // Optional github_url
                   1 + (c.code_hash.is_some() as usize) * (4 + c.code_hash.as_ref().map_or(0, |s| s.len())) + // Optional code_hash
                   1 // is_minted
               }).sum::<usize>()
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [b"ownership_mint", pool.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = pool,
    )]
    pub ownership_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = ownership_mint,
        associated_token::authority = owner,
    )]
    pub ownership_token_account: Account<'info, TokenAccount>,

    /// CHECK: This is the fee vault PDA
    #[account(
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(drt_type: String)]
pub struct InitializeDrtMint<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = owner,
        seeds = [b"drt_mint", pool.key().as_ref(), drt_type.as_bytes()],
        bump,
        mint::decimals = 0,
        mint::authority = pool,
    )]
    pub drt_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = owner.key() == pool.owner,
    )]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(drt_type: String)]
pub struct MintDrtSupply<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool.drts.iter().any(|d| d.drt_type == drt_type && d.mint == drt_mint.key())
    )]
    pub drt_mint: Account<'info, Mint>,

    #[account(
        constraint = owner.key() == pool.owner,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == drt_mint.key(),
        constraint = vault_token_account.owner == pool.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(drt_type: String, fee: u64)]
pub struct BuyDrt<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool.drts.iter().any(|d| d.drt_type == drt_type && d.mint == drt_mint.key())
    )]
    pub drt_mint: Account<'info, Mint>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = drt_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    /// CHECK: This is the fee vault PDA
    #[account(
        mut,
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(drt_type: String)]
pub struct RedeemDrt<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool.drts.iter().any(|d| d.drt_type == drt_type && d.mint == drt_mint.key())
    )]
    pub drt_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = ownership_mint.key() == pool.ownership_mint
    )]
    pub ownership_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = drt_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = ownership_mint,
        associated_token::authority = user,
    )]
    pub user_ownership_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(amount: u64, fee_vault_bump: u8)]
pub struct RedeemFees<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = ownership_mint.key() == pool.ownership_mint
    )]
    pub ownership_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = ownership_mint,
        associated_token::authority = user,
    )]
    pub user_ownership_account: Account<'info, TokenAccount>,

    /// CHECK: This is the fee vault PDA
    #[account(
        mut,
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump = fee_vault_bump,
    )]
    pub fee_vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}