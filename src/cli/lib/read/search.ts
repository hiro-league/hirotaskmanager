import type { PaginatedListBody } from "../../../shared/pagination";
import type { SearchHit } from "../../../shared/models";
import { FIELDS_SEARCH_HIT } from "../jsonFieldProjection";
import {
  COLUMNS_SEARCH_HITS,
  QUIET_DEFAULT_SEARCH_HIT,
} from "../listTableSpecs";
import { executePaginatedListRead } from "../paginatedListRead";
import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output";
import type { CliContext } from "../../types/context";

/** FTS search across boards (`GET /search`). */
export async function runSearch(
  ctx: CliContext,
  queryParts: string[],
  options: {
    board?: string;
    limit?: string;
    offset?: string;
    noPrefix?: boolean;
    pageAll?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  const q = queryParts.join(" ").trim();
  if (!q) {
    throw new CliError("Query required", 2, { code: CLI_ERR.missingRequired });
  }

  const buildParams = (off: number, lim: number) => {
    const params = new URLSearchParams();
    params.set("q", q);
    params.set("limit", String(lim));
    if (off > 0) {
      params.set("offset", String(off));
    }
    if (options.board?.trim()) {
      params.set("board", options.board.trim());
    }
    if (options.noPrefix) {
      params.set("prefix", "0");
    }
    return params;
  };

  await executePaginatedListRead(
    {
      kind: "search",
      fieldAllowlist: FIELDS_SEARCH_HIT,
      columns: COLUMNS_SEARCH_HITS,
      quietDefaults: QUIET_DEFAULT_SEARCH_HIT,
      buildPath: (off, lim) => `/search?${buildParams(off, lim).toString()}`,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<SearchHit>>(path, { port }),
    },
    {
      limit: options.limit,
      offset: options.offset,
      pageAll: options.pageAll,
      fields: options.fields,
    },
  );
}
