# Agent Implementation Guide: Sealed QR Backup for Mnemonic

This guide is for the wallet app agent implementing QR-based mnemonic backup with immutable QR records.

## Goal

Replace plaintext seed phrase backups with a sealed backup flow:

1. Generate mnemonic (12 or 24 words)
2. Encrypt mnemonic client-side
3. Store encrypted envelope in Arweave
4. Mint immutable backup QR in `QRRegistry` using direct Arweave target
5. Recover using QR + passphrase (optional passkey hardening)

## Security model

- QR must never contain plaintext mnemonic
- Arweave payload must never contain plaintext mnemonic
- Decryption happens only in wallet client runtime
- Baseline requirement: passphrase/PIN
- Optional hardening: passkey-bound secret (WebAuthn-derived)

## Shared module location

Use:

- `packages/shared/src/sealed-backup.ts`

Exports:

- `sealMnemonicBackup(...)`
- `unsealMnemonicBackup(...)`
- `serializeQrPayload(...)`
- `parseQrPayload(...)`
- `buildImmutableBackupMintTarget(...)`

## Data formats

### Sealed envelope (store in Arweave)

```json
{
  "version": 1,
  "type": "sealed-mnemonic",
  "handle": "paul.cwalina",
  "kdf": {
    "name": "pbkdf2-sha256",
    "iterations": 600000,
    "saltB64": "..."
  },
  "cipher": {
    "name": "aes-256-gcm",
    "nonceB64": "..."
  },
  "ciphertextB64": "...",
  "createdAt": "2026-..."
}
```

### Optional backup card QR payload

```json
{
  "v": 1,
  "type": "sealed-mnemonic",
  "handle": "paul.cwalina",
  "cid": "N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc",
  "kdf": "pbkdf2-sha256",
  "cipher": "aes-256-gcm",
  "salt": "...",
  "nonce": "..."
}
```

## Create flow (wallet app)

1. Generate mnemonic.
2. Prompt user for backup passphrase/PIN.
3. Optionally obtain passkey-bound secret bytes.
4. Call:

```ts
const { envelope } = await sealMnemonicBackup({
  mnemonic,
  handle: "paul.cwalina",
  passphrase,
  passkeySecret, // optional
  vaultCid: arweaveTxId,
});
```

5. Upload `envelope` JSON to Arweave and get `arweaveTxId`.
6. Mint immutable backup directly:

```ts
await registry.write.mintImmutableBackup([arweaveTxId]);
```

Alternative generic path:

```ts
const mintTarget = buildImmutableBackupMintTarget({ arweaveTxId });
await registry.write.mintImmutable([mintTarget.targetType, mintTarget.target]);
```

7. QR resolves at `https://q.yourdomain.com/r/<tokenId>`.
8. Clear mnemonic and intermediate secrets from memory where possible.

## Recovery flow (wallet app)

1. Scan minted QR (`/r/<tokenId>`).
2. Resolver verifies on-chain record and redirects to Arweave destination.
3. Wallet app fetches sealed envelope JSON from Arweave.
4. Prompt passphrase (and optional passkey step).
5. Call:

```ts
const mnemonic = await unsealMnemonicBackup({
  envelope,
  passphrase,
  passkeySecret, // optional
});
```

6. Use mnemonic only in secure recovery context; do not log/store plaintext.

## Hardening requirements for production

1. Keep `iterations >= 600000` for PBKDF2 baseline.
2. Add local lockout/rate limiting on failed recovery attempts.
3. Use secure display mode for recovered mnemonic (no screenshots if platform supports).
4. Disable telemetry/logging for secret-bearing paths.
5. Rotate to Argon2id in a future version when runtime support is available.

## Notes

- This is materially safer than writing plaintext seed words on paper.
- If attacker gets both QR and user passphrase, recovery is possible.
- Optional passkey secret increases resistance for high-value wallets.
