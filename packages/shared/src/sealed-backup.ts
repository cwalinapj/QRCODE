export type KdfSpec = {
  name: "pbkdf2-sha256";
  iterations: number;
  saltB64: string;
};

export type CipherSpec = {
  name: "aes-256-gcm";
  nonceB64: string;
};

export type SealedMnemonicEnvelope = {
  version: 1;
  type: "sealed-mnemonic";
  handle: string;
  kdf: KdfSpec;
  cipher: CipherSpec;
  ciphertextB64: string;
  createdAt: string;
};

export type SealedMnemonicQrPayload = {
  v: 1;
  type: "sealed-mnemonic";
  handle: string;
  cid: string;
  kdf: "pbkdf2-sha256";
  cipher: "aes-256-gcm";
  salt: string;
  nonce: string;
};

export type SealMnemonicInput = {
  mnemonic: string;
  handle: string;
  passphrase: string;
  passkeySecret?: Uint8Array | string;
  vaultCid: string;
  pbkdf2Iterations?: number;
};

type CryptoLike = {
  subtle: {
    importKey: (...args: any[]) => Promise<any>;
    deriveBits: (...args: any[]) => Promise<ArrayBuffer>;
    encrypt: (...args: any[]) => Promise<ArrayBuffer>;
    decrypt: (...args: any[]) => Promise<ArrayBuffer>;
  };
  getRandomValues: <T extends ArrayBufferView>(arr: T) => T;
};

function getCrypto(): CryptoLike {
  const c = (globalThis as any).crypto;
  if (!c?.subtle || !c?.getRandomValues) {
    throw new Error("WebCrypto not available in this runtime");
  }
  return c as CryptoLike;
}

function bytesToBase64(input: Uint8Array): string {
  const B = (globalThis as any).Buffer;
  if (B) return B.from(input).toString("base64");

  let bin = "";
  for (const b of input) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(input: string): Uint8Array {
  const B = (globalThis as any).Buffer;
  if (B) return new Uint8Array(B.from(input, "base64"));

  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function fromBytes(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}

function normalizePasskeySecret(secret: Uint8Array | string): Uint8Array {
  if (secret instanceof Uint8Array) return secret;
  return base64ToBytes(secret);
}

function normalizeOptionalPasskeySecret(secret?: Uint8Array | string): Uint8Array {
  if (!secret) return new Uint8Array(0);
  return normalizePasskeySecret(secret);
}

function joinSecrets(passphrase: string, passkeySecret: Uint8Array): Uint8Array {
  const passphraseBytes = toBytes(passphrase);
  const out = new Uint8Array(passphraseBytes.length + 1 + passkeySecret.length);
  out.set(passphraseBytes, 0);
  out[passphraseBytes.length] = 58; // ":"
  out.set(passkeySecret, passphraseBytes.length + 1);
  return out;
}

function looksLikeMnemonic(input: string): boolean {
  const words = input.trim().split(/\s+/).filter(Boolean);
  return words.length === 12 || words.length === 24;
}

async function deriveAesKey(
  cryptoLike: CryptoLike,
  passphrase: string,
  passkeySecret: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<any> {
  const material = await cryptoLike.subtle.importKey(
    "raw",
    joinSecrets(passphrase, passkeySecret),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const bits = await cryptoLike.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    material,
    256,
  );

  return cryptoLike.subtle.importKey("raw", bits, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealMnemonicBackup(input: SealMnemonicInput): Promise<{
  envelope: SealedMnemonicEnvelope;
  qrPayload: SealedMnemonicQrPayload;
}> {
  if (!looksLikeMnemonic(input.mnemonic)) {
    throw new Error("Mnemonic must be 12 or 24 words");
  }
  if (!input.handle.trim()) throw new Error("Handle is required");
  if (!input.passphrase.trim()) throw new Error("Passphrase is required");
  if (!input.vaultCid.trim()) throw new Error("vaultCid is required");

  const cryptoLike = getCrypto();
  const salt = cryptoLike.getRandomValues(new Uint8Array(16));
  const nonce = cryptoLike.getRandomValues(new Uint8Array(12));
  const iterations = input.pbkdf2Iterations ?? 600_000;
  const passkeySecret = normalizeOptionalPasskeySecret(input.passkeySecret);
  const aesKey = await deriveAesKey(cryptoLike, input.passphrase, passkeySecret, salt, iterations);

  const ciphertext = await cryptoLike.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    toBytes(input.mnemonic.trim()),
  );

  const envelope: SealedMnemonicEnvelope = {
    version: 1,
    type: "sealed-mnemonic",
    handle: input.handle.trim().toLowerCase(),
    kdf: {
      name: "pbkdf2-sha256",
      iterations,
      saltB64: bytesToBase64(salt),
    },
    cipher: {
      name: "aes-256-gcm",
      nonceB64: bytesToBase64(nonce),
    },
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };

  const qrPayload: SealedMnemonicQrPayload = {
    v: 1,
    type: "sealed-mnemonic",
    handle: envelope.handle,
    cid: input.vaultCid.trim(),
    kdf: envelope.kdf.name,
    cipher: envelope.cipher.name,
    salt: envelope.kdf.saltB64,
    nonce: envelope.cipher.nonceB64,
  };

  return { envelope, qrPayload };
}

export async function unsealMnemonicBackup(args: {
  envelope: SealedMnemonicEnvelope;
  passphrase: string;
  passkeySecret?: Uint8Array | string;
}): Promise<string> {
  const { envelope } = args;
  if (envelope.version !== 1 || envelope.type !== "sealed-mnemonic") {
    throw new Error("Unsupported sealed backup version/type");
  }
  if (envelope.kdf.name !== "pbkdf2-sha256") {
    throw new Error("Unsupported KDF");
  }
  if (envelope.cipher.name !== "aes-256-gcm") {
    throw new Error("Unsupported cipher");
  }

  const cryptoLike = getCrypto();
  const passkeySecret = normalizeOptionalPasskeySecret(args.passkeySecret);
  const salt = base64ToBytes(envelope.kdf.saltB64);
  const nonce = base64ToBytes(envelope.cipher.nonceB64);
  const ciphertext = base64ToBytes(envelope.ciphertextB64);
  const aesKey = await deriveAesKey(
    cryptoLike,
    args.passphrase,
    passkeySecret,
    salt,
    envelope.kdf.iterations,
  );

  const plain = await cryptoLike.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    ciphertext,
  );

  return fromBytes(new Uint8Array(plain));
}

export function serializeQrPayload(payload: SealedMnemonicQrPayload): string {
  return JSON.stringify(payload);
}

export function parseQrPayload(input: string): SealedMnemonicQrPayload {
  const parsed = JSON.parse(input) as SealedMnemonicQrPayload;
  if (parsed.v !== 1 || parsed.type !== "sealed-mnemonic") {
    throw new Error("Invalid QR payload");
  }
  if (!parsed.handle || !parsed.cid || !parsed.salt || !parsed.nonce) {
    throw new Error("Invalid QR payload");
  }
  return parsed;
}

export function buildImmutableBackupMintTarget(args: {
  arweaveTxId: string;
}): { targetType: "arweave"; target: string } {
  const clean = args.arweaveTxId.trim();
  if (!clean) throw new Error("arweaveTxId is required");
  return {
    targetType: "arweave",
    target: clean.startsWith("ar://") ? clean : `ar://${clean}`,
  };
}
