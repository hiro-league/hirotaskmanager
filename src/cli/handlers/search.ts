import { runSearch } from "../lib/read/search";
import type { CliContext } from "./context";

export async function handleSearch(
  ctx: CliContext,
  queryParts: string[],
  options: {
    port?: string;
    board?: string;
    limit?: string;
    offset?: string;
    noPrefix?: boolean;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  await runSearch(ctx, queryParts, options);
}
