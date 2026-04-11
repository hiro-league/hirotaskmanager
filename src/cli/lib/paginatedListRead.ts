/**
 * Shared "validate fields → parse limit/offset → single page or page-all → project → print"
 * for list-style reads (see docs/cli-architecture-review.md §2).
 */
import {
  parseLimitOption,
  parseOptionalListLimit,
  parseOptionalOffset,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "./command-helpers";
import { CLI_DEFAULTS } from "./constants";
import { fetchAllPages } from "./paginatedFetch";
import { parseAndValidateFields, projectPaginatedItems } from "./jsonFieldProjection";
import { printPaginatedListRead } from "./output";
import type {
  PaginatedListReadCliOptions,
  PaginatedListReadSpec,
} from "../types/options";

export type {
  OptionalLimitPaginatedSpec,
  PaginatedListFetch,
  PaginatedListReadCliOptions,
  PaginatedListReadSpec,
  SearchPaginatedSpec,
} from "../types/options";

export async function executePaginatedListRead<T extends object>(
  spec: PaginatedListReadSpec<T>,
  options: PaginatedListReadCliOptions,
): Promise<void> {
  const fieldKeys = parseAndValidateFields(
    options.fields,
    spec.fieldAllowlist,
  );
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);

  if (spec.kind === "optionalLimit") {
    const limitOpt = parseOptionalListLimit(options.limit);
    const offsetOpt = parseOptionalOffset(options.offset);
    const pageAll = options.pageAll === true;
    const { basePath, extraParams, fetchPage } = spec;

    if (!pageAll) {
      const q =
        extraParams != null
          ? new URLSearchParams(extraParams)
          : new URLSearchParams();
      if (limitOpt != null) {
        q.set("limit", String(limitOpt));
      }
      if (offsetOpt > 0) {
        q.set("offset", String(offsetOpt));
      }
      const suffix = q.toString() ? `?${q.toString()}` : "";
      const body = await fetchPage(`${basePath}${suffix}`);
      const rows = fieldKeys
        ? projectPaginatedItems(body, fieldKeys).items
        : body.items;
      printPaginatedListRead(body, rows, spec.columns, {
        defaultKeys: spec.quietDefaults,
        explicitField: quietExplicit,
      });
      return;
    }

    const pageSize = limitOpt ?? CLI_DEFAULTS.MAX_PAGE_LIMIT;
    const merged = await fetchAllPages(async (offset) => {
      const q =
        extraParams != null
          ? new URLSearchParams(extraParams)
          : new URLSearchParams();
      q.set("limit", String(pageSize));
      if (offset > 0) {
        q.set("offset", String(offset));
      }
      return fetchPage(`${basePath}?${q.toString()}`);
    }, pageSize);
    const mergedRows = fieldKeys
      ? projectPaginatedItems(merged, fieldKeys).items
      : merged.items;
    printPaginatedListRead(merged, mergedRows, spec.columns, {
      defaultKeys: spec.quietDefaults,
      explicitField: quietExplicit,
    });
    return;
  }

  const limit = parseLimitOption(options.limit);
  const offset = parseOptionalOffset(options.offset);
  const pageAll = options.pageAll === true;
  const { fetchPage, buildPath } = spec;

  if (!pageAll) {
    const body = await fetchPage(buildPath(offset, limit));
    const rows = fieldKeys
      ? projectPaginatedItems(body, fieldKeys).items
      : body.items;
    printPaginatedListRead(body, rows, spec.columns, {
      defaultKeys: spec.quietDefaults,
      explicitField: quietExplicit,
    });
    return;
  }

  const merged = await fetchAllPages(async (off) => {
    return fetchPage(buildPath(off, limit));
  }, limit);
  const rows = fieldKeys
    ? projectPaginatedItems(merged, fieldKeys).items
    : merged.items;
  printPaginatedListRead(merged, rows, spec.columns, {
    defaultKeys: spec.quietDefaults,
    explicitField: quietExplicit,
  });
}
