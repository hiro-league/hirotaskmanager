import { CLI_ERR } from "../types/errors";
import { CliError } from "../lib/output/output";
import type { CliContext } from "./context";

export async function handleServerStart(
  ctx: CliContext,
  options: {
    background?: boolean;
    foreground?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort();

  if (options.background && options.foreground) {
    throw new CliError("Choose either --background or --foreground", 2, {
      code: CLI_ERR.invalidValue,
    });
  }

  // Default to background so `hirotm server start` stays script/agent-friendly
  // unless the caller explicitly asks to keep logs attached.
  const startMode = options.foreground ? "foreground" : "background";

  if (startMode === "background") {
    const status = await ctx.startServer({ port }, startMode);
    ctx.printJson(status);
    return;
  }

  // Run in production mode so the installed CLI uses a stable home data directory by default.
  await ctx.startServer({ port }, startMode);
}

export async function handleServerStatus(ctx: CliContext): Promise<void> {
  const port = ctx.resolvePort();
  const status = await ctx.readServerStatus({ port });
  ctx.printJson(status);
}

export async function handleServerStop(ctx: CliContext): Promise<void> {
  const port = ctx.resolvePort();
  const status = await ctx.stopServer({ port });
  ctx.printJson(status);
}
