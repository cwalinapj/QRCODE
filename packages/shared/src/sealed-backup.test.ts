import { describe, expect, it } from "vitest";

import {
  buildImmutableBackupMintTarget,
  parseQrPayload,
  sealMnemonicBackup,
  serializeQrPayload,
  unsealMnemonicBackup,
} from "./sealed-backup.js";

const mnemonic =
  "witness slow shoe surprise width pole parade child diagram staff like enroll";

describe("sealed mnemonic backup", () => {
  it("seals and unseals with passphrase + passkey secret", async () => {
    const passkeySecret = new Uint8Array(32).fill(7);
    const { envelope, qrPayload } = await sealMnemonicBackup({
      mnemonic,
      handle: "paul.cwalina",
      passphrase: "correct horse battery staple",
      passkeySecret,
      vaultCid: "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      pbkdf2Iterations: 10_000,
    });

    expect(envelope.type).toBe("sealed-mnemonic");
    expect(qrPayload.cid).toContain("bafy");

    const decodedMnemonic = await unsealMnemonicBackup({
      envelope,
      passphrase: "correct horse battery staple",
      passkeySecret,
    });

    expect(decodedMnemonic).toBe(mnemonic);
  });

  it("fails to unseal with wrong passphrase", async () => {
    const passkeySecret = new Uint8Array(32).fill(9);
    const { envelope } = await sealMnemonicBackup({
      mnemonic,
      handle: "paul.cwalina",
      passphrase: "my passphrase",
      passkeySecret,
      vaultCid: "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      pbkdf2Iterations: 10_000,
    });

    await expect(
      unsealMnemonicBackup({
        envelope,
        passphrase: "wrong passphrase",
        passkeySecret,
      }),
    ).rejects.toThrow();
  });

  it("serializes and parses QR payload", async () => {
    const passkeySecret = new Uint8Array(32).fill(3);
    const { qrPayload } = await sealMnemonicBackup({
      mnemonic,
      handle: "paul.cwalina",
      passphrase: "p",
      passkeySecret,
      vaultCid: "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      pbkdf2Iterations: 10_000,
    });

    const encoded = serializeQrPayload(qrPayload);
    const decoded = parseQrPayload(encoded);
    expect(decoded.cid).toBe(qrPayload.cid);
    expect(decoded.handle).toBe("paul.cwalina");
  });

  it("supports passphrase-only mode", async () => {
    const { envelope } = await sealMnemonicBackup({
      mnemonic,
      handle: "paul.cwalina",
      passphrase: "just-a-passphrase",
      vaultCid: "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      pbkdf2Iterations: 10_000,
    });

    const decoded = await unsealMnemonicBackup({
      envelope,
      passphrase: "just-a-passphrase",
    });
    expect(decoded).toBe(mnemonic);
  });

  it("builds immutable backup mint target for arweave", () => {
    const mintTarget = buildImmutableBackupMintTarget({
      arweaveTxId: "N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc",
    });
    expect(mintTarget.targetType).toBe("arweave");
    expect(mintTarget.target).toBe("ar://N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc");
  });
});
