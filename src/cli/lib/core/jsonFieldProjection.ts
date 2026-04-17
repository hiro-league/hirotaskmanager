import type { PaginatedListBody } from "../../../shared/pagination";
import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output/output";

/**
 * Allowlists for `hirotm --fields` (CLI-only projection after API fetch).
 * Keys match the HTTP JSON contract from `src/shared/models.ts` and `trashApi.ts`.
 */

/** `boards list` → each {@link BoardIndexEntry}. */
export const FIELDS_BOARD_INDEX = new Set([
  "boardId",
  "slug",
  "name",
  "emoji",
  "description",
  "cliPolicy",
  "createdAt",
]);

/** `tasks list` → each {@link Task}. */
export const FIELDS_TASK = new Set([
  "taskId",
  "boardId",
  "boardSlug",
  "listId",
  "title",
  "body",
  "groupId",
  "priorityId",
  "status",
  "order",
  "color",
  "emoji",
  "createdAt",
  "updatedAt",
  "closedAt",
  "createdByPrincipal",
  "createdByLabel",
  "releaseId",
]);

/** `releases list` / `releases show` → {@link ReleaseDefinition}. */
export const FIELDS_RELEASE = new Set([
  "releaseId",
  "name",
  "color",
  "releaseDate",
  "createdAt",
]);

/** `lists list` → each board list row (`List` in `src/shared/models.ts`). */
export const FIELDS_LIST = new Set([
  "listId",
  "boardId",
  "boardSlug",
  "name",
  "order",
  "color",
  "emoji",
  "createdByPrincipal",
  "createdByLabel",
]);

/** `query search` (JSON) → {@link SearchHit}. */
export const FIELDS_SEARCH_HIT = new Set([
  "taskId",
  "boardId",
  "boardSlug",
  "boardName",
  "listId",
  "listName",
  "title",
  "snippet",
  "score",
]);

/** `trash list boards` → {@link TrashedBoardItem}. */
export const FIELDS_TRASH_BOARD = new Set([
  "type",
  "boardId",
  "name",
  "slug",
  "emoji",
  "deletedAt",
  "canRestore",
]);

/** `trash list lists` → {@link TrashedListItem}. */
export const FIELDS_TRASH_LIST = new Set([
  "type",
  "listId",
  "name",
  "emoji",
  "boardId",
  "boardName",
  "boardDeletedAt",
  "deletedAt",
  "canRestore",
]);

/** `trash list tasks` → {@link TrashedTaskItem}. */
export const FIELDS_TRASH_TASK = new Set([
  "type",
  "taskId",
  "title",
  "emoji",
  "boardId",
  "boardName",
  "boardDeletedAt",
  "listId",
  "listName",
  "listDeletedAt",
  "deletedAt",
  "canRestore",
]);

/** `statuses list` → {@link Status}. */
export const FIELDS_STATUS = new Set([
  "statusId",
  "label",
  "sortOrder",
  "isClosed",
]);

export function parseFieldsCsv(raw: string | undefined): string[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

/**
 * Validates requested names against an allowlist; returns undefined if `raw` empty.
 * Reason: stable agent-facing errors for typos in `--fields`.
 */
export function parseAndValidateFields(
  raw: string | undefined,
  allowlist: ReadonlySet<string>,
): string[] | undefined {
  const fields = parseFieldsCsv(raw);
  if (!fields) return undefined;
  const unknown = fields.filter((f) => !allowlist.has(f));
  if (unknown.length > 0) {
    throw new CliError(
      `Invalid --fields (unknown: ${unknown.join(", ")})`,
      2,
      { code: CLI_ERR.invalidValue, fields: raw, unknown },
    );
  }
  return fields;
}

/** Pick listed keys in order; omit keys missing on the value (sparse APIs). */
export function projectRecord(obj: object, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rec = obj as Record<string, unknown>;
  for (const k of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      out[k] = rec[k];
    }
  }
  return out;
}

export function projectPaginatedItems<T extends object>(
  body: PaginatedListBody<T>,
  fields: string[],
): PaginatedListBody<Record<string, unknown>> {
  return {
    total: body.total,
    limit: body.limit,
    offset: body.offset,
    items: body.items.map((row) => projectRecord(row, fields)),
  };
}

export function projectArrayItems<T extends object>(
  rows: T[],
  fields: string[],
): Record<string, unknown>[] {
  return rows.map((row) => projectRecord(row, fields));
}
