import type { Status } from "../../shared/models";
import { parsePortOption } from "../lib/command-helpers";
import type { CliContext } from "./context";

export async function handleStatusesList(
  ctx: CliContext,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const statuses = await ctx.fetchApi<Status[]>("/statuses", { port });
  ctx.printJson(statuses);
}
