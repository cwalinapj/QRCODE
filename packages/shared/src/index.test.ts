import { describe, expect, it } from "vitest";

import {
  MODE,
  TARGET_TYPE,
  isValidArweaveTarget,
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
    expect(mintPrice(MODE.UPDATEABLE, TARGET_TYPE.URL)).toBe(59_000_000n);
    expect(isValidTargetByType(TARGET_TYPE.URL, "https://example.com")).toBe(true);
  });
});
