<!--
Nautilus Trusted Compute
Copyright (C) 2025 Nautilus

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

# Nautilus drt-manager MVP

**drt-manager** is a Solana smart contract (program) built with Anchor. It manages a “pool” that mints and handles tokens (such as ownership tokens and append tokens) for Digital Rights Tokens (DRTs). It also supports setting token metadata via the Metaplex Token Metadata program.

## Features

- **Initialize Pool:** Create a pool with a given name and supply of ownership and append tokens.
- **Buy AppendDRT:** Users can buy an “append” token (DRT) by paying a fee, which is added to the pool’s fee accumulator.
- **Redeem AppendDRT:** Users can redeem an append token for a proportional reward in ownership tokens.
- **Set Token Metadata:** Sets human‑readable metadata on a given token mint using the Metaplex Token Metadata program.
- **(Optional) Extra DRTs:** Ability to initialize an extra DRT (e.g. ComputeMedianDRT).

## Prerequisites

- **Solana CLI:** [Install instructions](https://docs.solana.com/cli/install-solana-cli-tools)
- **Anchor CLI:** [Install instructions](https://project-serum.github.io/anchor/getting-started/installation.html)
- **Node.js and Yarn:** For running tests.
- A funded wallet (e.g. located at `~/.config/solana/id.json` or a separate test wallet)

## Wallet Configuration

In your `Anchor.toml`, it is recommended to specify your wallet path. For example:
```toml
[provider]
cluster = "Devnet"
wallet = "./test-wallet.json"
```

If you prefer to use your default Solana CLI wallet (typically at `~/.config/solana/id.json`), update the wallet path accordingly and export the environment variable:

```
export ANCHOR_WALLET=~/.config/solana/id.json
```

## Local Testing vs. Devnet Testing

### Local Testing

1. Run a Local Validator: Open a new terminal and run:

    ```bash
    solana-test-validator --reset
    ``` 
    This command resets any existing local ledger data.

2. Run Tests on the Local Validator: In your project directory, run:

    ```bash
    anchor test --skip-local-validator
    ```
    (The ``--skip-local-validator flag`` tells Anchor to connect to your already running local validator.)

### Devnet Testing

1. Set Provider to Devnet: In your Anchor.toml, set the provider cluster to ``Devnet`` or export:

    ```bash
    export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
    ```

2. Fund Your Wallet: Ensure your wallet (e.g. ``./test-wallet.json``) is funded on Devnet:

    ```bash
    solana airdrop 5 <YOUR_WALLET_ADDRESS> --url https://api.devnet.solana.com
    ```
    Replace ``<YOUR_WALLET_ADDRESS>`` with your wallet’s public key.

3. Deploy the Program on Devnet: Run:

    ```bash
    anchor deploy --provider.cluster Devnet
    ```
    The official Metaplex Token Metadata program is deployed on devnet at the address:

    ```nginx
    metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
    ```
    so your ``set_token_metadata`` instruction will invoke the real metadata CPI on devnet.

4. Run Tests on Devnet: Run:

    ```bash
    anchor test --provider.cluster Devnet
    ```

## Viewing Tokens on Solana Explorer

The test logs print out key addresses:

- **Program ID**
- **Pool Account**
- **Ownership Mint**
- **Append Mint**
- **Metadata PDA for Ownership Mint**

Copy these addresses into [Solana Explorer](https://explorer.solana.com/?cluster=devnet) (or select the appropriate cluster) to view token details.
For example, if you visit the Append Mint address on devnet, you may see details like:

- **Current Supply**: 99 (if one token was transferred)
- **Mint Authority**: your pool owner’s public key
- **Decimals**: 0

## Clearing Local Data
If you are testing locally and wish to wipe the existing blockchain data (for example, to start fresh), stop the local validator and restart it with:

```bash
solana-test-validator --reset
```

## Additional Notes

- **Metadata CPI Bypass (Local Testing)**:
When testing locally, the ``set_token_metadata`` instruction checks whether the provided Token Metadata program account is executable. If it isn’t (i.e. when running on a local validator), the CPI is bypassed (stubbed out). When you switch to devnet (or mainnet) with the real metadata program deployed, the CPI will run normally.

- **Rate Limits on Airdrops (Devnet)**:
Avoid performing multiple airdrops in your tests on devnet to prevent hitting the rate limit. Instead, fund your wallet once manually.

## Running the Tests

### Local Validator Test:

1. Open a terminal and start the validator:
    ```bash
    solana-test-validator --reset
    ```

2. In another terminal, run:
    ```bash
    anchor test --skip-local-validator
    ```

### Devnet Test:

1. Ensure your `Anchor.toml` is configured for devnet and your wallet is funded.

2. Deploy the program:
    ```bash
    anchor deploy --provider.cluster Devnet
    ```

3. Run:
    ```bash
    anchor test --provider.cluster Devnet
    ```