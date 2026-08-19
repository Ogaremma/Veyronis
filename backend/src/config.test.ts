import { describe, expect, it } from "vitest";
import { ConfigurationError, loadAgreementServerConfig, loadConfig } from "./config.js";

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

const serverEnvironment = {
  DEPLOYER_RPC_URL: "http://127.0.0.1:8545",
  DEPLOYER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  DATABASE_URL: "postgres://localhost/veyronis",
};

describe("loadAgreementServerConfig", () => {
  it("rejects a missing or known development session secret outside local", () => {
    expect(() => loadAgreementServerConfig({ ...serverEnvironment, APP_ENV: "production" })).toThrow(ConfigurationError);
    expect(() => loadAgreementServerConfig({ ...serverEnvironment, APP_ENV: "production", SESSION_SECRET: "development-only-change-me" })).toThrow(ConfigurationError);
  });

  it("retains the development fallback for local operation", () => {
    expect(loadAgreementServerConfig({ ...serverEnvironment, APP_ENV: "local" }).SESSION_SECRET).toBe("development-only-change-me");
  });
});
