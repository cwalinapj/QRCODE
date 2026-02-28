import { describe, expect, it } from "vitest";

import { buildApiKeyToken, parseApiKeyToken } from "../src/index";

describe("api key token helpers", () => {
  it("parses valid key tokens", () => {
    const key = buildApiKeyToken("abcd1234efgh5678", "SecretSecretSecretSecret1234567890");
    const parsed = parseApiKeyToken(key);

    expect(parsed).toEqual({
      id: "abcd1234efgh5678",
      secret: "SecretSecretSecretSecret1234567890",
    });
  });

  it("rejects invalid key tokens", () => {
    expect(parseApiKeyToken(null)).toBeNull();
    expect(parseApiKeyToken("bad")).toBeNull();
    expect(parseApiKeyToken("qrf_live_missing_parts")).toBeNull();
  });
});
