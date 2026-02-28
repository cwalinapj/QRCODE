"use client";

import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

import { appConfig } from "./config";

const chain = defineChain({
  id: appConfig.chainId,
  name: appConfig.chainId === 137 ? "Polygon Mainnet" : "Polygon Amoy",
  nativeCurrency: {
    name: "POL",
    symbol: "POL",
    decimals: 18
  },
  rpcUrls: {
    default: { http: [appConfig.rpcUrl] }
  }
});

const connectors = [
  injected(),
  ...(appConfig.walletConnectProjectId
    ? [
        walletConnect({
          projectId: appConfig.walletConnectProjectId,
          showQrModal: true
        }),
      ]
    : []),
] as any;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: {
    [chain.id]: http(appConfig.rpcUrl)
  }
});

export const queryClient = new QueryClient();
export const qrChain = chain;
