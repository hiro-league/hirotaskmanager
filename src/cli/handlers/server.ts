import { parsePortOption } from "../lib/command-helpers";
import type { CliContext } from "./context";

export async function handleServerStart(
  ctx: CliContext,
  options: {
    background?: boolean;
    dataDir?: string;
    port?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const dataDir = ctx.resolveDataDir({ dataDir: options.dataDir });

  if (options.background) {
    const status = await ctx.startServer({ dataDir, port }, true);
    ctx.printJson(status);
    return;
  }

  // Run in production mode so the installed CLI uses a stable home data directory by default.
  await ctx.startServer({ dataDir, port }, false);
}

export async function handleServerStatus(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const status = await ctx.readServerStatus({ port });
  ctx.printJson(status);
}
