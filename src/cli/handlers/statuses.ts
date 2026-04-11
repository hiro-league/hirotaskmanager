import { runStatusesList } from "../lib/read/statuses";
import type { CliContext } from "./context";

export async function handleStatusesList(
  ctx: CliContext,
  options: { port?: string; fields?: string },
): Promise<void> {
  await runStatusesList(ctx, options);
}
