import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "unknown";
  const usdcAddress = process.env.USDC_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!usdcAddress || !treasuryAddress) {
    throw new Error("USDC_ADDRESS and TREASURY_ADDRESS are required");
  }

  const QRRegistry = await ethers.getContractFactory("QRRegistry");
  const registry = await QRRegistry.deploy(usdcAddress, treasuryAddress);
  const receipt = await registry.deploymentTransaction()?.wait();
  await registry.waitForDeployment();
  const deployedAddress = await registry.getAddress();

  const payload = {
    network: networkName,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    contractAddress: deployedAddress,
    deploymentTxHash: receipt?.hash || "",
    usdcAddress,
    treasuryAddress,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${networkName}.json`),
    JSON.stringify(payload, null, 2),
  );

  console.log("QRRegistry deployed:", deployedAddress);
  console.log("USDC:", usdcAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("Deployment file:", path.join(outDir, `${networkName}.json`));
  console.log(
    `Run: node scripts/deploy-checklist.mjs --address ${deployedAddress} --network ${networkName}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
