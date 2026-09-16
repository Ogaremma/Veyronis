import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ importCount: 0, init: vi.fn() }));

vi.mock("@nimiq/mini-app-sdk", () => {
  sdk.importCount += 1;
  return { init: sdk.init };
});

const ADDRESS = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000";
const REFERENCE = "serialized-nimiq-transaction";

type ProviderMock = ReturnType<typeof vi.fn>;

interface FakeProvider {
  readonly listAccounts: ProviderMock;
  readonly sendBasicTransactionWithData: ProviderMock;
}

function createProvider(): FakeProvider {
  const listAccounts: ProviderMock = vi.fn();
  const sendBasicTransactionWithData: ProviderMock = vi.fn();
  listAccounts.mockResolvedValue([ADDRESS]);
  sendBasicTransactionWithData.mockResolvedValue(REFERENCE);
  return { listAccounts, sendBasicTransactionWithData };
}

function installNimiqPayHost(): void {
  vi.stubGlobal("window", { nimiqPay: { requestDeviceIdentifier: vi.fn() } });
}

function loadModule() {
  return import("./nimiq-pay.js");
}

async function expectErrorCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error("Expected the operation to reject.");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as { code?: unknown }).code).toBe(code);
}

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockReset();
  sdk.importCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Nimiq Pay host detection", () => {
  it("never imports or initializes the SDK when window is unavailable", async () => {
    const before = sdk.importCount;
    const mod = await loadModule();

    expect(mod.isNimiqPayHost()).toBe(false);
    await expectErrorCode(mod.getNimiqProvider(), "NIMIQ_PAY_UNAVAILABLE");
    await expectErrorCode(mod.getNimiqAccounts(), "NIMIQ_PAY_UNAVAILABLE");
    await expectErrorCode(
      mod.sendNimPayment({
        recipient: ADDRESS,
        valueLuna: 1_000,
        data: "veyronis",
      }),
      "NIMIQ_PAY_UNAVAILABLE",
    );

    expect(sdk.importCount).toBe(before);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("never imports or initializes the SDK in an ordinary browser", async () => {
    vi.stubGlobal("window", { ethereum: { request: vi.fn() } });
    const before = sdk.importCount;
    const mod = await loadModule();

    expect(mod.isNimiqPayHost()).toBe(false);
    expect(mod.getNimiqPayReadiness()).toEqual({
      host: false,
      providerInitialized: false,
    });
    await expectErrorCode(mod.getNimiqProvider(), "NIMIQ_PAY_UNAVAILABLE");

    expect(sdk.importCount).toBe(before);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("detects the Nimiq Pay host", async () => {
    const mod = await loadModule();
    expect(mod.isNimiqPayHost()).toBe(false);

    installNimiqPayHost();

    expect(mod.isNimiqPayHost()).toBe(true);
    expect(mod.getNimiqPayReadiness()).toEqual({
      host: true,
      providerInitialized: false,
    });
  });
});

describe("Nimiq Pay SDK initialization", () => {
  it("initializes the SDK once per page session and caches the provider", async () => {
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const before = sdk.importCount;

    const mod = await loadModule();
    const [first, second, third] = await Promise.all([
      mod.getNimiqProvider(),
      mod.getNimiqProvider(),
      mod.getNimiqProvider(),
    ]);

    expect(first).toBe(provider);
    expect(second).toBe(provider);
    expect(third).toBe(provider);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.importCount).toBe(before + 1);
    expect(mod.getNimiqPayReadiness().providerInitialized).toBe(true);
  });

  it("keeps a failed initialization cached instead of retrying on every call", async () => {
    sdk.init.mockImplementation(async () => {
      throw new Error(
        "Nimiq provider was not injected. Are you running inside a Nimiq app?",
      );
    });
    installNimiqPayHost();
    const mod = await loadModule();

    await expectErrorCode(mod.getNimiqProvider(), "PROVIDER_FAILURE");
    await expectErrorCode(mod.getNimiqProvider(), "PROVIDER_FAILURE");

    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
});

describe("Nimiq Pay error normalization", () => {
  it("normalizes listAccounts failures from thrown errors and error payloads", async () => {
    const provider = createProvider();
    provider.listAccounts.mockImplementation(async () => {
      throw new Error("provider transport failure");
    });
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await expectErrorCode(mod.getNimiqAccounts(), "PROVIDER_FAILURE");

    provider.listAccounts.mockResolvedValue({
      error: { type: "InvalidTransactionError", message: "invalid account" },
    });
    await expectErrorCode(mod.getNimiqAccounts(), "PROVIDER_FAILURE");
  });

  it("distinguishes user rejection from generic provider failure", async () => {
    const mod = await loadModule();

    expect(mod.toNimiqPayError(new Error("transport down"))).toBeInstanceOf(
      mod.NimiqPayError,
    );
    expect(
      mod.toNimiqPayError(Object.assign(new Error("nope"), { code: 4001 }))
        .code,
    ).toBe("USER_REJECTED");
    expect(
      mod.toNimiqPayError(new Error("User rejected the request.")).code,
    ).toBe("USER_REJECTED");
    expect(
      mod.toNimiqPayError(
        Object.assign(new Error("failed"), {
          name: "PermissionDeniedError",
        }),
      ).code,
    ).toBe("USER_REJECTED");
    expect(
      mod.toNimiqPayError({
        error: { type: "PermissionDeniedError", message: "denied" },
      }).code,
    ).toBe("USER_REJECTED");
    expect(mod.toNimiqPayError(new Error("transport down")).code).toBe(
      "PROVIDER_FAILURE",
    );
    expect(mod.toNimiqPayError("boom").code).toBe("PROVIDER_FAILURE");
  });

  it("maps a rejected payment to USER_REJECTED", async () => {
    const provider = createProvider();
    provider.sendBasicTransactionWithData.mockResolvedValue({
      error: {
        type: "PermissionDeniedError",
        message: "The user denied the request.",
      },
    });
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await expectErrorCode(
      mod.sendNimPayment({
        recipient: ADDRESS,
        valueLuna: 1_000,
        data: "veyronis",
      }),
      "USER_REJECTED",
    );
  });

  it("fails safely when Nimiq Pay returns no authorized account", async () => {
    const provider = createProvider();
    provider.listAccounts.mockResolvedValue([]);
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await expectErrorCode(
      mod.sendNimPayment({
        recipient: ADDRESS,
        valueLuna: 1_000,
        data: "veyronis",
      }),
      "PROVIDER_FAILURE",
    );
    expect(provider.sendBasicTransactionWithData).not.toHaveBeenCalled();
  });
});

describe("Nimiq Pay payment validation", () => {
  it("rejects invalid Luna amounts and recipients before touching the provider", async () => {
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    const invalidAmounts = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
    ];
    for (const valueLuna of invalidAmounts) {
      await expectErrorCode(
        mod.sendNimPayment({ recipient: ADDRESS, valueLuna, data: "veyronis" }),
        "INVALID_INPUT",
      );
    }
    await expectErrorCode(
      mod.sendNimPayment({
        recipient: "   ",
        valueLuna: 1_000,
        data: "veyronis",
      }),
      "INVALID_INPUT",
    );

    expect(sdk.init).not.toHaveBeenCalled();
    expect(provider.listAccounts).not.toHaveBeenCalled();
    expect(provider.sendBasicTransactionWithData).not.toHaveBeenCalled();
  });

  it("enforces the 64 byte data payload limit", async () => {
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await expectErrorCode(
      mod.sendNimPayment({
        recipient: ADDRESS,
        valueLuna: 1_000,
        data: "x".repeat(65),
      }),
      "INVALID_INPUT",
    );
    await expectErrorCode(
      mod.sendNimPayment({
        recipient: ADDRESS,
        valueLuna: 1_000,
        data: "\u20ac".repeat(22),
      }),
      "INVALID_INPUT",
    );
    expect(provider.sendBasicTransactionWithData).not.toHaveBeenCalled();

    const accepted = await mod.sendNimPayment({
      recipient: ADDRESS,
      valueLuna: 1_000,
      data: "x".repeat(64),
    });
    expect(accepted.reference).toBe(REFERENCE);
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledTimes(1);
  });

  it("sends the exact validated recipient, Luna amount, and data", async () => {
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    const result = await mod.sendNimPayment({
      recipient: ADDRESS,
      valueLuna: 250_000,
      data: "veyronis:agreement:42",
    });

    expect(provider.listAccounts).toHaveBeenCalledTimes(1);
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledTimes(1);
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: ADDRESS,
      value: 250_000,
      data: "veyronis:agreement:42",
    });
    expect(result).toEqual({ sender: ADDRESS, reference: REFERENCE });
  });

  it("forwards an explicit fee and never defaults one", async () => {
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await mod.sendNimPayment({
      recipient: ADDRESS,
      valueLuna: 1_000,
      data: "veyronis",
      feeLuna: 1,
    });

    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: ADDRESS,
      value: 1_000,
      data: "veyronis",
      fee: 1,
    });
  });

  it("performs no network calls of its own", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = createProvider();
    sdk.init.mockResolvedValue(provider);
    installNimiqPayHost();
    const mod = await loadModule();

    await mod.sendNimPayment({
      recipient: ADDRESS,
      valueLuna: 1_000,
      data: "veyronis",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledTimes(1);
  });
});
