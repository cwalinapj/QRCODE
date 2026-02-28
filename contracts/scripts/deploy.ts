import { ethers } from "hardhat";
import { isAddress } from "ethers";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "unknown";
  const usdcAddress = process.env.USDC_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!usdcAddress || !treasuryAddress) {
    throw new Error(
      "USDC_ADDRESS and TREASURY_ADDRESS are required. Set them in /Users/root1/QRCODE/.env.",
    );
  }

  if (!isAddress(usdcAddress) || !isAddress(treasuryAddress)) {
    throw new Error("USDC_ADDRESS and TREASURY_ADDRESS must be valid EVM addresses.");
  }

  const QRRegistry = await ethers.getContractFactory("QRRegistry");
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error(
      "No deployer signer configured. Set PRIVATE_KEY in /Users/root1/QRCODE/.env.",
    );
  }

  const deployTx = await QRRegistry.getDeployTransaction(usdcAddress, treasuryAddress);
  const gasEstimate = await ethers.provider.estimateGas({
    from: deployer.address,
    data: deployTx.data,
  });
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;

  if (!gasPrice) {
    throw new Error("Unable to determine gas price from network provider.");
  }

  const requiredBalance = gasEstimate * gasPrice;
  const currentBalance = await ethers.provider.getBalance(deployer.address);

  if (currentBalance < requiredBalance) {
    const required = ethers.formatEther(requiredBalance);
    const have = ethers.formatEther(currentBalance);
    throw new Error(
      `Insufficient POL for deployment gas on ${networkName}. Required ~${required} POL, wallet has ${have} POL. Fund ${deployer.address} and retry.`,
    );
  }

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Estimated deploy gas: ${gasEstimate.toString()}`);
  console.log(`Estimated gas cost: ${ethers.formatEther(requiredBalance)} POL`);

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
