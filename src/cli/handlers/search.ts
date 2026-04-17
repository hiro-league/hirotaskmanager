import { runSearch } from "../lib/queries/search";
import type { CliContext } from "./context";

export async function handleSearch(
  ctx: CliContext,
  queryParts: string[],
  options: {
    board?: string;
    limit?: string;
    offset?: string;
    noPrefix?: boolean;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  await runSearch(ctx, queryParts, options);
}
