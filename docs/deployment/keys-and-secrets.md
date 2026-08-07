# Keys and Secrets

Every key this system needs, where it lives, who reads it, and what happens when it changes.

Read the dependency chain first. The ordering is what people get wrong, and several of these keys cannot be
generated independently — they derive from each other.

## The dependency chain

```
oracle Ed25519 seed (SECRET) ──derive──> oracle public key
        │                                        │
        └─> Container App secret                 └─> measured into the manifest ─┐
                                                                                 ├─> MRENCLAVE
enclave signing key (SECRET) ─────────> MRSIGNER ────────────────────────────────┘   │
                                             │                                        │
                                             └──> measurements.toml <─────────────────┘
                                                          │
                                                          └─> attestation preflight + smoke test
```

The link that surprises people: **the oracle's public key is baked into the enclave's measurement.** That is
deliberate — it is what stops a compromised host pointing the enclave at an oracle it controls. The cost is
that the oracle key and the enclave build are coupled: you cannot build a valid enclave before the oracle
exists, and you cannot rotate the oracle key without rebuilding the enclave.

---

## 1. Oracle Ed25519 signing key

**What it is.** A 32-byte Ed25519 seed. The oracle signs every chain-verification assertion with it; the
enclave verifies those signatures against the matching public key and trusts nothing else.

**Generate:**

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

**Derive the public key** — either from the running service:

```bash
curl -s "$ORACLE_URL/oracle/v1/health" | python3 -c 'import json,sys; print(json.load(sys.stdin)["oracle_pubkey"])'
```

or directly from the seed:

```bash
python3 -c 'import sys; from nacl.signing import SigningKey; print(SigningKey(bytes.fromhex(sys.argv[1])).verify_key.encode().hex())' <seed-hex>
```

The service also logs the derived public key on startup, so it is in the container logs of any successful
deploy.

**Where it lives.** GitHub secret `ORACLE_SIGNING_KEY_HEX` in `devops-acr` → provisioned by CI as the Container
App secret `oracle-signing-key`, referenced as `secretref:` so the seed never lands in the revision spec in
clear text. Locally, `.env`.

**Who reads it.** `devops-acr/oracle/router.py`. The service **refuses to start** without a valid key rather
than degrading to `503 oracle_unavailable` per request, which is a far harder failure to trace.

!!! danger "Rotation destroys sealed state"
    The public key is measured into MRENCLAVE, so rotating this seed changes the enclave measurement. The
    encrypted `/data` mount is keyed by `_sgx_mrenclave`, which means **the sealed pool identity and replay
    ledger become permanently unreadable**. There is no migration path in this prototype: a rotation means
    starting from a fresh pool.

    Rotating requires, in order: new seed → redeploy devops-acr → new `ORACLE_PUBKEY_HEX` → rebuild the
    enclave → new `measurements.toml` → redeploy the enclave → re-initialise the pool.

---

## 2. Enclave signing key (MRSIGNER)

**What it is.** An RSA-3072 private key with public exponent 3 — SGX SIGSTRUCT accepts nothing else. Its
public half determines MRSIGNER.

**Generate:**

```bash
gramine-sgx-gen-private-key ~/.config/gramine/enclave-key.pem
chmod 400 ~/.config/gramine/enclave-key.pem
```

Without Gramine to hand, OpenSSL produces an equivalent key:

```bash
openssl genrsa -3 -out enclave-key.pem 3072
```

**Verify it before storing it** — a wrong key fails deep inside `gramine-sgx-sign` with an opaque error, so CI
checks this explicitly:

```bash
openssl rsa -in enclave-key.pem -noout -text | head -1        # expect: Private-Key: (3072 bit, 2 primes)
openssl rsa -in enclave-key.pem -noout -text | grep publicExponent   # expect: publicExponent: 3 (0x3)
```

**Where it lives.** GitHub secret `ENCLAVE_SIGNING_KEY` (the PEM contents) in `trusted-compute-MVP`. Locally
`~/.config/gramine/enclave-key.pem`, overridable with `SGX_SIGNING_KEY=/path/to/key`.

**Who reads it.** Only the Docker build, via a BuildKit `--secret` mount, so it never enters an image layer.
**The signing key is not needed at runtime** — the enclave is signed at build time and the deployment VM never
sees it. CI shreds its copy on every run.

**Rotation.** Changes MRSIGNER. Every client pinning the old value rejects the new enclave, so the CD pipeline
deliberately refuses to deploy on an unexplained MRSIGNER change.

---

## 3. Oracle trust anchors (build inputs)

`ORACLE_URL` and `ORACLE_PUBKEY_HEX` are measured into MRENCLAVE. They are **not committed**: locally they
live in `sgx-mvp/deploy.local.mk` (gitignored), and in CI they are GitHub secrets.

```makefile
# sgx-mvp/deploy.local.mk
ORACLE_URL ?= https://relational-devops.<hash>.westeurope.azurecontainerapps.io
ORACLE_PUBKEY_HEX ?= <64 lowercase hex>
```

Two consequences worth stating plainly:

- **A measurement cannot be reproduced from the commit alone.** Anyone verifying a build needs these values
  out of band.
- **Keeping them out of the repo gives no confidentiality.** Both are readable from any built image
  (`docker run --rm --entrypoint cat <image> /app/sgx-mvp.manifest`) and the public key is served by the live
  `/oracle/v1/health` endpoint.

The build **fails closed** if `ORACLE_PUBKEY_HEX` is missing or malformed, because an unconfigured enclave
answers every protected request with `503 enclave_unconfigured`.

---

## 4. MRENCLAVE and MRSIGNER

**Not secrets** — they are public measurements clients check before trusting the enclave.

**Obtain:**

```bash
make docker-build && make docker-sigstruct   # prints the [enclave] block
gramine-sgx-sigstruct-view sgx-mvp.sig       # from a native build
```

CI prints them to the job summary on every build.

**Where they live.** `sgx-mvp/measurements.toml`, committed. This is the release contract: CI fails if a build
produces a different `mr_enclave` than the recorded one, so a change to who the enclave trusts cannot land
without appearing in a pull request.

**Who reads them.** The `attest` client (`./attest dcap <mrenclave> <mrsigner> 0 0`), the devops-acr
`/attestation` endpoint, the ntc-web attestation preflight, and `tests/integration/azure-smoke-test.ts`.

To roll a release: `make docker-build && make docker-sigstruct`, paste the `[enclave]` block into
`measurements.toml` **in the same PR** as the source change, then merge.

---

## 5. Solana wallet keypair

**What it is.** The keypair that pays for and signs test transactions. In the browser this is the user's own
wallet; only the integration tests need a local one.

```bash
solana-keygen new -o ~/.config/solana/id.json
solana airdrop 2 --url devnet
```

**Who reads it.** `ANCHOR_WALLET` in `tests/integration/local-validator-test.sh` and `azure-smoke-test.ts`.

---

## 6. Solana program ID

**Not a secret.** `CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE`, already deployed to devnet.

The single source of truth is the committed IDL (`ntc-web/lib/idl/drt_manager.json`, field `address`).
`ntc-web/lib/config.ts` reads it from there, and the oracle and enclave carry matching defaults. There is
deliberately **no environment variable** for it: the wallet-signed claim carries a `program` field that must
match both the transaction Anchor sent and the value measured into MRENCLAVE, and an override let those
silently diverge. To target a different deployment, change the IDL.

---

## 7. Clerk keys

From [dashboard.clerk.com](https://dashboard.clerk.com) → API keys:

| Key | Secret? | Variable |
|---|---|---|
| Publishable key | No (public by design, but account-specific) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Secret key | **Yes** | `CLERK_SECRET_KEY` |

Local: `ntc-web/.env.local`. Deployed: Vercel environment variables.

---

## 8. Database URL

**Secret** — it contains the password.

```bash
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
docker exec -it postgres psql -U postgres -c "CREATE DATABASE ntls_dev;"
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ntls_dev?schema=public"
```

!!! warning "The deploy is destructive by design"
    `vercel-build` runs `prisma db push --accept-data-loss && prisma db seed`, and the seed deletes all pools,
    users and DRT instances. This is intentional for the prototype — every deploy starts from clean state.
    Do not point it at data you care about.

---

## 9. Azure access (GitHub OIDC)

**No long-lived Azure secret is stored.** CI authenticates with federated credentials.

```bash
# 1. App registration
az ad app create --display-name "relational-github-oidc"
APP_ID=$(az ad app list --display-name "relational-github-oidc" --query '[0].appId' -o tsv)
az ad sp create --id "$APP_ID"

# 2. Grant it rights over the resource group
az role assignment create \
  --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/<subscription-id>/resourceGroups/relational-network"

# 3. Trust the GitHub repo/branch
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:Relational-Network/devops-acr:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

Store `AZURE_CLIENT_ID` (the app ID), `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` as repository
**variables** — none are secrets. The workflow needs `permissions: id-token: write`.

---

## 10. SSH keypair for the SGX VM

```bash
ssh-keygen -t ed25519 -f ~/.ssh/sgx-vm -C "sgx-mvp deploy"
```

The **public** half becomes `SSH_PUBLIC_KEY` (injected into provisioned VMs). The **private** half becomes the
`SGX_VM_SSH_KEY` secret used by the enclave CD workflow.

---

## First deploy, in order

The ordering is forced by the dependency chain — steps 4 onward are impossible before step 3.

1. **Generate the oracle seed** (§1) → GitHub secret `ORACLE_SIGNING_KEY_HEX` in `devops-acr`.
2. **Set up Azure OIDC** (§9) → repository variables.
3. **Deploy devops-acr** — push to `main`. The `verify` job warns that `ORACLE_PUBKEY_HEX` is unset; that is
   expected on the first run.
4. **Read the oracle public key** from the health endpoint or the deploy logs. Store it as the
   `ORACLE_PUBKEY_HEX` variable in `devops-acr` (so `verify` starts asserting it) and as a secret in
   `trusted-compute-MVP` (so the enclave build can use it). Add it to `sgx-mvp/deploy.local.mk` for local
   builds.
5. **Generate the enclave signing key** (§2) → GitHub secret `ENCLAVE_SIGNING_KEY`.
6. **Build the enclave** — `make docker-build && make docker-sigstruct`, then record the `[enclave]` block in
   `measurements.toml` and commit it.
7. **Deploy the enclave** — push to `staging`; CD verifies MRENCLAVE matches the build and refuses on an
   MRSIGNER change.
8. **Run the smoke test** — `tests/integration/azure-smoke-test.ts` with `MRENCLAVE`/`MRSIGNER` from
   `measurements.toml`, then re-run with `RESTARTED=1` to confirm sealed state survives a restart.

---

## Inventory

| Secret | Where stored | Who reads it |
|---|---|---|
| `ORACLE_SIGNING_KEY_HEX` | GH secret (devops-acr) → Container App secret | devops-acr oracle router |
| `ENCLAVE_SIGNING_KEY` | GH secret (trusted-compute-MVP) | Docker build only; never at runtime |
| `CLERK_SECRET_KEY` | Vercel env | ntc-web server routes |
| `DATABASE_URL` | Vercel env | Prisma |
| `SGX_VM_SSH_KEY` | GH secret | Enclave CD |
| `SSH_PUBLIC_KEY` | GH secret | Injected into provisioned VMs (public half) |

| Non-secret | Where stored | Notes |
|---|---|---|
| `ORACLE_URL`, `ORACLE_PUBKEY_HEX` | `deploy.local.mk` / GH secrets | Uncommitted by choice; measured into MRENCLAVE |
| `MRENCLAVE`, `MRSIGNER` | `measurements.toml` | Committed; the release contract |
| Program ID | Committed IDL | Single source of truth |
| Cluster, RPC URL, TTLs | Code defaults | Public protocol constants |
| `AZURE_*`, `SGX_IMAGE` | GH variables | Deployment identity |
