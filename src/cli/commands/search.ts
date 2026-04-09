import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import { handleSearch } from "../handlers/search";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerSearchCommand(
  program: Command,
  ctx: CliContext,
): void {
  addPortOption(
    program
      .command("search")
      .description(
        "Search tasks (title, body, list name, group & status labels) via FTS5",
      )
      .argument("<query...>", "Search query (quote phrases with spaces)")
      .option("--board <id-or-slug>", "Limit results to one board")
      .option("--limit <n>", "Max results (default 20, max 50)")
      .option(
        "--format <fmt>",
        "Output format: json (default) or table",
        "json",
      )
      .option(
        "--no-prefix",
        "Do not add * to the last token (exact token only). Default matches prefixes (drag finds dragging); this flag does not",
      ),
  ).action(
    async (
      queryParts: string[],
      options: {
        port?: string;
        board?: string;
        limit?: string;
        format?: string;
        noPrefix?: boolean;
      },
    ) => {
      await withCliErrors(() => handleSearch(ctx, queryParts, options));
    },
  );
}
