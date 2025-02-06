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

#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, MintTo, Burn, Transfer, Token},
};

declare_id!("CiHJcJofM1k3iEKh7sHtzWY71HJhzP2rqw6Z6i9h9dwP");

/// A wrapper type for allowed DRT strings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DrtType {
    pub value: String,
}

#[program]
pub mod drt_manager {
    use super::*;

    /// Initialize a new pool.
    ///
    /// The client is responsible for creating the mints and associated token accounts.
    /// This instruction stores the pool state—including an allowed list of DRT types—and mints
    /// the full supply of “ownership” tokens to the owner’s token account and the full supply
    /// of “append” tokens to the pool’s append token account.
    ///
    /// Allowed DRT types include: "append", "w_compute", "py_compute", "add_data".
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_name: String,
        ownership_supply: u64,
        append_supply: u64,
        allowed_drts: Vec<String>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.name = pool_name;
        pool.owner = ctx.accounts.owner.key();
        pool.fee_accumulator = 0;
        pool.ownership_mint = ctx.accounts.ownership_mint.key();
        pool.append_mint = ctx.accounts.append_mint.key();
        pool.ownership_supply = ownership_supply;
        pool.append_supply = append_supply;
        pool.w_compute_median_mint = None;
        pool.py_compute_median_mint = None;
        pool.add_data_mint = None;
        // Convert Vec<String> into Vec<DrtType> for proper serialization.
        pool.allowed_drts = allowed_drts.into_iter().map(|s| DrtType { value: s }).collect();

        // Mint the full supply of ownership tokens into the owner’s token account.
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ownership_mint.to_account_info(),
                    to: ctx.accounts.owner_ownership_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            ownership_supply,
        )?;

        // Mint the full supply of append tokens into the pool’s append token account.
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.append_mint.to_account_info(),
                    to: ctx.accounts.pool_append_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            append_supply,
        )?;
        Ok(())
    }

    /// Buy an AppendDRT.
    pub fn buy_append_drt(ctx: Context<BuyAppendDRT>, fee: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.fee_accumulator = pool.fee_accumulator
            .checked_add(fee)
            .ok_or(ErrorCode::Overflow)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_append_token_account.to_account_info(),
                    to: ctx.accounts.user_append_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            1,
        )?;
        Ok(())
    }

    /// Redeem an AppendDRT.
    pub fn redeem_append_drt(ctx: Context<RedeemAppendDRT>) -> Result<()> {
        // Burn one append token.
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.append_mint.to_account_info(),
                    from: ctx.accounts.user_append_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;
        let pool = &ctx.accounts.pool;
        let reward = pool.ownership_supply / pool.append_supply;
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ownership_mint.to_account_info(),
                    to: ctx.accounts.user_ownership_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            reward,
        )?;
        Ok(())
    }

    /// Redeem a generic DRT.
    pub fn redeem_drt(ctx: Context<RedeemDRT>) -> Result<()> {
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
        msg!("DRT redeemed by: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Initialize the new wComputeMedianDRT.
    pub fn initialize_w_compute_median_drt(
        ctx: Context<InitializeWComputeMedianDRT>,
        drt_supply: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.w_compute_median_mint = Some(ctx.accounts.w_compute_median_mint.key());
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.w_compute_median_mint.to_account_info(),
                    to: ctx.accounts.pool_w_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            drt_supply,
        )?;
        Ok(())
    }

    /// Initialize the new pyComputeMedianDRT.
    pub fn initialize_py_compute_median_drt(
        ctx: Context<InitializePyComputeMedianDRT>,
        drt_supply: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.py_compute_median_mint = Some(ctx.accounts.py_compute_median_mint.key());
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.py_compute_median_mint.to_account_info(),
                    to: ctx.accounts.pool_py_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            drt_supply,
        )?;
        Ok(())
    }

    /// Initialize the new addDataDRT.
    pub fn initialize_add_data_drt(
        ctx: Context<InitializeAddDataDRT>,
        drt_supply: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.add_data_mint = Some(ctx.accounts.add_data_mint.key());
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.add_data_mint.to_account_info(),
                    to: ctx.accounts.pool_add_data_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            drt_supply,
        )?;
        Ok(())
    }

    /// Buy a wComputeMedianDRT.
    pub fn buy_w_compute_median_drt(ctx: Context<BuyWComputeMedianDRT>, fee: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.fee_accumulator = pool.fee_accumulator
            .checked_add(fee)
            .ok_or(ErrorCode::Overflow)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_w_compute_median_token_account.to_account_info(),
                    to: ctx.accounts.user_w_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            1,
        )?;
        Ok(())
    }

    /// Buy a pyComputeMedianDRT.
    pub fn buy_py_compute_median_drt(ctx: Context<BuyPyComputeMedianDRT>, fee: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.fee_accumulator = pool.fee_accumulator
            .checked_add(fee)
            .ok_or(ErrorCode::Overflow)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_py_compute_median_token_account.to_account_info(),
                    to: ctx.accounts.user_py_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            1,
        )?;
        Ok(())
    }

    /// Buy an addDataDRT.
    pub fn buy_add_data_drt(ctx: Context<BuyAddDataDRT>, fee: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.fee_accumulator = pool.fee_accumulator
            .checked_add(fee)
            .ok_or(ErrorCode::Overflow)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_add_data_token_account.to_account_info(),
                    to: ctx.accounts.user_add_data_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            1,
        )?;
        Ok(())
    }

    /// Redeem a wComputeMedianDRT.
    pub fn redeem_w_compute_median_drt(
        ctx: Context<RedeemWComputeMedianDRT>,
    ) -> Result<()> {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.w_compute_median_mint.to_account_info(),
                    from: ctx.accounts.user_w_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;
        msg!("wComputeMedian DRT redeemed by: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Redeem a pyComputeMedianDRT.
    pub fn redeem_py_compute_median_drt(
        ctx: Context<RedeemPyComputeMedianDRT>,
    ) -> Result<()> {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.py_compute_median_mint.to_account_info(),
                    from: ctx.accounts.user_py_compute_median_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;
        msg!("pyComputeMedian DRT redeemed by: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Redeem an addDataDRT.
    pub fn redeem_add_data_drt(ctx: Context<RedeemAddDataDRT>) -> Result<()> {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.add_data_mint.to_account_info(),
                    from: ctx.accounts.user_add_data_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;
        msg!("addData DRT redeemed by: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Set token metadata (name, symbol, uri) for a given mint.
    pub fn set_token_metadata(
        ctx: Context<SetTokenMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        if !ctx.accounts.token_metadata_program.to_account_info().executable {
            msg!("Token metadata program is not executable; skipping metadata CPI (stub mode).");
            return Ok(());
        }
    
        let creator = mpl_token_metadata::types::Creator {
            address: ctx.accounts.mint_authority.key(),
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
    
        let ix = mpl_token_metadata::instructions::CreateMetadataAccountV3 {
            metadata: ctx.accounts.metadata.key(),
            mint: ctx.accounts.mint.key(),
            mint_authority: ctx.accounts.mint_authority.key(),
            payer: ctx.accounts.mint_authority.key(),
            update_authority: (ctx.accounts.mint_authority.key(), true),
            system_program: ctx.accounts.system_program.key(),
            rent: Some(ctx.accounts.rent.key()),
        }
        .instruction(args);
    
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;
    
        Ok(())
    }
}

//
// ─── CONTEXTS ──────────────────────────────────────────────────────────────
//

#[derive(Accounts)]
pub struct InitializePool<'info> {
    // Increase space to 420 bytes to ensure allowed_drts is stored.
    #[account(init, payer = owner, space = 420)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Ownership token mint.
    #[account(mut)]
    pub ownership_mint: UncheckedAccount<'info>,
    /// CHECK: Append token mint.
    #[account(mut)]
    pub append_mint: UncheckedAccount<'info>,
    /// CHECK: Pool’s append token account.
    #[account(mut)]
    pub pool_append_token_account: UncheckedAccount<'info>,
    /// CHECK: Owner’s ownership token account.
    #[account(mut)]
    pub owner_ownership_token_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyAppendDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: Pool’s append token account.
    #[account(mut)]
    pub pool_append_token_account: UncheckedAccount<'info>,
    /// CHECK: Buyer’s append token account.
    #[account(mut)]
    pub user_append_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemAppendDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: Append token mint.
    #[account(mut)]
    pub append_mint: UncheckedAccount<'info>,
    /// CHECK: Ownership token mint.
    #[account(mut)]
    pub ownership_mint: UncheckedAccount<'info>,
    /// CHECK: User’s append token account.
    #[account(mut)]
    pub user_append_token_account: UncheckedAccount<'info>,
    /// CHECK: User’s ownership token account.
    #[account(mut)]
    pub user_ownership_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// User must sign.
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemDRT<'info> {
    /// CHECK: DRT mint.
    #[account(mut)]
    pub drt_mint: UncheckedAccount<'info>,
    /// CHECK: User’s DRT token account.
    #[account(mut)]
    pub user_drt_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeWComputeMedianDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: wComputeMedian token mint.
    #[account(mut)]
    pub w_compute_median_mint: UncheckedAccount<'info>,
    /// CHECK: Pool’s wComputeMedian token account.
    #[account(mut)]
    pub pool_w_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializePyComputeMedianDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: pyComputeMedian token mint.
    #[account(mut)]
    pub py_compute_median_mint: UncheckedAccount<'info>,
    /// CHECK: Pool’s pyComputeMedian token account.
    #[account(mut)]
    pub pool_py_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeAddDataDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: addData token mint.
    #[account(mut)]
    pub add_data_mint: UncheckedAccount<'info>,
    /// CHECK: Pool’s addData token account.
    #[account(mut)]
    pub pool_add_data_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyWComputeMedianDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: Pool’s wComputeMedian token account.
    #[account(mut)]
    pub pool_w_compute_median_token_account: UncheckedAccount<'info>,
    /// CHECK: Buyer’s wComputeMedian token account.
    #[account(mut)]
    pub user_w_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyPyComputeMedianDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: Pool’s pyComputeMedian token account.
    #[account(mut)]
    pub pool_py_compute_median_token_account: UncheckedAccount<'info>,
    /// CHECK: Buyer’s pyComputeMedian token account.
    #[account(mut)]
    pub user_py_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyAddDataDRT<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: Pool’s addData token account.
    #[account(mut)]
    pub pool_add_data_token_account: UncheckedAccount<'info>,
    /// CHECK: Buyer’s addData token account.
    #[account(mut)]
    pub user_add_data_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemWComputeMedianDRT<'info> {
    /// CHECK: wComputeMedian token mint.
    #[account(mut)]
    pub w_compute_median_mint: UncheckedAccount<'info>,
    /// CHECK: User’s wComputeMedian token account.
    #[account(mut)]
    pub user_w_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemPyComputeMedianDRT<'info> {
    /// CHECK: pyComputeMedian token mint.
    #[account(mut)]
    pub py_compute_median_mint: UncheckedAccount<'info>,
    /// CHECK: User’s pyComputeMedian token account.
    #[account(mut)]
    pub user_py_compute_median_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemAddDataDRT<'info> {
    /// CHECK: addData token mint.
    #[account(mut)]
    pub add_data_mint: UncheckedAccount<'info>,
    /// CHECK: User’s addData token account.
    #[account(mut)]
    pub user_add_data_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetTokenMetadata<'info> {
    /// CHECK: Metadata account (PDA derived from mint)
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: Mint for which metadata is being set.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub mint_authority: Signer<'info>,
    /// CHECK: The Token Metadata program.
    pub token_metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

//
// ─── POOL STATE ──────────────────────────────────────────────────────────────
//

#[account]
pub struct Pool {
    /// The pool name (e.g. "developer_salary"). The token mints will use a prefix of this name.
    pub name: String,
    pub owner: Pubkey,
    pub fee_accumulator: u64,
    pub ownership_mint: Pubkey,
    pub append_mint: Pubkey,
    pub ownership_supply: u64,
    pub append_supply: u64,
    pub w_compute_median_mint: Option<Pubkey>,
    pub py_compute_median_mint: Option<Pubkey>,
    pub add_data_mint: Option<Pubkey>,
    pub allowed_drts: Vec<DrtType>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Overflow occurred")]
    Overflow,
}
