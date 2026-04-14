import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getServerPidFilePath,
  resolveDataDir,
  resolvePort,
  resolveProfileName,
  resolveRuntimeKind,
  type ConfigOverrides,
} from "./config";
import { fetchHealth } from "./api-client";
import { CLI_DEFAULTS, CLI_POLLING } from "./constants";
import { CLI_ERR } from "../types/errors";
import type { ServerStatus } from "../types/config";
import { CliError } from "./output";

interface ManagedServerRecord {
  pid: number;
  port: number;
  startedAt: string;
}

export type { ServerStatus };

type ServerReadyCallback = (status: ServerStatus) => void | Promise<void>;

function getPidFilePath(overrides: ConfigOverrides = {}): string {
  return getServerPidFilePath(overrides);
}

function readManagedServerRecord(overrides: ConfigOverrides = {}): ManagedServerRecord | null {
  const pidFilePath = getPidFilePath(overrides);
  if (!existsSync(pidFilePath)) return null;

  try {
    const raw = readFileSync(pidFilePath, "utf8");
    return JSON.parse(raw) as ManagedServerRecord;
  } catch {
    return null;
  }
}

function writeManagedServerRecord(
  record: ManagedServerRecord,
  overrides: ConfigOverrides = {},
): void {
  const pidFilePath = getPidFilePath(overrides);
  mkdirSync(path.dirname(pidFilePath), { recursive: true });
  writeFileSync(pidFilePath, JSON.stringify(record, null, 2));
}

function removeManagedServerRecord(overrides: ConfigOverrides = {}): void {
  const pidFilePath = getPidFilePath(overrides);
  if (existsSync(pidFilePath)) rmSync(pidFilePath, { force: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchHealth({ port })) return true;
    await Bun.sleep(CLI_POLLING.HEALTH_INTERVAL_MS);
  }

  return false;
}

function getServerEntryPath(overrides: ConfigOverrides): string {
  const runtime = resolveRuntimeKind(overrides);
  const entrypoint =
    runtime === "dev"
      ? "../../server/bootstrapDev.ts"
      : "../../server/bootstrapInstalled.ts";
  return fileURLToPath(new URL(entrypoint, import.meta.url));
}

function buildServerEnv(overrides: ConfigOverrides): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TASKMANAGER_RUNTIME: resolveRuntimeKind(overrides),
  };
  delete env.TASKMANAGER_PORT;

  // Pass the resolved data directory explicitly so the child process uses the
  // same profile-aware runtime config as the parent command.
  env.TASKMANAGER_DATA_DIR = resolveDataDir(overrides);

  return env;
}

export async function readServerStatus(
  overrides: ConfigOverrides = {},
): Promise<ServerStatus> {
  const port = resolvePort(overrides);
  const healthy = await fetchHealth(overrides);
  const managedRecord = readManagedServerRecord(overrides);

  if (healthy) {
    if (managedRecord && !isProcessAlive(managedRecord.pid)) {
      removeManagedServerRecord(overrides);
      return {
        port,
        running: true,
        url: `http://127.0.0.1:${port}`,
      };
    }

    return {
      pid: managedRecord?.pid,
      port,
      running: true,
      url: `http://127.0.0.1:${port}`,
    };
  }

  if (managedRecord && !isProcessAlive(managedRecord.pid)) {
    removeManagedServerRecord(overrides);
  }

  return { running: false };
}

export async function startServer(
  overrides: ConfigOverrides = {},
  background = false,
  onReady?: ServerReadyCallback,
): Promise<ServerStatus> {
  const port = overrides.port;
  if (!port) {
    throw new CliError("Port is required", 2, { code: CLI_ERR.missingRequired });
  }

  const currentStatus = await readServerStatus({ ...overrides, port });
  if (currentStatus.running) {
    if (onReady) await onReady(currentStatus);
    return currentStatus;
  }

  const resolvedPort = resolvePort({ ...overrides, port: overrides.port });
  const child = Bun.spawn({
    // Profile and port are passed on argv (bootstrap parsers); do not rely on TASKMANAGER_* env for these.
    cmd: [
      process.execPath,
      getServerEntryPath(overrides),
      "--profile",
      resolveProfileName(overrides),
      "--port",
      String(resolvedPort),
    ],
    cwd: process.cwd(),
    detached: background,
    env: buildServerEnv({ ...overrides, port }),
    stderr: background ? "ignore" : "inherit",
    stdin: background ? "ignore" : "inherit",
    stdout: background ? "ignore" : "inherit",
  });

  if (background) {
    child.unref();

    const healthy = await waitForHealth(port, CLI_DEFAULTS.SERVER_START_WAIT_MS);
    if (!healthy) {
      throw new CliError("Server failed to start", 7, {
        code: CLI_ERR.serverStartTimeout,
        retryable: true,
        hint: "Try running `hirotm server start` without --background to inspect logs.",
        url: `http://127.0.0.1:${port}`,
      });
    }

    if (onReady) {
      await onReady({
        pid: child.pid,
        port,
        running: true,
        url: `http://127.0.0.1:${port}`,
      });
    }

    // Persist the pid so later status calls can report a CLI-managed background server.
    writeManagedServerRecord({
      pid: child.pid,
      port,
      startedAt: new Date().toISOString(),
    }, overrides);

    return {
      pid: child.pid,
      port,
      running: true,
      url: `http://127.0.0.1:${port}`,
    };
  }

  // Wait for health before handing control back to the launcher so first-run
  // browser open can happen without hiding the server logs users need.
  const healthy = await waitForHealth(port, CLI_DEFAULTS.SERVER_START_WAIT_MS);
  if (!healthy) {
    child.kill("SIGTERM");
    throw new CliError("Server failed to start", 7, {
      code: CLI_ERR.serverStartTimeout,
      retryable: true,
      hint: "Try running `hirotm server start` to inspect startup logs directly.",
      url: `http://127.0.0.1:${port}`,
    });
  }

  if (onReady) {
    await onReady({
      pid: child.pid,
      port,
      running: true,
      url: `http://127.0.0.1:${port}`,
    });
  }

  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  const exitCode = await child.exited;
  process.off("SIGINT", forwardSignal);
  process.off("SIGTERM", forwardSignal);

  if (exitCode !== 0) {
    throw new CliError("Server exited unexpectedly", 1, {
      code: CLI_ERR.serverExited,
      childExitCode: exitCode,
    });
  }

  return {
    port,
    running: false,
  };
}

/**
 * Stop a background server previously started by this CLI (pid file). Foreground
 * servers and non-CLI processes are not tracked here.
 */
export async function stopServer(
  overrides: ConfigOverrides = {},
): Promise<ServerStatus> {
  const port = resolvePort(overrides);
  const record = readManagedServerRecord(overrides);

  if (!record) {
    throw new CliError(
      "No CLI-managed background server for this profile (missing pid file)",
      1,
      {
        code: CLI_ERR.noManagedServer,
        hint:
          "Use Ctrl+C if the server is running in the foreground, or stop the process listening on the API port.",
        port,
      },
    );
  }

  if (!isProcessAlive(record.pid)) {
    removeManagedServerRecord(overrides);
    throw new CliError(
      "Recorded server process is not running (removed stale pid file)",
      1,
      {
        code: CLI_ERR.stalePid,
        port: record.port,
      },
    );
  }

  try {
    process.kill(record.pid, "SIGTERM");
  } catch {
    removeManagedServerRecord(overrides);
    throw new CliError("Failed to signal server process", 1, {
      code: CLI_ERR.signalFailed,
      pid: record.pid,
      port: record.port,
    });
  }

  const waitPort = record.port;
  const deadline = Date.now() + CLI_DEFAULTS.SERVER_STOP_WAIT_MS;
  while (Date.now() < deadline) {
    if (!(await fetchHealth({ ...overrides, port: waitPort }))) {
      break;
    }
    await Bun.sleep(CLI_POLLING.FOREGROUND_PROGRESS_MS);
  }

  if (await fetchHealth({ ...overrides, port: waitPort })) {
    try {
      process.kill(record.pid, "SIGKILL");
    } catch {
      /* ignore */
    }
    await Bun.sleep(CLI_POLLING.BACKGROUND_WAIT_MS);
  }

  removeManagedServerRecord(overrides);

  return {
    pid: record.pid,
    port: waitPort,
    running: false,
  };
}
