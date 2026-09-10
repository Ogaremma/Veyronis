import { describe, expect, it } from "vitest";
import { getNetworkLabel, getNetworkName } from "./network-label";

describe("network labels", () => {
  it("maps the supported wallet chains", () => {
    expect(getNetworkLabel(11155111)).toBe("Sepolia \u00b7 11155111");
    expect(getNetworkLabel(31337)).toBe("Anvil Local \u00b7 31337");
    expect(getNetworkName(11155111)).toBe("Sepolia");
    expect(getNetworkName(31337)).toBe("Anvil Local");
  });

  it("labels unsupported chains without a network fallback", () => {
    expect(getNetworkLabel(1)).toBe("Unsupported Network");
    expect(getNetworkLabel(undefined)).toBe("Unsupported Network");
    expect(getNetworkName(1)).toBe("Unsupported Network");
    expect(getNetworkName(undefined)).toBe("Unsupported Network");
  });
});
