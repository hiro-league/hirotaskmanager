import { Command } from "commander";
import type { CliContext } from "../types/context";
import { handleSearch } from "../handlers/search";
import {
  addClientNameOption,
  addCountOnlyOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
} from "../lib/core/command-helpers";
import { CLI_DEFAULTS } from "../lib/core/constants";
import { HELP_AFTER_QUERY_GROUP } from "../lib/core/cliCommandHelp";

export function registerQueryCommands(
  program: Command,
  ctx: CliContext,
): void {
  const query = program
    .command("query")
    .description("Read-only queries across boards (search, etc.)")
    .addHelpText("after", HELP_AFTER_QUERY_GROUP);

  addClientNameOption(
    addCountOnlyOption(
      query
        .command("search")
        .description(
          "Search tasks (title, body, list name, group & status labels)",
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
          `Fetch all pages (up to ${CLI_DEFAULTS.MAX_PAGE_LIMIT})`,
        )
        .option(
          "--no-prefix",
          "Exact match only",
        )
        .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
        .addHelpText("after", HELP_AFTER_QUERY_GROUP),
    ),
  ).action(
    cliAction(
      (
        queryParts: string[],
        options: {
          board?: string;
          limit?: string;
          offset?: string;
          pageAll?: boolean;
          countOnly?: boolean;
          noPrefix?: boolean;
          fields?: string;
        },
      ) => handleSearch(ctx, queryParts, options),
    ),
  );
}
