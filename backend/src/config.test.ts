import { describe, expect, it } from "vitest";
import { ConfigurationError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("reports missing live integration configuration structurally", () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);
    try {
      loadConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).code).toBe("CONFIGURATION_MISSING");
      expect((error as ConfigurationError).issues).toContain("CREDITCOIN_RPC_URL");
      expect((error as ConfigurationError).issues).toContain("VEYRONIS_VERIFIER_PRIVATE_KEY");
    }
  });
});
