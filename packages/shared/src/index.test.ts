import { describe, expect, it } from "vitest";

import {
  MODE,
  TARGET_TYPE,
  isValidArweaveTarget,
  isValidAddressTarget,
  isValidIpfsTarget,
  isValidTargetByType,
  mintPrice,
} from "./index.js";

describe("shared validators", () => {
  it("validates ipfs", () => {
    expect(isValidIpfsTarget("bafybeigdyrzt6w6w6xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(true);
    expect(isValidIpfsTarget("http://bad")).toBe(false);
  });

  it("validates arweave", () => {
    expect(isValidArweaveTarget("ar://N4x2kQ5M7YB7s4cL6Xg3b7h2vI7RwPZ_8QyV3gk8oXc")).toBe(true);
  });

  it("derives prices", () => {
    expect(mintPrice(MODE.IMMUTABLE, TARGET_TYPE.IPFS)).toBe(19_000_000n);
    expect(mintPrice(MODE.IMMUTABLE, TARGET_TYPE.URL)).toBe(19_000_000n);
    expect(mintPrice(MODE.IMMUTABLE, TARGET_TYPE.ADDRESS)).toBe(19_000_000n);
    expect(mintPrice(MODE.IMMUTABLE, TARGET_TYPE.ARWEAVE)).toBe(39_000_000n);
    expect(mintPrice(MODE.UPDATEABLE, TARGET_TYPE.URL)).toBe(59_000_000n);
    expect(isValidTargetByType(TARGET_TYPE.URL, "https://example.com")).toBe(true);
  });

  it("validates address targets", () => {
    expect(isValidAddressTarget("0x1111111111111111111111111111111111111111")).toBe(true);
    expect(isValidTargetByType(TARGET_TYPE.ADDRESS, "0x1111111111111111111111111111111111111111")).toBe(true);
    expect(isValidAddressTarget("0x123")).toBe(false);
  });
});
