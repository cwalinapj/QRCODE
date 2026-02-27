# qr-forever

Production-ready MVP monorepo for minting QR records on Polygon using **USDC only**.

## Features

- ERC-721 ownership model (`QRRegistry`) on Polygon
- Two QR modes:
  - **Immutable Forever** (`ipfs` or `arweave` target only)
  - **Owner-Updateable** (same token ID forever; target update by owner only)
- Optional timelock for updateable records
- On-chain auditable updates (events)
- Web app mint flow (MetaMask + WalletConnect)
- QR download as SVG + PNG
- Cloudflare Worker resolver (`/r/<tokenId>`) with on-chain verification and optional auto-redirect

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

Deploy to Amoy:

```bash
cd contracts
pnpm deploy:amoy
```

Sync runtime config after deploy:

```bash
cd ..
pnpm deploy:checklist -- --address 0xYourDeployedContract --network amoy
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

## Mint test QR (Amoy)

1. Deploy `QRRegistry` to Amoy.
2. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` and `RESOLVER_CONTRACT_ADDRESS`.
3. Fund wallet with Amoy gas and test USDC.
4. Open web app.
5. Connect wallet.
6. Choose mode + target.
7. Approve USDC and mint.
8. Open generated resolver URL.

## Switch from testnet to mainnet

- Set `POLYGON_RPC_URL` to Polygon mainnet RPC.
- Keep `USDC_ADDRESS` as Polygon native USDC.
- Deploy a fresh contract.
- Update:
  - `NEXT_PUBLIC_CONTRACT_ADDRESS`
  - `RESOLVER_CONTRACT_ADDRESS`
  - resolver worker secrets/vars

## Security model

- Input validation for `url`, `ipfs`, `arweave` targets
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
