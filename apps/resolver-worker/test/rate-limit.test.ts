import { describe, expect, it } from "vitest";
import { isRateLimited } from "../src/index";

describe("rate limit", () => {
  it("blocks after threshold in same window", () => {
    const ip = `test-${Date.now()}`;
    expect(isRateLimited(ip, 2)).toBe(false);
    expect(isRateLimited(ip, 2)).toBe(false);
    expect(isRateLimited(ip, 2)).toBe(true);
  });
});
