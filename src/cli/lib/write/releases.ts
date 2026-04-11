import type { PaginatedListBody } from "../../../shared/pagination";
import type { ReleaseDefinition } from "../../../shared/models";
import { fetchApi, fetchApiMutate } from "../api-client";
import { CLI_ERR } from "../cli-error-codes";
import {
  parseOptionalListLimit,
  parseOptionalOffset,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "../command-helpers";
import { COLUMNS_RELEASES_LIST, QUIET_DEFAULT_RELEASE } from "../listTableSpecs";
import { fetchAllPages } from "../paginatedFetch";
import {
  FIELDS_RELEASE,
  parseAndValidateFields,
  projectPaginatedItems,
  projectRecord,
} from "../jsonFieldProjection";
import { CliError, printJson, printPaginatedListRead } from "../output";
import { parsePositiveInt } from "./helpers";

async function fetchAllBoardReleases(
  port: number | undefined,
  boardId: string,
): Promise<ReleaseDefinition[]> {
  const pageSize = 500;
  const base = `/boards/${encodeURIComponent(boardId)}/releases`;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<ReleaseDefinition>>(
      `${base}?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items;
}

export async function runReleasesList(opts: {
  port?: number;
  board: string | undefined;
  limit?: string;
  offset?: string;
  pageAll?: boolean;
  fields?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const fieldKeys = parseAndValidateFields(opts.fields, FIELDS_RELEASE);
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);
  const limitOpt = parseOptionalListLimit(opts.limit);
  const offsetOpt = parseOptionalOffset(opts.offset);
  const pageAll = opts.pageAll === true;
  const base = `/boards/${encodeURIComponent(boardId)}/releases`;
  const port = opts.port;

  if (!pageAll) {
    const q = new URLSearchParams();
    if (limitOpt != null) {
      q.set("limit", String(limitOpt));
    }
    if (offsetOpt > 0) {
      q.set("offset", String(offsetOpt));
    }
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await fetchApi<PaginatedListBody<ReleaseDefinition>>(
      `${base}${suffix}`,
      { port },
    );
    const rows = fieldKeys ? projectPaginatedItems(body, fieldKeys).items : body.items;
    printPaginatedListRead(body, rows, COLUMNS_RELEASES_LIST, {
      defaultKeys: QUIET_DEFAULT_RELEASE,
      explicitField: quietExplicit,
    });
    return;
  }

  const pageSize = limitOpt ?? 500;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return fetchApi<PaginatedListBody<ReleaseDefinition>>(
      `${base}?${q.toString()}`,
      { port },
    );
  }, pageSize);
  const mergedRows = fieldKeys
    ? projectPaginatedItems(merged, fieldKeys).items
    : merged.items;
  printPaginatedListRead(merged, mergedRows, COLUMNS_RELEASES_LIST, {
    defaultKeys: QUIET_DEFAULT_RELEASE,
    explicitField: quietExplicit,
  });
}

export async function runReleasesShow(opts: {
  port?: number;
  board: string | undefined;
  releaseId: string | undefined;
  fields?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const fieldKeys = parseAndValidateFields(opts.fields, FIELDS_RELEASE);
  const rid = parsePositiveInt("releaseId", opts.releaseId);
  if (rid === undefined) {
    throw new CliError("Invalid release id", 2, {
      code: CLI_ERR.invalidValue,
      releaseId: opts.releaseId,
    });
  }
  const rows = await fetchAllBoardReleases(opts.port, boardId);
  const hit = rows.find((r) => r.releaseId === rid);
  if (!hit) {
    throw new CliError("Release not found", 3, {
      code: CLI_ERR.notFound,
      board: boardId,
      releaseId: rid,
    });
  }
  printJson(fieldKeys ? projectRecord(hit, fieldKeys) : hit);
}

export async function runReleasesAdd(opts: {
  port?: number;
  board: string | undefined;
  name?: string;
  color?: string;
  clearColor?: boolean;
  releaseDate?: string;
  clearReleaseDate?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const name = opts.name?.trim() ?? "";
  if (!name) {
    throw new CliError("Missing required option: --name", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  if (opts.clearColor && opts.color !== undefined) {
    throw new CliError("Cannot use --color together with --clear-color", 2, {
      code: CLI_ERR.mutuallyExclusiveOptions,
    });
  }
  if (opts.clearReleaseDate && opts.releaseDate !== undefined) {
    throw new CliError(
      "Cannot use --release-date together with --clear-release-date",
      2,
      { code: CLI_ERR.mutuallyExclusiveOptions },
    );
  }
  const body: Record<string, unknown> = { name };
  if (opts.clearColor) body.color = null;
  else if (opts.color !== undefined) body.color = opts.color.trim();
  if (opts.clearReleaseDate) body.releaseDate = null;
  else if (opts.releaseDate !== undefined) {
    body.releaseDate = opts.releaseDate.trim();
  }

  try {
    const created = await fetchApiMutate<ReleaseDefinition>(
      `/boards/${encodeURIComponent(boardId)}/releases`,
      { method: "POST", body },
      { port: opts.port },
    );
    printJson(created);
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runReleasesUpdate(opts: {
  port?: number;
  board: string | undefined;
  releaseId: string | undefined;
  name?: string;
  color?: string;
  clearColor?: boolean;
  releaseDate?: string;
  clearReleaseDate?: boolean;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const rid = parsePositiveInt("releaseId", opts.releaseId);
  if (rid === undefined) {
    throw new CliError("Invalid release id", 2, {
      code: CLI_ERR.invalidValue,
      releaseId: opts.releaseId,
    });
  }
  if (opts.clearColor && opts.color !== undefined) {
    throw new CliError("Cannot use --color together with --clear-color", 2, {
      code: CLI_ERR.mutuallyExclusiveOptions,
    });
  }
  if (opts.clearReleaseDate && opts.releaseDate !== undefined) {
    throw new CliError(
      "Cannot use --release-date together with --clear-release-date",
      2,
      { code: CLI_ERR.mutuallyExclusiveOptions },
    );
  }
  const patch: Record<string, unknown> = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.clearColor) patch.color = null;
  else if (opts.color !== undefined) patch.color = opts.color.trim();
  if (opts.clearReleaseDate) patch.releaseDate = null;
  else if (opts.releaseDate !== undefined) {
    patch.releaseDate = opts.releaseDate.trim();
  }
  if (Object.keys(patch).length === 0) {
    throw new CliError("At least one update field is required", 2, {
      code: CLI_ERR.noUpdateFields,
    });
  }

  try {
    const updated = await fetchApiMutate<ReleaseDefinition>(
      `/boards/${encodeURIComponent(boardId)}/releases/${rid}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    printJson(updated);
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}

export async function runReleasesDelete(opts: {
  port?: number;
  board: string | undefined;
  releaseId: string | undefined;
  moveTasksTo?: string;
}): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const rid = parsePositiveInt("releaseId", opts.releaseId);
  if (rid === undefined) {
    throw new CliError("Invalid release id", 2, {
      code: CLI_ERR.invalidValue,
      releaseId: opts.releaseId,
    });
  }
  const moveRaw = opts.moveTasksTo?.trim();
  let query = "";
  if (moveRaw) {
    const mid = Number(moveRaw);
    if (!Number.isInteger(mid) || mid < 1) {
      throw new CliError("Invalid move-tasks-to release id", 2, {
        code: CLI_ERR.invalidValue,
        moveTasksTo: moveRaw,
      });
    }
    query = `?moveTasksTo=${encodeURIComponent(String(mid))}`;
  }

  try {
    await fetchApiMutate<undefined>(
      `/boards/${encodeURIComponent(boardId)}/releases/${rid}${query}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    printJson({ ok: true, board: boardId, deletedReleaseId: rid });
  } catch (e) {
    if (e instanceof CliError && e.message === "Board not found") {
      throw new CliError(e.message, e.exitCode, { ...e.details, board: boardId });
    }
    throw e;
  }
}
