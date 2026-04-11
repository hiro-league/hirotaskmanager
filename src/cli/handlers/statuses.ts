import { runStatusesList } from "../lib/read/statuses";
import type { CliContext } from "./context";

export async function handleStatusesList(
  ctx: CliContext,
  options: { fields?: string },
): Promise<void> {
  await runStatusesList(ctx, options);
}
