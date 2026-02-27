"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  MODE,
  TARGET_TYPE,
  qrRegistryAbi,
  mintPrice,
  shortUsdc,
  type TargetType,
  isValidTargetByType,
} from "@qr-forever/shared";
import { decodeEventLog, formatUnits } from "viem";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";

import { appConfig, usdcAbi } from "@/lib/config";

type ModeUi = "immutable" | "updateable";

const TARGET_OPTIONS = {
  immutable: [TARGET_TYPE.IPFS, TARGET_TYPE.ARWEAVE] as TargetType[],
  updateable: [TARGET_TYPE.URL, TARGET_TYPE.IPFS, TARGET_TYPE.ARWEAVE] as TargetType[],
};

export function MintCard() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [mode, setMode] = useState<ModeUi>("immutable");
  const [targetType, setTargetType] = useState<TargetType>(TARGET_TYPE.IPFS);
  const [target, setTarget] = useState("");
  const [timelockSeconds, setTimelockSeconds] = useState(3600);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);

  const modeValue = mode === "immutable" ? MODE.IMMUTABLE : MODE.UPDATEABLE;
  const price = useMemo(() => mintPrice(modeValue, targetType), [modeValue, targetType]);

  const resolverUrl = mintedTokenId
    ? `${appConfig.resolverBaseUrl}/r/${mintedTokenId}`
    : null;

  async function ensureAllowance(requiredAmount: bigint) {
    if (!address || !publicClient || !walletClient) {
      throw new Error("Wallet not connected");
    }

    const allowance = (await publicClient.readContract({
      address: appConfig.usdcAddress as `0x${string}`,
      abi: usdcAbi,
      functionName: "allowance",
      args: [address, appConfig.contractAddress as `0x${string}`],
    })) as bigint;

    if (allowance >= requiredAmount) {
      return;
    }

    const approveHash = await walletClient.writeContract({
      address: appConfig.usdcAddress as `0x${string}`,
      abi: usdcAbi,
      functionName: "approve",
      args: [appConfig.contractAddress as `0x${string}`, requiredAmount],
      chain: walletClient.chain,
      account: walletClient.account,
    });

    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  async function downloadQrSvg() {
    if (!resolverUrl) return;
    const svg = await QRCode.toString(resolverUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
    });

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qr-${mintedTokenId}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadQrPng() {
    if (!resolverUrl) return;
    const dataUrl = await QRCode.toDataURL(resolverUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 1024,
    });

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${mintedTokenId}.png`;
    link.click();
  }

  async function onMint() {
    try {
      setError(null);

      if (!walletClient || !publicClient || !address) {
        throw new Error("Connect a wallet first");
      }

      if (!appConfig.contractAddress) {
        throw new Error("Contract address not configured");
      }

      if (!isValidTargetByType(targetType, target)) {
        throw new Error("Target format is invalid for selected type");
      }

      setIsSubmitting(true);
      await ensureAllowance(price);

      let hash: `0x${string}`;
      if (mode === "immutable") {
        hash = await walletClient.writeContract({
          address: appConfig.contractAddress as `0x${string}`,
          abi: qrRegistryAbi,
          functionName: "mintImmutable",
          args: [targetType, target.trim()],
          account: walletClient.account,
          chain: walletClient.chain,
        });
      } else {
        hash = await walletClient.writeContract({
          address: appConfig.contractAddress as `0x${string}`,
          abi: qrRegistryAbi,
          functionName: "mintUpdateable",
          args: [targetType, target.trim(), BigInt(timelockSeconds)],
          account: walletClient.account,
          chain: walletClient.chain,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let tokenId: string | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: qrRegistryAbi,
            eventName: "Minted",
            topics: log.topics,
            data: log.data,
          });
          tokenId = decoded.args.tokenId.toString();
          break;
        } catch {
          // ignore non-matching logs
        }
      }

      if (!tokenId) {
        throw new Error("Mint succeeded but tokenId could not be decoded");
      }

      setMintedTokenId(tokenId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Mint failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-xl font-bold">Mint QR Forever</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pay in USDC on Polygon. Immutable mode cannot change. Updateable mode can change only by token owner.
        </p>
      </div>

      {!isConnected ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Connect Wallet</p>
          <div className="flex flex-wrap gap-2">
            {connectors.map((connector) => (
              <button key={connector.uid} className="btn" onClick={() => connect({ connector })}>
                {connector.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <span>
            Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
          <button className="text-slate-700 underline" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label">Mode</label>
          <select
            className="input"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as ModeUi;
              setMode(next);
              setTargetType(TARGET_OPTIONS[next][0]);
            }}
          >
            <option value="immutable">Immutable Forever</option>
            <option value="updateable">Same QR Forever, Owner-Updateable</option>
          </select>
        </div>

        <div>
          <label className="label">Target Type</label>
          <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value as TargetType)}>
            {TARGET_OPTIONS[mode].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "updateable" ? (
        <div>
          <label className="label">Update Timelock (seconds)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={timelockSeconds}
            onChange={(e) => setTimelockSeconds(Number(e.target.value || 0))}
          />
          <p className="mt-1 text-xs text-slate-500">
            Recommended: 3600 seconds (1 hour). Timelock allows rollback before activation.
          </p>
        </div>
      ) : null}

      <div>
        <label className="label">Target</label>
        <input
          className="input"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={
            targetType === TARGET_TYPE.URL
              ? "https://example.com"
              : targetType === TARGET_TYPE.IPFS
                ? "ipfs://bafy... or CID"
                : "ar://TxID or TxID"
          }
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm">
          Price: <strong>{formatUnits(price, 6)} USDC</strong> (~${shortUsdc(price)})
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button className="btn w-full" disabled={!isConnected || isSubmitting} onClick={onMint}>
        {isSubmitting ? "Minting..." : "Pay USDC + Mint"}
      </button>

      {resolverUrl ? (
        <div className="space-y-3 rounded-lg border border-brand-500 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Mint successful: token #{mintedTokenId}</p>
          <p className="text-sm break-all">
            Verification URL: <a className="underline" href={resolverUrl} target="_blank" rel="noreferrer">{resolverUrl}</a>
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={downloadQrSvg}>Download SVG</button>
            <button className="btn" onClick={downloadQrPng}>Download PNG</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
