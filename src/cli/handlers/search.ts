import type { PaginatedListBody } from "../../shared/pagination";
import type { SearchHit } from "../../shared/models";
import {
  parseLimitOption,
  parseOptionalOffset,
  parsePortOption,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "../lib/command-helpers";
import { fetchAllPages } from "../lib/paginatedFetch";
import {
  FIELDS_SEARCH_HIT,
  parseAndValidateFields,
  projectPaginatedItems,
} from "../lib/jsonFieldProjection";
import {
  COLUMNS_SEARCH_HITS,
  QUIET_DEFAULT_SEARCH_HIT,
} from "../lib/listTableSpecs";
import { CLI_ERR } from "../lib/cli-error-codes";
import { CliError, printPaginatedListRead } from "../lib/output";
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
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const q = queryParts.join(" ").trim();
  if (!q) {
    throw new CliError("Query required", 2, { code: CLI_ERR.missingRequired });
  }
  const limit = parseLimitOption(options.limit);
  const offset = parseOptionalOffset(options.offset);
  const pageAll = options.pageAll === true;
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_SEARCH_HIT);
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);

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

  if (!pageAll) {
    const body = await ctx.fetchApi<PaginatedListBody<SearchHit>>(
      `/search?${buildParams(offset, limit).toString()}`,
      { port },
    );
    const rows = fieldKeys ? projectPaginatedItems(body, fieldKeys).items : body.items;
    printPaginatedListRead(body, rows, COLUMNS_SEARCH_HITS, {
      defaultKeys: QUIET_DEFAULT_SEARCH_HIT,
      explicitField: quietExplicit,
    });
    return;
  }

  const merged = await fetchAllPages(async (off) => {
    return ctx.fetchApi<PaginatedListBody<SearchHit>>(
      `/search?${buildParams(off, limit).toString()}`,
      { port },
    );
  }, limit);
  const rows = fieldKeys
    ? projectPaginatedItems(merged, fieldKeys).items
    : merged.items;
  printPaginatedListRead(merged, rows, COLUMNS_SEARCH_HITS, {
    defaultKeys: QUIET_DEFAULT_SEARCH_HIT,
    explicitField: quietExplicit,
  });
}
