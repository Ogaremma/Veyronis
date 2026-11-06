const DEFAULT_GRACE_PERIOD_MS = 130_000;

export type ShutdownResult = "clean" | "forced" | "failed";

type ShutdownServer = {
  close(callback: (error?: Error) => void): void;
  closeIdleConnections(): void;
  closeAllConnections(): void;
};

type ShutdownDatabase = {
  end(): Promise<void>;
};

type ShutdownLogger = {
  log(message: string): void;
  error(message: string, error?: unknown): void;
};

type ShutdownOptions = {
  server: ShutdownServer;
  database: ShutdownDatabase;
  gracePeriodMs?: number;
  logger?: ShutdownLogger;
};

export function createGracefulShutdown({
  server,
  database,
  gracePeriodMs = DEFAULT_GRACE_PERIOD_MS,
  logger = console,
}: ShutdownOptions): (signal: NodeJS.Signals) => Promise<ShutdownResult> {
  let shutdown: Promise<ShutdownResult> | undefined;

  return (signal) => {
    shutdown ??= runShutdown(signal, {
      server,
      database,
      gracePeriodMs,
      logger,
    });
    return shutdown;
  };
}

async function runShutdown(
  signal: NodeJS.Signals,
  { server, database, gracePeriodMs, logger }: Required<ShutdownOptions>,
): Promise<ShutdownResult> {
  logger.log(`Received ${signal}; stopping Veyronis agreement backend`);

  let forced = false;
  let failed = false;

  const forceTimer = setTimeout(() => {
    forced = true;
    logger.error(
      `Graceful shutdown exceeded ${gracePeriodMs}ms; closing remaining HTTP connections`,
    );
    server.closeAllConnections();
  }, gracePeriodMs);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeIdleConnections();
    });
  } catch (error) {
    failed = true;
    logger.error("Failed to close HTTP server cleanly", error);
  } finally {
    clearTimeout(forceTimer);
  }

  try {
    await database.end();
  } catch (error) {
    failed = true;
    logger.error("Failed to close PostgreSQL pool cleanly", error);
  }

  if (failed) return "failed";

  logger.log(
    forced
      ? "Veyronis agreement backend force-stopped"
      : "Veyronis agreement backend stopped",
  );
  return forced ? "forced" : "clean";
}
