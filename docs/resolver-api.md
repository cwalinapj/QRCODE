# Resolver API (Cloudflare Worker, No Resolver VPS Required)

This architecture keeps the resolver at the edge via Cloudflare Worker.

- Public scanner route: `GET /r/:tokenId` (can stay open)
- Backup envelope route: `GET /backup/:cid` (returns encrypted JSON envelope from IPFS gateway)
- Paid API route: `GET /api/resolve/:tokenId` (API key + credits)

Resolution uses on-chain read calls (`eth_call`), so there is no gas cost per resolve call.

## Required worker configuration

Set these (vars + secret):

- `CONTRACT_ADDRESS`
- `POLYGON_RPC_URL`
- `RATE_LIMIT_PER_MINUTE`
- `IPFS_GATEWAY_BASE` (default `https://ipfs.io/ipfs`)
- `ALLOW_PUBLIC_RESOLVER` (`true` or `false`)
- `ADMIN_API_TOKEN` (secret)
- Optional: `BILLING_WEBHOOK_URL`, `BILLING_WEBHOOK_AUTH`

Use helper deploy script from repo root:

```bash
pnpm worker:deploy
```

## API key model

- Key format: `qrf_live_<id>_<secret>`
- Each `/api/resolve/:tokenId` call consumes 1 credit
- If credits are exhausted, API returns HTTP `402`

## Admin endpoints

All admin endpoints require header:

`Authorization: Bearer <ADMIN_API_TOKEN>`

### Create key

`POST /api/admin/keys/create`

Body:

```json
{ "name": "partner-a", "credits": 100000 }
```

Response includes plaintext API key once.

### Top up key

`POST /api/admin/keys/topup`

Body:

```json
{ "keyId": "abcd1234efgh5678", "credits": 50000 }
```

### Get key status

`GET /api/admin/keys/:id`

## Partner endpoint

`GET /api/resolve/:tokenId`

Headers:

- `x-api-key: qrf_live_...`

Returns JSON with:

- `verified`
- `chain`
- `recordId`
- `targetType`
- `target`
- `destination`
- `lastUpdateTxHash`
- `creditsRemaining`

## Optional billing hook

If `BILLING_WEBHOOK_URL` is set, worker posts usage events asynchronously on each paid resolve:

```json
{
  "apiKeyId": "...",
  "tokenId": "...",
  "creditsRemaining": 99999,
  "totalCalls": 1,
  "ts": "2026-...",
  "chain": "polygon"
}
```
