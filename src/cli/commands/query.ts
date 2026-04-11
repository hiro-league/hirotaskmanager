import { Command } from "commander";
import type { CliContext } from "../types/context";
import { handleSearch } from "../handlers/search";
import {
  addClientNameOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/command-helpers";
import { CLI_DEFAULTS } from "../lib/constants";

export function registerQueryCommands(
  program: Command,
  ctx: CliContext,
): void {
  const query = program
    .command("query")
    .description("Read-only queries across boards (search, etc.)");

  addClientNameOption(
    query
      .command("search")
      .description(
        "Search tasks (title, body, list name, group & status labels) via FTS5",
      )
      .argument("<query...>", "Search query (quote phrases with spaces)")
      .option("--board <id-or-slug>", "Limit results to one board")
      .option(
        "--limit <n>",
        `Page size (default ${CLI_DEFAULTS.DEFAULT_SEARCH_LIMIT}, max ${CLI_DEFAULTS.MAX_PAGE_LIMIT})`,
      )
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
    cliAction(
      (
        queryParts: string[],
        options: {
          board?: string;
          limit?: string;
          offset?: string;
          pageAll?: boolean;
          noPrefix?: boolean;
          fields?: string;
        },
      ) => handleSearch(ctx, queryParts, options),
    ),
  );
}
