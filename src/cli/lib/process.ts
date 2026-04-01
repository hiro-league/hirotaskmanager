import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCliHomeDir, resolveDataDir, type ConfigOverrides } from "./config";
import { fetchHealth } from "./api-client";
import { CliError } from "./output";

interface ManagedServerRecord {
  pid: number;
  port: number;
  startedAt: string;
}

export interface ServerStatus {
  pid?: number;
  port?: number;
  running: boolean;
  url?: string;
}

function getPidFilePath(): string {
  return path.join(ensureCliHomeDir(), "server.pid.json");
}

function readManagedServerRecord(): ManagedServerRecord | null {
  const pidFilePath = getPidFilePath();
  if (!existsSync(pidFilePath)) return null;

  try {
    const raw = readFileSync(pidFilePath, "utf8");
    return JSON.parse(raw) as ManagedServerRecord;
  } catch {
    return null;
  }
}

function writeManagedServerRecord(record: ManagedServerRecord): void {
  writeFileSync(getPidFilePath(), JSON.stringify(record, null, 2));
}

function removeManagedServerRecord(): void {
  const pidFilePath = getPidFilePath();
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
    await Bun.sleep(250);
  }

  return false;
}

function getServerEntryPath(): string {
  return fileURLToPath(new URL("../../server/index.ts", import.meta.url));
}

function buildServerEnv(overrides: ConfigOverrides): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(overrides.port),
  };

  const dataDir = resolveDataDir(overrides);
  if (dataDir) {
    // Propagate an explicit DATA_DIR so the installed CLI can use user-chosen storage.
    env.DATA_DIR = dataDir;
  }

  return env;
}

export async function readServerStatus(
  overrides: ConfigOverrides = {},
): Promise<ServerStatus> {
  const port = overrides.port;
  const healthy = await fetchHealth(overrides);
  const managedRecord = readManagedServerRecord();

  if (healthy) {
    if (managedRecord && !isProcessAlive(managedRecord.pid)) {
      removeManagedServerRecord();
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
    removeManagedServerRecord();
  }

  return { running: false };
}

export async function startServer(
  overrides: ConfigOverrides = {},
  background = false,
): Promise<ServerStatus> {
  const port = overrides.port;
  if (!port) {
    throw new CliError("Port is required", 2);
  }

  const currentStatus = await readServerStatus({ port });
  if (currentStatus.running) return currentStatus;

  const child = Bun.spawn({
    cmd: [process.execPath, getServerEntryPath()],
    cwd: process.cwd(),
    detached: background,
    env: buildServerEnv({ ...overrides, port }),
    stderr: background ? "ignore" : "inherit",
    stdin: background ? "ignore" : "inherit",
    stdout: background ? "ignore" : "inherit",
  });

  if (background) {
    child.unref();

    const healthy = await waitForHealth(port, 8000);
    if (!healthy) {
      throw new CliError("Server failed to start", 1, {
        hint: "Try running `hirotm start` without --background to inspect logs.",
        url: `http://127.0.0.1:${port}`,
      });
    }

    // Persist the pid so later status calls can report a CLI-managed background server.
    writeManagedServerRecord({
      pid: child.pid,
      port,
      startedAt: new Date().toISOString(),
    });

    return {
      pid: child.pid,
      port,
      running: true,
      url: `http://127.0.0.1:${port}`,
    };
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
    throw new CliError("Server exited unexpectedly", exitCode || 1);
  }

  return {
    port,
    running: false,
  };
}
