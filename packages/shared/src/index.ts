import { z } from "zod";

export const MODE = {
  IMMUTABLE: 0,
  UPDATEABLE: 1,
} as const;

export const TARGET_TYPE = {
  URL: "url",
  IPFS: "ipfs",
  ARWEAVE: "arweave",
} as const;

export const PRICES_USDC = {
  immutableIpfs: 19_000_000n,
  immutableArweave: 39_000_000n,
  updateable: 59_000_000n,
} as const;

export type TargetType = (typeof TARGET_TYPE)[keyof typeof TARGET_TYPE];

export const ipfsRegex = /^(ipfs:\/\/)?(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-HJ-NP-Za-km-z]{20,})$/;
export const arweaveRegex = /^(ar:\/\/)?[a-zA-Z0-9_-]{43,64}$/;
export const httpsUrlRegex = /^https:\/\/.{1,2040}$/;

export const RecordSchema = z.object({
  mode: z.number().int().min(0).max(1),
  target: z.string().min(1).max(2048),
  targetType: z.enum([TARGET_TYPE.URL, TARGET_TYPE.IPFS, TARGET_TYPE.ARWEAVE]),
  createdAt: z.number(),
  updatedAt: z.number(),
  timelockSeconds: z.number(),
  pendingTarget: z.string(),
  pendingTargetAt: z.number(),
  pendingTargetType: z.string(),
});

export type RecordView = z.infer<typeof RecordSchema>;

export function normalizeTarget(input: string): string {
  return input.trim();
}

export function isValidIpfsTarget(input: string): boolean {
  return ipfsRegex.test(input.trim());
}

export function isValidArweaveTarget(input: string): boolean {
  return arweaveRegex.test(input.trim());
}

export function isValidHttpsUrl(input: string): boolean {
  return httpsUrlRegex.test(input.trim());
}

export function isValidTargetByType(type: TargetType, target: string): boolean {
  const normalized = normalizeTarget(target);
  if (type === TARGET_TYPE.IPFS) return isValidIpfsTarget(normalized);
  if (type === TARGET_TYPE.ARWEAVE) return isValidArweaveTarget(normalized);
  if (type === TARGET_TYPE.URL) return isValidHttpsUrl(normalized);
  return false;
}

export function toDestinationUrl(type: TargetType, target: string): string {
  const normalized = normalizeTarget(target);
  if (type === TARGET_TYPE.URL) return normalized;
  if (type === TARGET_TYPE.IPFS) {
    return normalized.startsWith("ipfs://") ? normalized : `ipfs://${normalized.replace(/^ipfs:\/\//, "")}`;
  }
  return normalized.startsWith("ar://") ? normalized : `ar://${normalized.replace(/^ar:\/\//, "")}`;
}

export function mintPrice(mode: number, targetType: TargetType): bigint {
  if (mode === MODE.UPDATEABLE) {
    return PRICES_USDC.updateable;
  }

  if (targetType === TARGET_TYPE.IPFS) {
    return PRICES_USDC.immutableIpfs;
  }

  return PRICES_USDC.immutableArweave;
}

export function shortUsdc(amount: bigint): string {
  return (Number(amount) / 1_000_000).toFixed(2);
}

export const qrRegistryAbi = [
  {
    type: "event",
    name: "Minted",
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "uint8", name: "mode", type: "uint8" },
      { indexed: false, internalType: "string", name: "targetType", type: "string" },
      { indexed: false, internalType: "string", name: "target", type: "string" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TargetUpdated",
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "string", name: "newTargetType", type: "string" },
      { indexed: false, internalType: "string", name: "newTarget", type: "string" },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "mintImmutable",
    stateMutability: "nonpayable",
    inputs: [
      { internalType: "string", name: "targetType", type: "string" },
      { internalType: "string", name: "target", type: "string" },
    ],
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintUpdateable",
    stateMutability: "nonpayable",
    inputs: [
      { internalType: "string", name: "targetType", type: "string" },
      { internalType: "string", name: "target", type: "string" },
      { internalType: "uint64", name: "timelockSeconds", type: "uint64" },
    ],
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "mode", type: "uint8" },
          { internalType: "string", name: "target", type: "string" },
          { internalType: "string", name: "targetType", type: "string" },
          { internalType: "uint64", name: "createdAt", type: "uint64" },
          { internalType: "uint64", name: "updatedAt", type: "uint64" },
          { internalType: "uint64", name: "timelockSeconds", type: "uint64" },
          { internalType: "string", name: "pendingTarget", type: "string" },
          { internalType: "uint64", name: "pendingTargetAt", type: "uint64" }
        ],
        internalType: "struct QRRegistry.Record",
        name: "record",
        type: "tuple"
      },
      { internalType: "string", name: "pendingTargetType", type: "string" }
    ],
  },
] as const;
