# Agent Implementation Guide: Sealed QR Backup for Mnemonic

This guide is for the wallet app agent implementing QR-based mnemonic backup.

## Goal

Replace plaintext seed phrase backups with a sealed backup flow:

1. Generate mnemonic (12 or 24 words)
2. Encrypt mnemonic client-side
3. Store encrypted envelope in Vault/IPFS
4. Encode QR with metadata + CID only
5. Recovery requires QR + passphrase + passkey-bound secret

## Security model

- QR must never contain plaintext mnemonic
- Vault/IPFS must never contain plaintext mnemonic
- Decryption happens only in wallet client runtime
- Require both:
  - passphrase/PIN
  - passkey-bound secret (WebAuthn-derived)

## Shared module location

Use:

- `packages/shared/src/sealed-backup.ts`

Exports:

- `sealMnemonicBackup(...)`
- `unsealMnemonicBackup(...)`
- `serializeQrPayload(...)`
- `parseQrPayload(...)`

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

### QR payload (print/store)

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
2. Obtain passkey-bound secret bytes (32-byte minimum) from wallet passkey subsystem.
3. Prompt user for backup passphrase/PIN.
4. Call:

```ts
const { envelope, qrPayload } = await sealMnemonicBackup({
  mnemonic,
  handle: "paul.cwalina",
  passphrase,
  passkeySecret,
  vaultCid,
});
```

5. Upload `envelope` JSON to Vault/IPFS and get final CID.
6. Rebuild QR payload with final CID if needed.
7. Render QR from `serializeQrPayload(qrPayload)` and let user print.
8. Immediately clear mnemonic and intermediate secrets from memory where possible.

## Recovery flow (wallet app)

1. Scan QR and parse with `parseQrPayload`.
2. Fetch envelope JSON by CID from Vault/IPFS.
3. Require biometric passkey + passphrase.
4. Call:

```ts
const mnemonic = await unsealMnemonicBackup({
  envelope,
  passphrase,
  passkeySecret,
});
```

5. Use mnemonic only in secure recovery context; do not log/store plaintext.

## Hardening requirements for production

1. Keep `iterations >= 600000` for PBKDF2 baseline.
2. Add local lockout/rate limiting on failed recovery attempts.
3. Use secure display mode for recovered mnemonic (no screenshots if platform supports).
4. Disable telemetry/logging for secret-bearing paths.
5. Rotate to Argon2id in a future version when runtime support is available.

## Notes

- This protects against casual theft of printed QR alone.
- If attacker gets both QR and user passphrase/passkey secret, recovery is possible.
- Test-only wallets are still safer with sealed backups than plaintext phrase notes.
