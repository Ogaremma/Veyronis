import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "./graceful-shutdown.js";

const logger = {
  log: vi.fn(),
  error: vi.fn(),
};

function createServer() {
  return {
    close: vi.fn((callback: (error?: Error) => void) => callback()),
    closeIdleConnections: vi.fn(),
    closeAllConnections: vi.fn(),
  };
}

describe("createGracefulShutdown", () => {
  it("closes the HTTP server and database exactly once", async () => {
    const server = createServer();
    const database = { end: vi.fn(async () => undefined) };
    const shutdown = createGracefulShutdown({
      server,
      database,
      gracePeriodMs: 1_000,
      logger,
    });

    const results = await Promise.all([
      shutdown("SIGTERM"),
      shutdown("SIGTERM"),
      shutdown("SIGINT"),
    ]);

    expect(results).toEqual(["clean", "clean", "clean"]);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(database.end).toHaveBeenCalledTimes(1);
  });

  it("forces remaining HTTP connections closed after the grace period", async () => {
    vi.useFakeTimers();
    let closeCallback: ((error?: Error) => void) | undefined;
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        closeCallback = callback;
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    };
    const database = { end: vi.fn(async () => undefined) };
    const shutdown = createGracefulShutdown({
      server,
      database,
      gracePeriodMs: 50,
      logger,
    });

    const result = shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(50);

    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    closeCallback?.();

    await expect(result).resolves.toBe("forced");
    expect(database.end).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reports failure but still attempts to close the database", async () => {
    const server = createServer();
    server.close.mockImplementation((callback) =>
      callback(new Error("server close failed")),
    );
    const database = {
      end: vi.fn(async () => {
        throw new Error("pool close failed");
      }),
    };
    const shutdown = createGracefulShutdown({
      server,
      database,
      gracePeriodMs: 1_000,
      logger,
    });

    await expect(shutdown("SIGTERM")).resolves.toBe("failed");
    expect(database.end).toHaveBeenCalledTimes(1);
  });
});
