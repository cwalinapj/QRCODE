# QRCODE (qr-forever)

Production-ready MVP monorepo for minting QR records on Polygon using **USDC only**.

## Features

- ERC-721 ownership model (`QRRegistry`) on Polygon
- Two QR modes:
  - **Immutable Forever** (`url`, `address`, `ipfs`, or `arweave`)
  - **Owner-Updateable** (same token ID forever; target update by owner only)
- Optional timelock for updateable records
- On-chain auditable updates (events)
- Web app mint flow (MetaMask + WalletConnect)
- QR download as SVG + PNG
- Cloudflare Worker resolver (`/r/<tokenId>`) with on-chain verification and optional auto-redirect
- Paid resolver API (`/api/resolve/<tokenId>`) with API keys and credit metering

## Repository layout

- `contracts/` Hardhat contracts, tests, deployment scripts
- `apps/web/` Next.js + TypeScript + Tailwind mint UI
- `apps/resolver-worker/` Cloudflare Worker resolver
- `packages/shared/` Shared types, validation helpers, ABI output
- `docs/` Product docs and safety notes
- `scripts/` Optional upload helper scripts for IPFS/Arweave

## Environment

Copy and edit:

```bash
cp .env.example .env
```

Required values:

- `POLYGON_RPC_URL`
- `USDC_ADDRESS` (defaults to Polygon native USDC: `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`)
- `TREASURY_ADDRESS`
- `PRIVATE_KEY` (deployment wallet)
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (if you want WalletConnect)
- `RESOLVER_CONTRACT_ADDRESS`

## Install

```bash
pnpm install
```

## Contract workflow

Compile + test:

```bash
pnpm contracts:compile
pnpm contracts:test
```

Deploy to Polygon mainnet:

```bash
cd contracts
pnpm deploy:polygon
```

Or from repo root:

```bash
pnpm contracts:deploy
```

Sync runtime config after deploy:

```bash
cd ..
pnpm deploy:checklist -- --address 0xYourDeployedContract --network polygon
```

This validates required env values and writes:

- `.env` (root contract/runtime keys)
- `apps/web/.env.local`
- `apps/resolver-worker/.dev.vars`

Export ABI to shared package:

```bash
cd contracts
pnpm export:abi
```

## Run Web App

```bash
pnpm dev:web
```

Open `http://localhost:3000`.

## Run Resolver Worker

```bash
pnpm dev:worker
```

Worker routes:

- `GET /health`
- `GET /r/<tokenId>`
- `GET /backup/<cid>` (encrypted backup envelope fetch via configured IPFS gateway)
- `GET /api/resolve/<tokenId>` (requires API key + consumes 1 credit)
- `GET /api/me` (API key status/remaining credits)
- `POST /api/admin/keys/create` (admin auth)
- `POST /api/admin/keys/topup` (admin auth)
- `GET /api/admin/keys/:id` (admin auth)

## Ubuntu 24 VPS Auto-Deploy

For fresh VPS provisioning and auto-deploy from GitHub, use:

```bash
sudo DOMAIN=qr.yourdomain.com ENABLE_TLS=true LETSENCRYPT_EMAIL=you@yourdomain.com bash scripts/vps/bootstrap-ubuntu24.sh
```

The script installs system dependencies, clones the repo, builds the app, configures nginx, and installs:

- `qr-forever-web.service` (web process)
- `qr-forever-deploy.timer` (pull/build/restart loop)

After bootstrap, edit runtime config:

```bash
sudo nano /etc/qr-forever/qr-forever.env
sudo FORCE_DEPLOY=1 /usr/local/bin/qr-forever-redeploy.sh
```

Detailed guide: `docs/vps-deploy.md`

## Resolver Deployment (Cloudflare Worker)

Resolver VPS is optional. Recommended architecture is Cloudflare Worker only for resolver.

Deploy worker:

```bash
pnpm worker:deploy
```

Set `ADMIN_API_TOKEN` (secret) and worker vars in `.env` first. See `apps/resolver-worker/.dev.vars.example`.

Backup flow docs:

- `docs/simple-production-backup.md`
- `docs/agent-wallet-sealed-backup.md`

## Mint QR (Polygon mainnet)

1. Deploy `QRRegistry` to Polygon mainnet.
2. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` and `RESOLVER_CONTRACT_ADDRESS`.
3. For sealed backups, set `setBackupResolverBaseUrl("https://q.yourdomain.com/backup")` once as contract owner.
4. Fund wallet with POL gas and hold Polygon USDC.
5. Open web app.
6. Connect wallet.
7. Choose mode + target.
8. Approve USDC and mint.
9. Open generated resolver URL.

## Security model

- Input validation for `url`, `address`, `ipfs`, `arweave` targets
- USDC-only payment path (no POL/MATIC mint payment)
- No updates on immutable mode
- Updateable mode owner-only updates
- Timelock propose/commit option
- Resolver validates on-chain target before redirect
- Basic per-IP rate limiting in worker

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Or via make:

```bash
make lint
make test
make build
```
