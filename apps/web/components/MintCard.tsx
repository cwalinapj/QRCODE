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

function WalletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

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
    <div className="card space-y-6 animate-slide-up">
      {/* Wallet connection */}
      {!isConnected ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <WalletIcon />
            Connect Your Wallet
          </div>
          <div className="flex flex-wrap gap-2">
            {connectors.map((connector) => (
              <button key={connector.uid} className="btn" onClick={() => connect({ connector })}>
                {connector.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm ring-1 ring-brand-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-brand-500" />
            <span className="font-medium text-brand-800">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
          </div>
          <button
            className="text-xs font-semibold text-brand-700 underline decoration-dotted hover:text-brand-800"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Mode + Target Type */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <option value="updateable">Owner-Updateable</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {mode === "immutable"
              ? "Destination locked on-chain permanently."
              : "Same QR, change the destination anytime."}
          </p>
        </div>
        <div>
          <label className="label">Target Type</label>
          <select
            className="input"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
          >
            {TARGET_OPTIONS[mode].map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Target */}
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
                ? "ipfs://bafy… or CID"
                : "ar://TxID or TxID"
          }
        />
      </div>

      {/* Timelock (updateable only) */}
      {mode === "updateable" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <label className="label text-amber-800">Update Timelock (seconds)</label>
          <input
            className="input border-amber-200 focus:border-amber-400 focus:ring-amber-100"
            type="number"
            min={0}
            value={timelockSeconds}
            onChange={(e) => setTimelockSeconds(Number(e.target.value || 0))}
          />
          <p className="mt-2 text-xs text-amber-700">
            Recommended: 3600 s (1 hour). Allows rollback before activation.
          </p>
        </div>
      )}

      {/* Price */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
        <span className="text-sm text-slate-600">Price:</span>
        <span className="text-base font-black text-slate-900">
          {formatUnits(price, 6)}{" "}
          <span className="text-brand-700">USDC</span>
          <span className="ml-1 text-xs font-normal text-slate-400">(~${shortUsdc(price)})</span>
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Mint button */}
      <button
        className="btn w-full py-3 text-base"
        disabled={!isConnected || isSubmitting}
        onClick={onMint}
      >
        {isSubmitting ? (
          <>
            <SpinnerIcon />
            Minting…
          </>
        ) : (
          <>
            Pay USDC &amp; Mint QR
          </>
        )}
      </button>

      {/* Success */}
      {resolverUrl && (
        <div className="animate-fade-in space-y-4 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
              <CheckIcon />
            </span>
            <span className="font-bold text-brand-800">Minted! Token #{mintedTokenId}</span>
          </div>
          <div className="rounded-lg border border-brand-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Resolver URL</p>
            <a
              className="break-all text-sm font-medium text-brand-700 underline decoration-dotted hover:text-brand-800"
              href={resolverUrl}
              target="_blank"
              rel="noreferrer"
            >
              {resolverUrl}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={downloadQrSvg}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download SVG
            </button>
            <button className="btn-outline" onClick={downloadQrPng}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download PNG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

