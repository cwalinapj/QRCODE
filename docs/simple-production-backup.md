# Simple Production Backup (QR + Passphrase)

This is the recommended simple mode for your wallet product goal:

- Better than writing plaintext 12 words on paper
- Easy enough for non-technical users
- Uses existing immutable QR + resolver architecture
- Uses direct Arweave target for backup payload

## Model

1. Encrypt mnemonic locally in wallet app.
2. Upload encrypted envelope JSON to Arweave.
3. Mint immutable backup record directly from Arweave tx id:
   - `mintImmutableBackup("<arweaveTxId>")`
4. User prints/stores QR.
5. Recovery requires QR + passphrase.

## Why this is better than plaintext words

- Printed QR does not expose plaintext seed phrase.
- Theft of QR alone does not directly reveal mnemonic.
- Backup survives device loss/fire because envelope is stored offsite.

## Resolver integration

Resolver reads immutable target from chain and redirects to the Arweave destination.

## Wallet implementation

Use helpers from `@qr-forever/shared`:

- `sealMnemonicBackup`
- `buildImmutableBackupMintTarget` (creates `arweave` target)
- `unsealMnemonicBackup`

## Example

```ts
const { envelope } = await sealMnemonicBackup({
  mnemonic,
  handle: "paul.cwalina",
  passphrase,
  vaultCid: arweaveTxId,
});

const mintTarget = buildImmutableBackupMintTarget({
  arweaveTxId,
});

// mintTarget.targetType === "arweave"
// mintTarget.target === `ar://${arweaveTxId}`
```

Mint immutable backup with either:

- `mintImmutableBackup(arweaveTxId)`
- or `mintImmutable(mintTarget.targetType, mintTarget.target)`

The minted QR URL remains:

- `https://q.yourdomain.com/r/<tokenId>`
