import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import { handleSearch } from "../handlers/search";
import {
  addPortOption,
  CLI_FIELDS_OPTION_DESC,
  withCliErrors,
} from "../lib/command-helpers";

export function registerQueryCommands(
  program: Command,
  ctx: CliContext,
): void {
  const query = program
    .command("query")
    .description("Read-only queries across boards (search, etc.)");

  addPortOption(
    query
      .command("search")
      .description(
        "Search tasks (title, body, list name, group & status labels) via FTS5",
      )
      .argument("<query...>", "Search query (quote phrases with spaces)")
      .option("--board <id-or-slug>", "Limit results to one board")
      .option("--limit <n>", "Page size (default 20, max 500)")
      .option("--offset <n>", "Skip this many hits (default 0)")
      .option(
        "--page-all",
        "Fetch every page at the current --limit and merge into one result set",
      )
      .option(
        "--no-prefix",
        "Do not add * to the last token (exact token only). Default matches prefixes (drag finds dragging); this flag does not",
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC),
  ).action(
    async (
      queryParts: string[],
      options: {
        port?: string;
        board?: string;
        limit?: string;
        offset?: string;
        pageAll?: boolean;
        noPrefix?: boolean;
        fields?: string;
      },
    ) => {
      await withCliErrors(() => handleSearch(ctx, queryParts, options));
    },
  );
}
