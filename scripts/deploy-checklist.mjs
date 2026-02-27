#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const envExamplePath = path.join(root, ".env.example");

const argv = process.argv.slice(2);
const getArg = (flag) => {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  return argv[idx + 1];
};

const deployedAddress = getArg("--address");
const network = (getArg("--network") || "amoy").toLowerCase();

const chainId = network === "polygon" ? "137" : "80002";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    out[key] = value;
  }
  return out;
}

function writeEnvFile(filePath, updates, base = {}) {
  const merged = { ...base, ...updates };
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];

  const seen = new Set();
  const out = existing.map((line) => {
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0 || line.trim().startsWith("#")) return line;
    const key = line.slice(0, eqIdx).trim();
    if (!(key in merged)) return line;
    seen.add(key);
    return `${key}=${merged[key]}`;
  });

  for (const [k, v] of Object.entries(merged)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }

  fs.writeFileSync(filePath, `${out.filter(Boolean).join("\n")}\n`, "utf8");
}

const env = {
  ...parseEnvFile(envExamplePath),
  ...parseEnvFile(envPath),
};

const required = ["POLYGON_RPC_URL", "USDC_ADDRESS", "TREASURY_ADDRESS"];
for (const key of required) {
  if (!env[key]) {
    console.error(`Missing required ${key} in .env`);
    process.exit(1);
  }
}

if (!addressRegex.test(env.USDC_ADDRESS)) {
  console.error("USDC_ADDRESS must be a valid 0x address");
  process.exit(1);
}
if (!addressRegex.test(env.TREASURY_ADDRESS)) {
  console.error("TREASURY_ADDRESS must be a valid 0x address");
  process.exit(1);
}

const contractAddress = deployedAddress || env.CONTRACT_ADDRESS;
if (!contractAddress || !addressRegex.test(contractAddress)) {
  console.error("Provide --address <0x...> or set CONTRACT_ADDRESS in .env");
  process.exit(1);
}

const rootEnvUpdates = {
  CONTRACT_ADDRESS: contractAddress,
  RESOLVER_CONTRACT_ADDRESS: contractAddress,
  NEXT_PUBLIC_CONTRACT_ADDRESS: contractAddress,
  NEXT_PUBLIC_USDC_ADDRESS: env.USDC_ADDRESS,
  NEXT_PUBLIC_POLYGON_RPC_URL: env.POLYGON_RPC_URL,
  NEXT_PUBLIC_CHAIN_ID: chainId,
  RESOLVER_POLYGON_RPC_URL: env.POLYGON_RPC_URL,
};

writeEnvFile(envPath, rootEnvUpdates, env);

const webEnvPath = path.join(root, "apps/web/.env.local");
const webUpdates = {
  NEXT_PUBLIC_CHAIN_ID: chainId,
  NEXT_PUBLIC_CONTRACT_ADDRESS: contractAddress,
  NEXT_PUBLIC_USDC_ADDRESS: env.USDC_ADDRESS,
  NEXT_PUBLIC_POLYGON_RPC_URL: env.POLYGON_RPC_URL,
  NEXT_PUBLIC_RESOLVER_BASE_URL:
    env.NEXT_PUBLIC_RESOLVER_BASE_URL || "https://q.example.com",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
    env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
};
writeEnvFile(webEnvPath, webUpdates);

const workerDevVarsPath = path.join(root, "apps/resolver-worker/.dev.vars");
const workerUpdates = {
  POLYGON_RPC_URL: env.POLYGON_RPC_URL,
  CONTRACT_ADDRESS: contractAddress,
  RATE_LIMIT_PER_MINUTE: env.RESOLVER_RATE_LIMIT_PER_MINUTE || "60",
};
writeEnvFile(workerDevVarsPath, workerUpdates);

console.log("Deployment config synchronized.");
console.log(`Network: ${network} (chainId=${chainId})`);
console.log(`Contract: ${contractAddress}`);
console.log("Updated files:");
console.log(`- ${envPath}`);
console.log(`- ${webEnvPath}`);
console.log(`- ${workerDevVarsPath}`);
console.log("\nChecklist:");
console.log("1. Verify treasury address receives USDC on first mint.");
console.log("2. Start web app and mint test QR with USDC.");
console.log("3. Start resolver worker and open /r/<tokenId>.");
console.log("4. Confirm verification page shows on-chain destination and tx hash.");
console.log("5. For updateable records, test propose/commit and timelock behavior.");
