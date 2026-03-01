# Agent Implementation Guide: Sealed QR Backup for Mnemonic

This guide is for the wallet app agent implementing QR-based mnemonic backup with immutable QR records.

## Goal

Replace plaintext seed phrase backups with a sealed backup flow:

1. Generate mnemonic (12 or 24 words)
2. Encrypt mnemonic client-side
3. Store encrypted envelope in Vault/IPFS
4. Build immutable backup locator URL from CID
5. Mint immutable QR in `QRRegistry`
6. Recover using QR + passphrase (optional passkey hardening)

## Security model

- QR must never contain plaintext mnemonic
- Vault/IPFS must never contain plaintext mnemonic
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
- `buildSealedBackupLocatorUrl(...)`
- `buildImmutableBackupMintTarget(...)`

## Data formats

### Sealed envelope (store in Vault/IPFS)

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

### Optional backup card QR payload (print/store)

```json
{
  "v": 1,
  "type": "sealed-mnemonic",
  "handle": "paul.cwalina",
  "cid": "bafy...",
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
const { envelope, qrPayload } = await sealMnemonicBackup({
  mnemonic,
  handle: "paul.cwalina",
  passphrase,
  passkeySecret, // optional
  vaultCid,
});
```

5. Upload `envelope` JSON to Vault/IPFS and get final CID.
6. Build immutable mint target:

```ts
const { targetType, target } = buildImmutableBackupMintTarget({
  resolverBaseUrl: "https://q.yourdomain.com",
  cid: finalCid,
});
// targetType === "url"
// target === "https://q.yourdomain.com/backup/<cid>"
```

7. Mint immutable QR with `mintImmutable(targetType, target)`.
8. Print/store minted resolver QR (`https://q.yourdomain.com/r/<tokenId>`).
9. Clear mnemonic and intermediate secrets from memory where possible.

## Recovery flow (wallet app)

1. Scan minted QR (`/r/<tokenId>`).
2. Resolver verifies on-chain record and redirects to `/backup/<cid>`.
3. Wallet app fetches sealed envelope JSON.
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
