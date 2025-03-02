#![allow(unexpected_cfgs)]
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
use anchor_lang::solana_program;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::spl_token,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};
use mpl_token_metadata::ID as METADATA_PROGRAM_ID;

declare_id!("57Xvfo4c22qpDHXoginPd42DKnqqNWVp14QwHNTRZfoD");

/// The vault account holds tokens and is a PDA.
#[account]
pub struct Vault {
    pub bump: u8,
    pub ownership_token_balance: u64,
    pub append_token_balance: Option<u64>,
}

#[event]
pub struct DrtRedeemed {
    pub pool: Pubkey,
    pub drt_type: String,
    pub redeemer: Pubkey,
    pub new_supply: u64,
    pub timestamp: i64,
}

/// The Pool stores configuration and the mints/supplies for several DRT types.
#[account]
pub struct Pool {
    pub bump: u8,
    pub pool_id: u64,
    pub name: String,
    pub owner: Pubkey,
    pub ownership_mint: Pubkey,
    pub append_mint: Option<Pubkey>,
    pub ownership_supply: u64,
    pub append_supply: Option<u64>,
    pub w_compute_median_mint: Option<Pubkey>,
    pub py_compute_median_mint: Option<Pubkey>,
    pub w_compute_supply: Option<u64>,
    pub py_compute_supply: Option<u64>,
    pub allowed_drts: Vec<String>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Overflow occurred")]
    Overflow,
    #[msg("DRT not initialized")]
    DRTNotInitialized,
    #[msg("DRT not allowed")]
    DRTNotAllowed,
    #[msg("Invalid DRT type")]
    InvalidDRTType,
    #[msg("Invalid pool name")]
    InvalidPoolName,
    #[msg("Invalid pool ID")]
    InvalidPoolId,
    #[msg("Invalid token supply")]
    InvalidSupply,
    #[msg("Invalid fee amount")]
    InvalidFee,
    #[msg("Unauthorized operation")]
    Unauthorized,
    #[msg("Not the token owner")]
    NotTokenOwner,
    #[msg("Insufficient tokens for redemption")]
    InsufficientTokens,
    #[msg("No fees available for redemption")]
    NoFeesAvailable,
    #[msg("Invalid redemption amount")]
    InvalidRedemptionAmount,
}

/// Helper: Mint tokens from a mint to a destination using the vault’s PDA.
pub fn mint_to_vault<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    destination: &Account<'info, TokenAccount>,
    vault: &AccountInfo<'info>,
    seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    token::mint_to(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            MintTo {
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: vault.clone(),
            },
            &[seeds],
        ),
        amount,
    )
}

#[program]
pub mod drt_manager {
    use super::*;

    /// Initializes the pool.
    #[access_control(InitializePool::validate(&ctx, &pool_name, pool_id))]
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_name: String,
        pool_id: u64,
        ownership_supply: u64,
        append_supply: u64,
        allowed_drts: Vec<String>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.name = pool_name.clone();
        pool.pool_id = pool_id;
        pool.owner = ctx.accounts.owner.key();
        pool.ownership_mint = ctx.accounts.ownership_mint.key();
        pool.append_mint = None;
        pool.ownership_supply = ownership_supply;
        pool.append_supply = Some(append_supply);
        pool.w_compute_median_mint = None;
        pool.py_compute_median_mint = None;
        pool.w_compute_supply = None;
        pool.py_compute_supply = None;
        pool.allowed_drts = allowed_drts;
        msg!(
            "Pool initialized with name: {} and owner: {}",
            pool_name,
            pool.owner
        );

        let vault_bump = ctx.bumps.vault;
        let vault = &mut ctx.accounts.vault;
        vault.bump = vault_bump;
        vault.ownership_token_balance = ownership_supply;
        vault.append_token_balance = None;

        let pool_key = ctx.accounts.pool.key();
        msg!("Pool PDA: {}", pool_key);
        let seeds = &[b"vault", pool_key.as_ref(), &[vault_bump]];
        mint_to_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.ownership_mint,
            &ctx.accounts.vault_token_account,
            &ctx.accounts.vault.to_account_info(),
            seeds,
            ownership_supply,
        )?;
        Ok(())
    }

    /// Initializes the fee vault.
    pub fn initialize_fee_vault(_ctx: Context<InitializeFeeVault>) -> Result<()> {
        msg!("Fee vault initialized.");
        Ok(())
    }

    /// Initializes a DRT.
    #[access_control(InitializeDrt::validate(&ctx, &drt_type, drt_supply))]
    pub fn initialize_drt(
        ctx: Context<InitializeDrt>,
        drt_type: String,
        drt_supply: u64,
    ) -> Result<()> {
        let vault_bump = ctx.bumps.vault;
        let pool_key = ctx.accounts.pool.key();
        let seeds = &[b"vault", pool_key.as_ref(), &[vault_bump]];

        let pool = &mut ctx.accounts.pool;
        if ctx.accounts.owner.key() == pool.owner {
            if !pool.allowed_drts.iter().any(|d| d == &drt_type) {
                msg!("Pool owner adding new DRT type: {}", drt_type);
                pool.allowed_drts.push(drt_type.clone());
            }
        } else {
            if !pool.allowed_drts.iter().any(|d| d == &drt_type) {
                return Err(ErrorCode::DRTNotAllowed.into());
            }
        }

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.drt_mint.to_account_info(),
                    to: ctx.accounts.vault_drt_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            drt_supply,
        )?;

        match drt_type.as_str() {
            "append" => {
                pool.append_mint = Some(ctx.accounts.drt_mint.key());
                pool.append_supply = Some(drt_supply);
            }
            "w_compute_median" => {
                pool.w_compute_median_mint = Some(ctx.accounts.drt_mint.key());
                pool.w_compute_supply = Some(drt_supply);
            }
            "py_compute_median" => {
                pool.py_compute_median_mint = Some(ctx.accounts.drt_mint.key());
                pool.py_compute_supply = Some(drt_supply);
            }
            _ => return Err(ErrorCode::InvalidDRTType.into()),
        }
        msg!(
            "Initialized DRT type: {} with supply: {}",
            drt_type,
            drt_supply
        );
        Ok(())
    }

    /// Generic “buy” instruction for any DRT.
    #[access_control(BuyDrt::validate(&ctx, &drt_type, fee))]
    pub fn buy_drt(ctx: Context<BuyDrt>, drt_type: String, fee: u64) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let vault_drt_mint = ctx.accounts.drt_mint.key();
        if drt_type == "append" {
            if pool.append_mint.is_none() || pool.append_mint.unwrap() != vault_drt_mint {
                return Err(ErrorCode::DRTNotInitialized.into());
            }
        } else if drt_type == "w_compute_median" {
            if pool.w_compute_median_mint.is_none()
                || pool.w_compute_median_mint.unwrap() != vault_drt_mint
            {
                return Err(ErrorCode::DRTNotInitialized.into());
            }
        } else if drt_type == "py_compute_median" {
            if pool.py_compute_median_mint.is_none()
                || pool.py_compute_median_mint.unwrap() != vault_drt_mint
            {
                return Err(ErrorCode::DRTNotInitialized.into());
            }
        } else {
            return Err(ErrorCode::InvalidDRTType.into());
        }

        let vault_bump = ctx.bumps.vault;
        let pool_key = ctx.accounts.pool.key();
        let seeds = &[b"vault", pool_key.as_ref(), &[vault_bump]];

        // Transfer fee lamports from the buyer’s wallet to the fee vault.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer_wallet.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            fee,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_drt_token_account.to_account_info(),
                    to: ctx.accounts.user_drt_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            1,
        )?;
        Ok(())
    }

    /// Generic “redeem” instruction for any DRT.
    #[access_control(RedeemDrt::validate(&ctx, &drt_type))]
    pub fn redeem_drt(ctx: Context<RedeemDrt>, drt_type: String) -> Result<()> {
        let mint_before = ctx.accounts.drt_mint.supply;
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.drt_mint.to_account_info(),
                    from: ctx.accounts.user_drt_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;
        let mint_after = ctx.accounts.drt_mint.supply;
        msg!(
            "{} DRT burned - Supply changed from {} to {}",
            drt_type,
            mint_before,
            mint_after
        );
        emit!(DrtRedeemed {
            pool: ctx.accounts.pool.key(),
            drt_type: drt_type.clone(),
            redeemer: ctx.accounts.user.key(),
            new_supply: mint_after,
            timestamp: Clock::get()?.unix_timestamp,
        });
        if drt_type == "append" {
            let vault_bump = ctx.bumps.vault;
            let pool_key = ctx.accounts.pool.key();
            let seeds = &[b"vault", pool_key.as_ref(), &[vault_bump]];
            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.ownership_mint.to_account_info(),
                        to: ctx.accounts.user_ownership_token_account.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    &[seeds],
                ),
                1,
            )?;
            msg!("Append DRT redeemed and 1 ownership token minted as reward");
        } else {
            msg!("DRT redeemed successfully");
        }
        Ok(())
    }

    /// Allows users to redeem ownership tokens for accumulated fees.
    #[access_control(RedeemOwnershipTokens::validate(&ctx, amount))]
    pub fn redeem_ownership_tokens(ctx: Context<RedeemOwnershipTokens>, amount: u64) -> Result<()> {
        let total_supply = ctx.accounts.ownership_mint.supply;
        let fee_vault_info = ctx.accounts.fee_vault.to_account_info();
        let fee_vault_balance = fee_vault_info.lamports();
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(fee_vault_info.data_len());
        let available_fees = fee_vault_balance
            .checked_sub(min_balance)
            .ok_or(ErrorCode::NoFeesAvailable)?;
        let fee_share = (available_fees as u128)
            .checked_mul(amount as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(total_supply as u128)
            .ok_or(ErrorCode::Overflow)?;
        require!(fee_share > 0, ErrorCode::NoFeesAvailable);
        let fee_lamports = fee_share as u64;
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.ownership_mint.to_account_info(),
                    from: ctx.accounts.user_ownership_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
        **ctx
            .accounts
            .fee_vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= fee_lamports;
        **ctx
            .accounts
            .user_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += fee_lamports;
        msg!(
            "Redeemed {} ownership tokens for {} lamports in fees",
            amount,
            fee_lamports
        );
        Ok(())
    }

    /// Sets token metadata using the Metaplex Metadata program.
    #[access_control(SetTokenMetadata::validate(&ctx))]
    pub fn set_token_metadata(
        ctx: Context<SetTokenMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        if !ctx
            .accounts
            .token_metadata_program
            .to_account_info()
            .executable
        {
            msg!("Token metadata program not executable; skipping CPI.");
            return Ok(());
        }
        let creator = mpl_token_metadata::types::Creator {
            address: ctx.accounts.vault.key(),
            verified: false,
            share: 100,
        };
        let creators = Some(vec![creator]);
        let data = mpl_token_metadata::types::DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators,
            collection: None,
            uses: None,
        };
        let args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
            data,
            is_mutable: false,
            collection_details: None,
        };
        let vault_bump = ctx.bumps.vault;
        let ix = mpl_token_metadata::instructions::CreateMetadataAccountV3 {
            metadata: ctx.accounts.metadata.key(),
            mint: ctx.accounts.mint.key(),
            mint_authority: ctx.accounts.vault.key(),
            payer: ctx.accounts.owner.key(),
            update_authority: (ctx.accounts.vault.key(), true),
            system_program: ctx.accounts.system_program.key(),
            rent: Some(ctx.accounts.rent.key()),
        }.instruction(args);

        let ix_converted = solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: ix.accounts,
            data: ix.data,
        };

        let pool_key = ctx.accounts.pool.key();
        let seeds = &[b"vault", pool_key.as_ref(), &[vault_bump]];
        solana_program::program::invoke_signed(
            &ix_converted,
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[seeds],
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(pool_name: String, pool_id: u64, ownership_supply: u64, append_supply: u64, allowed_drts: Vec<String>)]
pub struct InitializePool<'info> {
    #[account(
        init,
        seeds = [b"pool", owner.key().as_ref(), pool_name.as_bytes(), &pool_id.to_le_bytes()],
        bump,
        payer = owner,
        space = 8 + 500
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub ownership_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = owner,
        space = 8 + 8 + 8,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = ownership_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeFeeVault<'info> {
    /// CHECK: This account is initialized as a PDA.
    #[account(
        init,
        payer = owner,
        space = 8,
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeDrt<'info> {
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub drt_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = drt_mint,
        associated_token::authority = vault,
    )]
    pub vault_drt_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct BuyDrt<'info> {
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub drt_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = drt_mint,
        associated_token::authority = vault,
    )]
    pub vault_drt_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_drt_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
    /// CHECK: This is the fee vault PDA.
    #[account(
        mut,
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,
    #[account(mut)]
    pub buyer_wallet: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RedeemDrt<'info> {
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub drt_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub ownership_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_drt_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_ownership_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetTokenMetadata<'info> {
    /// CHECK: Metadata account.
    #[account(mut)]
    pub metadata: AccountInfo<'info>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This is the Metaplex Token Metadata Program
    #[account(address = METADATA_PROGRAM_ID)]
    pub token_metadata_program: AccountInfo<'info>,
    #[account(address = anchor_lang::system_program::ID)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RedeemOwnershipTokens<'info> {
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub ownership_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_ownership_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is the user's wallet that will receive redeemed fees.
    #[account(mut)]
    pub user_wallet: AccountInfo<'info>,
    /// CHECK: This is the fee vault PDA.
    #[account(
        mut,
        seeds = [b"fee_vault", pool.key().as_ref()],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializePool<'info> {
    pub fn validate(_ctx: &Context<InitializePool>, pool_name: &str, pool_id: u64) -> Result<()> {
        require!(!pool_name.is_empty(), ErrorCode::InvalidPoolName);
        require!(pool_id > 0, ErrorCode::InvalidPoolId);
        Ok(())
    }
}

impl<'info> InitializeDrt<'info> {
    pub fn validate(ctx: &Context<InitializeDrt>, drt_type: &str, drt_supply: u64) -> Result<()> {
        require!(
            ctx.accounts.owner.key() == ctx.accounts.pool.owner,
            ErrorCode::Unauthorized
        );
        require!(
            matches!(
                drt_type,
                "append" | "w_compute_median" | "py_compute_median"
            ),
            ErrorCode::InvalidDRTType
        );
        require!(drt_supply > 0, ErrorCode::InvalidSupply);
        Ok(())
    }
}

impl<'info> BuyDrt<'info> {
    pub fn validate(ctx: &Context<BuyDrt>, drt_type: &str, fee: u64) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let vault_drt_mint = ctx.accounts.drt_mint.key();
        match drt_type {
            "append" => {
                require!(
                    pool.append_mint.is_some() && pool.append_mint.unwrap() == vault_drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            "w_compute_median" => {
                require!(
                    pool.w_compute_median_mint.is_some()
                        && pool.w_compute_median_mint.unwrap() == vault_drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            "py_compute_median" => {
                require!(
                    pool.py_compute_median_mint.is_some()
                        && pool.py_compute_median_mint.unwrap() == vault_drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            _ => return Err(ErrorCode::InvalidDRTType.into()),
        }
        require!(fee > 0, ErrorCode::InvalidFee);
        Ok(())
    }
}

impl<'info> RedeemDrt<'info> {
    pub fn validate(ctx: &Context<RedeemDrt>, drt_type: &str) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let drt_mint = ctx.accounts.drt_mint.key();
        match drt_type {
            "append" => {
                require!(
                    pool.append_mint.is_some() && pool.append_mint.unwrap() == drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            "w_compute_median" => {
                require!(
                    pool.w_compute_median_mint.is_some()
                        && pool.w_compute_median_mint.unwrap() == drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            "py_compute_median" => {
                require!(
                    pool.py_compute_median_mint.is_some()
                        && pool.py_compute_median_mint.unwrap() == drt_mint,
                    ErrorCode::DRTNotInitialized
                );
            }
            _ => return Err(ErrorCode::InvalidDRTType.into()),
        }
        let token_account = spl_token::state::Account::unpack(
            &ctx.accounts
                .user_drt_token_account
                .to_account_info()
                .data
                .borrow(),
        ).map_err(|_| ErrorCode::InsufficientTokens)?;
        require!(
            ctx.accounts.user.key() == token_account.owner,
            ErrorCode::NotTokenOwner
        );
        require!(token_account.amount >= 1, ErrorCode::InsufficientTokens);
        Ok(())
    }
}

impl<'info> SetTokenMetadata<'info> {
    pub fn validate(ctx: &Context<SetTokenMetadata>) -> Result<()> {
        require!(
            ctx.accounts.owner.key() == ctx.accounts.pool.owner,
            ErrorCode::Unauthorized
        );
        Ok(())
    }
}

impl<'info> RedeemOwnershipTokens<'info> {
    pub fn validate(ctx: &Context<RedeemOwnershipTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidRedemptionAmount);
        let token_account = spl_token::state::Account::unpack(
            &ctx.accounts
                .user_ownership_token_account
                .to_account_info()
                .data
                .borrow(),
        ).map_err(|_| ErrorCode::InsufficientTokens)?;
        require!(
            ctx.accounts.user.key() == token_account.owner,
            ErrorCode::NotTokenOwner
        );
        require!(
            token_account.amount >= amount,
            ErrorCode::InsufficientTokens
        );
        Ok(())
    }
}
