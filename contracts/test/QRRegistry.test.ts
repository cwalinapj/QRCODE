import { expect } from "chai";
import { ethers } from "hardhat";

describe("QRRegistry", function () {
  async function deploy() {
    const [deployer, user, treasury, other] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();

    const Registry = await ethers.getContractFactory("QRRegistry");
    const registry = await Registry.deploy(await usdc.getAddress(), treasury.address);

    await usdc.mint(user.address, 1_000_000_000);

    return { deployer, user, treasury, other, usdc, registry };
  }

  it("mints immutable IPFS with USDC payment", async function () {
    const { user, treasury, usdc, registry } = await deploy();

    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);
    await expect(
      registry
        .connect(user)
        .mintImmutable("ipfs", "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
    )
      .to.emit(registry, "Minted")
      .withArgs(1, user.address, 0, "ipfs", "bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");

    expect(await usdc.balanceOf(treasury.address)).to.equal(19_000_000);
  });

  it("mints immutable backup URL from CID via helper function", async function () {
    const { deployer, user, treasury, usdc, registry } = await deploy();
    await registry.connect(deployer).setBackupResolverBaseUrl("https://q.example.com/backup");
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(
      registry
        .connect(user)
        .mintImmutableBackup("bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
    )
      .to.emit(registry, "Minted")
      .withArgs(
        1,
        user.address,
        0,
        "url",
        "https://q.example.com/backup/bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      );

    expect(await usdc.balanceOf(treasury.address)).to.equal(19_000_000);
  });

  it("rejects backup mint if backup base url is not configured", async function () {
    const { user, usdc, registry } = await deploy();
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(
      registry
        .connect(user)
        .mintImmutableBackup("bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
    ).to.be.reverted;
  });

  it("rejects backup mint with invalid cid", async function () {
    const { deployer, user, usdc, registry } = await deploy();
    await registry.connect(deployer).setBackupResolverBaseUrl("https://q.example.com/backup");
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(registry.connect(user).mintImmutableBackup("invalid-cid!")).to.be.reverted;
  });

  it("mints immutable url target", async function () {
    const { user, treasury, usdc, registry } = await deploy();
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(
      registry.connect(user).mintImmutable("url", "https://example.com"),
    )
      .to.emit(registry, "Minted")
      .withArgs(1, user.address, 0, "url", "https://example.com");

    expect(await usdc.balanceOf(treasury.address)).to.equal(19_000_000);
  });

  it("mints immutable wallet address target", async function () {
    const { user, treasury, usdc, registry } = await deploy();
    const walletAddress = "0x1111111111111111111111111111111111111111";
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(
      registry.connect(user).mintImmutable("address", walletAddress),
    )
      .to.emit(registry, "Minted")
      .withArgs(1, user.address, 0, "address", walletAddress);

    expect(await usdc.balanceOf(treasury.address)).to.equal(19_000_000);
  });

  it("rejects invalid immutable address target", async function () {
    const { user, usdc, registry } = await deploy();
    await usdc.connect(user).approve(await registry.getAddress(), 19_000_000);

    await expect(
      registry.connect(user).mintImmutable("address", "0x1234"),
    ).to.be.reverted;
  });

  it("supports direct update when timelock=0", async function () {
    const { user, usdc, registry } = await deploy();

    await usdc.connect(user).approve(await registry.getAddress(), 59_000_000);
    await registry
      .connect(user)
      .mintUpdateable("url", "https://example.com/a", 0);

    await expect(
      registry.connect(user).updateTarget(1, "url", "https://example.com/b"),
    )
      .to.emit(registry, "TargetUpdated")
      .withArgs(1, "url", "https://example.com/b");
  });

  it("requires propose/commit with timelock", async function () {
    const { user, usdc, registry } = await deploy();

    await usdc.connect(user).approve(await registry.getAddress(), 59_000_000);
    await registry
      .connect(user)
      .mintUpdateable("url", "https://example.com/a", 3600);

    await registry
      .connect(user)
      .proposeTarget(1, "arweave", "ar://N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc");

    await expect(registry.connect(user).commitTarget(1)).to.be.reverted;

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    await expect(registry.connect(user).commitTarget(1))
      .to.emit(registry, "TargetUpdated")
      .withArgs(1, "arweave", "ar://N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc");
  });

  it("blocks non-owner updates", async function () {
    const { user, other, usdc, registry } = await deploy();

    await usdc.connect(user).approve(await registry.getAddress(), 59_000_000);
    await registry
      .connect(user)
      .mintUpdateable("url", "https://example.com/a", 0);

    await expect(
      registry.connect(other).updateTarget(1, "url", "https://evil.com"),
    ).to.be.reverted;
  });

  it("returns record data for resolver", async function () {
    const { user, usdc, registry } = await deploy();

    await usdc.connect(user).approve(await registry.getAddress(), 59_000_000);
    await registry
      .connect(user)
      .mintUpdateable("url", "https://example.com/a", 0);

    const [record] = await registry.getRecord(1);
    expect(record.mode).to.equal(1);
    expect(record.target).to.equal("https://example.com/a");
    expect(record.targetType).to.equal("url");
  });
});
