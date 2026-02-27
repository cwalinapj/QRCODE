import fs from "node:fs";
import path from "node:path";

async function main() {
  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/QRRegistry.sol/QRRegistry.json");
  const outPath = path.resolve(__dirname, "../../packages/shared/abi/QRRegistry.json");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const payload = {
    abi: artifact.abi,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Exported ABI to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
