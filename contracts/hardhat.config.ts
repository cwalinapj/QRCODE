import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { HardhatUserConfig } from "hardhat/config";

const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    amoy: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      chainId: 137,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
