import type { SearchHit } from "../../shared/models";
import {
  parseLimitOption,
  parsePortOption,
} from "../lib/command-helpers";
import { CliError } from "../lib/output";
import type { CliContext } from "./context";

export async function handleSearch(
  ctx: CliContext,
  queryParts: string[],
  options: {
    port?: string;
    board?: string;
    limit?: string;
    format?: string;
    noPrefix?: boolean;
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const q = queryParts.join(" ").trim();
  if (!q) {
    throw new CliError("Query required", 2);
  }
  const limit = parseLimitOption(options.limit);
  const fmt = (options.format ?? "json").toLowerCase();
  if (fmt !== "json" && fmt !== "table") {
    throw new CliError("Invalid --format (use json or table)", 2, {
      format: options.format,
    });
  }
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(limit));
  if (options.board?.trim()) {
    params.set("board", options.board.trim());
  }
  if (options.noPrefix) {
    params.set("prefix", "0");
  }
  const hits = await ctx.fetchApi<SearchHit[]>(
    `/search?${params.toString()}`,
    { port },
  );
  if (fmt === "table") {
    ctx.printSearchTable(hits);
  } else {
    ctx.printJson(hits);
  }
}
