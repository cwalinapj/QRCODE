import { describe, expect, it } from "vitest";
import { PRICES_USDC } from "@qr-forever/shared";

describe("web config assumptions", () => {
  it("matches required hardcoded pricing", () => {
    expect(PRICES_USDC.immutableIpfs).toBe(19_000_000n);
    expect(PRICES_USDC.immutableArweave).toBe(39_000_000n);
    expect(PRICES_USDC.updateable).toBe(59_000_000n);
  });
});
