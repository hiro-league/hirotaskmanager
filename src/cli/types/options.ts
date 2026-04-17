import type { PaginatedListBody } from "../../shared/pagination";
import type { TableColumn } from "./output";

/** Shared text-input sources for `resolveExclusiveTextInput` / task body flags. */
export type TextInputSource = "flag" | "file" | "stdin";

/**
 * Destructive / high-impact `hirotm` mutations: interactive confirm or `--yes`.
 */
export type ConfirmMutableActionArgs = {
  /** Set when the user passed `-y` / `--yes`. */
  yes: boolean;
  /** Human-readable lines printed to stderr before prompt or before the non-interactive error. */
  impactLines: readonly string[];
  /**
   * When true, stdin is reserved for payload data (`--stdin`); never prompt on stdin.
   * Without `--yes`, prints impact and exits 2 (same code as non-TTY).
   */
  stdinReservedForPayload?: boolean;
};

export type PaginatedListFetch<T> = (
  path: string,
) => Promise<PaginatedListBody<T>>;

export type PaginatedListReadCliOptions = {
  limit?: string;
  offset?: string;
  pageAll?: boolean;
  /** When true, fetch total only (HTTP `limit=0`); incompatible with paging/fields flags. */
  countOnly?: boolean;
  fields?: string;
};

type CommonPaginatedSpec<T> = {
  /** Same allowlists as `parseAndValidateFields` in `jsonFieldProjection.ts`. */
  fieldAllowlist: ReadonlySet<string>;
  columns: readonly TableColumn[];
  quietDefaults: readonly string[];
  fetchPage: PaginatedListFetch<T>;
};

/** Lists where `limit` is optional (omit = server default page) and page-all uses `MAX_PAGE_LIMIT` unless `--limit` set. */
export type OptionalLimitPaginatedSpec<T> = CommonPaginatedSpec<T> & {
  kind: "optionalLimit";
  /** Path without query, e.g. `/boards` or `/boards/x/tasks`. */
  basePath: string;
  /** Non-pagination filters merged into each request's query string. */
  extraParams?: URLSearchParams;
};

/** Search: always sends `limit` (default `DEFAULT_SEARCH_LIMIT`); page-all uses that as page size. */
export type SearchPaginatedSpec<T> = CommonPaginatedSpec<T> & {
  kind: "search";
  buildPath: (offset: number, limit: number) => string;
};

export type PaginatedListReadSpec<T> =
  | OptionalLimitPaginatedSpec<T>
  | SearchPaginatedSpec<T>;
