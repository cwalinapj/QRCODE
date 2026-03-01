# Simple Production Backup (QR + Passphrase)

This is the recommended simple mode for your wallet product goal:

- Better than writing plaintext 12 words on paper
- Easy enough for non-technical users
- Uses existing immutable QR + resolver architecture

## Model

1. Encrypt mnemonic locally in wallet app.
2. Upload encrypted envelope JSON to IPFS/Arweave.
3. Set contract backup base URL once:
   - `setBackupResolverBaseUrl("https://q.yourdomain.com/backup")`
4. Mint immutable backup record directly from CID:
   - `mintImmutableBackup("<cid>")`
5. User prints/stores QR.
6. Recovery requires QR + passphrase.

## Why this is better than plaintext words

- Printed QR does not expose plaintext seed phrase.
- Theft of QR alone does not directly reveal mnemonic.
- Backup survives device loss/fire because envelope is stored offsite.

## Resolver integration

Worker now supports:

- `GET /backup/:cid` -> fetches encrypted envelope JSON from IPFS gateway.

Default gateway is configurable with:

- `IPFS_GATEWAY_BASE` (default `https://ipfs.io/ipfs`)

## Wallet implementation

Use helpers from `@qr-forever/shared`:

- `sealMnemonicBackup`
- `unsealMnemonicBackup`

## Example

```ts
const { envelope } = await sealMnemonicBackup({
  mnemonic,
  handle: "paul.cwalina",
  passphrase,
  vaultCid: finalCid,
});

// owner/admin (once)
await registry.write.setBackupResolverBaseUrl(["https://q.yourdomain.com/backup"]);
```

Mint immutable backup with:

- `mintImmutableBackup(finalCid)`

The minted QR URL remains:

- `https://q.yourdomain.com/r/<tokenId>`
