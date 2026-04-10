import type { PaginatedListBody } from "../../shared/pagination";
import type { SearchHit } from "../../shared/models";
import {
  parseLimitOption,
  parseOptionalOffset,
  parsePortOption,
} from "../lib/command-helpers";
import { fetchAllPages } from "../lib/paginatedFetch";
import {
  FIELDS_SEARCH_HIT,
  parseAndValidateFields,
  projectPaginatedItems,
} from "../lib/jsonFieldProjection";
import { CLI_ERR } from "../lib/cli-error-codes";
import { CliError } from "../lib/output";
import type { CliContext } from "./context";

export async function handleSearch(
  ctx: CliContext,
  queryParts: string[],
  options: {
    port?: string;
    board?: string;
    limit?: string;
    offset?: string;
    format?: string;
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
  const fmt = (options.format ?? "json").toLowerCase();
  if (fmt !== "json" && fmt !== "table") {
    throw new CliError("Invalid --format (use json or table)", 2, {
      code: CLI_ERR.invalidValue,
      format: options.format,
    });
  }
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_SEARCH_HIT);
  if (fieldKeys && fmt === "table") {
    throw new CliError("--fields applies to JSON only (omit or use --format json)", 2, {
      code: CLI_ERR.invalidValue,
      format: options.format,
    });
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

  if (!pageAll) {
    const body = await ctx.fetchApi<PaginatedListBody<SearchHit>>(
      `/search?${buildParams(offset, limit).toString()}`,
      { port },
    );
    if (fmt === "table") {
      ctx.printSearchTable(body.items);
    } else {
      ctx.printJson(
        fieldKeys ? projectPaginatedItems(body, fieldKeys) : body,
      );
    }
    return;
  }

  const merged = await fetchAllPages(async (off) => {
    return ctx.fetchApi<PaginatedListBody<SearchHit>>(
      `/search?${buildParams(off, limit).toString()}`,
      { port },
    );
  }, limit);
  if (fmt === "table") {
    ctx.printSearchTable(merged.items);
  } else {
    ctx.printJson(
      fieldKeys ? projectPaginatedItems(merged, fieldKeys) : merged,
    );
  }
}
