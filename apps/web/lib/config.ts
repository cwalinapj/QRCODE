export const appConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002),
  contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
  usdcAddress:
    process.env.NEXT_PUBLIC_USDC_ADDRESS ||
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  rpcUrl:
    process.env.NEXT_PUBLIC_POLYGON_RPC_URL ||
    "https://rpc-amoy.polygon.technology",
  resolverBaseUrl:
    process.env.NEXT_PUBLIC_RESOLVER_BASE_URL || "https://q.example.com",
  walletConnectProjectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
};

export const usdcAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "value", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
