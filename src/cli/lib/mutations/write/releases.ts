import type {
  ReleaseDeleteMutationResult,
  ReleaseMutationResult,
} from "../../../../shared/mutationResults";
import type { PaginatedListBody } from "../../../../shared/pagination";
import type { Board, ReleaseDefinition } from "../../../../shared/models";
import type { CliContext } from "../../../types/context";
import { CLI_ERR } from "../../../types/errors";
import { CLI_DEFAULTS } from "../../core/constants";
import { enrichNotFoundError } from "../../client/cli-http-errors";
import {
  COLUMNS_RELEASES_LIST,
  QUIET_DEFAULT_RELEASE,
} from "../../core/listTableSpecs";
import {
  FIELDS_RELEASE,
  parseAndValidateFields,
  projectRecord,
} from "../../core/jsonFieldProjection";
import { executePaginatedListRead } from "../../client/paginatedListRead";
import { fetchAllPages } from "../../client/paginatedFetch";
import { CliError } from "../../output/output";
import { assertMutuallyExclusive } from "../../core/validation";
import {
  compactBoardEntity,
  compactReleaseEntity,
  writeReleaseDelete,
  writeSuccess,
} from "../write-result";
import { parsePositiveInt } from "./helpers";

async function fetchAllBoardReleases(
  ctx: CliContext,
  port: number | undefined,
  boardId: string,
): Promise<ReleaseDefinition[]> {
  const pageSize = CLI_DEFAULTS.MAX_PAGE_LIMIT;
  const base = `/boards/${encodeURIComponent(boardId)}/releases`;
  const merged = await fetchAllPages(async (offset) => {
    const q = new URLSearchParams();
    q.set("limit", String(pageSize));
    if (offset > 0) {
      q.set("offset", String(offset));
    }
    return ctx.fetchApi<PaginatedListBody<ReleaseDefinition>>(
      `${base}?${q.toString()}`,
      { port },
    );
  }, pageSize);
  return merged.items;
}

export async function runReleasesList(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const port = opts.port;
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: `/boards/${encodeURIComponent(boardId)}/releases`,
      fieldAllowlist: FIELDS_RELEASE,
      columns: COLUMNS_RELEASES_LIST,
      quietDefaults: QUIET_DEFAULT_RELEASE,
      emptyMessage: `No releases on board "${boardId}".`,
      emptyHint: `no releases on this board. Add one with "hirotm releases add --board ${boardId} --name <name>".`,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<ReleaseDefinition>>(path, { port }),
    },
    {
      limit: opts.limit,
      offset: opts.offset,
      pageAll: opts.pageAll,
      countOnly: opts.countOnly,
      fields: opts.fields,
    },
  );
}

export async function runReleasesShow(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    releaseId: string | undefined;
    fields?: string;
  },
): Promise<void> {
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
  const rows = await fetchAllBoardReleases(ctx, opts.port, boardId);
  const hit = rows.find((r) => r.releaseId === rid);
  if (!hit) {
    throw new CliError("Release not found", 3, {
      code: CLI_ERR.notFound,
      board: boardId,
      releaseId: rid,
    });
  }
  ctx.printJson(fieldKeys ? projectRecord(hit, fieldKeys) : hit);
}

export async function runReleasesAdd(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    name?: string;
    color?: string;
    clearColor?: boolean;
    releaseDate?: string;
    clearReleaseDate?: boolean;
  },
): Promise<void> {
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
  assertMutuallyExclusive([
    ["--color", opts.color, "--clear-color", opts.clearColor],
    [
      "--release-date",
      opts.releaseDate,
      "--clear-release-date",
      opts.clearReleaseDate,
    ],
  ]);
  const body: Record<string, unknown> = { name };
  if (opts.clearColor) body.color = null;
  else if (opts.color !== undefined) body.color = opts.color.trim();
  if (opts.clearReleaseDate) body.releaseDate = null;
  else if (opts.releaseDate !== undefined) {
    body.releaseDate = opts.releaseDate.trim();
  }

  try {
    // API returns entity-v1 (same contract as lists/tasks); shape stdout like other mutations.
    const result = await ctx.fetchApiMutate<ReleaseMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/releases`,
      { method: "POST", body },
      { port: opts.port },
    );
    ctx.printJson(
      writeSuccess(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactReleaseEntity(result.entity),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

export async function runReleasesUpdate(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    releaseId: string | undefined;
    name?: string;
    color?: string;
    clearColor?: boolean;
    releaseDate?: string;
    clearReleaseDate?: boolean;
  },
): Promise<void> {
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
  assertMutuallyExclusive([
    ["--color", opts.color, "--clear-color", opts.clearColor],
    [
      "--release-date",
      opts.releaseDate,
      "--clear-release-date",
      opts.clearReleaseDate,
    ],
  ]);
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
    const result = await ctx.fetchApiMutate<ReleaseMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/releases/${rid}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    ctx.printJson(
      writeSuccess(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        compactReleaseEntity(result.entity),
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, releaseId: rid });
  }
}

export async function runReleasesDelete(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    releaseId: string | undefined;
    moveTasksTo?: string;
  },
): Promise<void> {
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
    const result = await ctx.fetchApiMutate<ReleaseDeleteMutationResult>(
      `/boards/${encodeURIComponent(boardId)}/releases/${rid}${query}`,
      { method: "DELETE" },
      { port: opts.port },
    );
    ctx.printJson(
      writeReleaseDelete(
        {
          boardId: result.boardId,
          slug: result.boardSlug,
          updatedAt: result.boardUpdatedAt,
        },
        result.deletedReleaseId,
      ),
    );
  } catch (e) {
    enrichNotFoundError(e, { board: boardId, releaseId: rid });
  }
}

/**
 * Set or clear the board default release (PATCH board `defaultReleaseId`).
 * Validates the release exists on the board before PATCH so errors are clearer than a generic 404.
 */
export async function runReleasesSetDefault(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    releaseId: string | undefined;
    clear: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required option: --board", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  assertMutuallyExclusive([
    ["<release-id>", opts.releaseId, "--clear", opts.clear],
  ]);
  const ridRaw = opts.releaseId?.trim();
  if (!opts.clear && (ridRaw === undefined || ridRaw === "")) {
    throw new CliError("Provide <release-id> or use --clear", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  if (!opts.clear) {
    const rid = parsePositiveInt("releaseId", ridRaw);
    if (rid === undefined) {
      throw new CliError("Invalid release id", 2, {
        code: CLI_ERR.invalidValue,
        releaseId: ridRaw,
      });
    }
    const rows = await fetchAllBoardReleases(ctx, opts.port, boardId);
    if (!rows.some((r) => r.releaseId === rid)) {
      throw new CliError("Release not found", 3, {
        code: CLI_ERR.notFound,
        board: boardId,
        releaseId: rid,
      });
    }
  }

  const patch: Record<string, unknown> = {
    defaultReleaseId: opts.clear ? null : Number(ridRaw),
  };

  try {
    const board = await ctx.fetchApiMutate<Board>(
      `/boards/${encodeURIComponent(boardId)}`,
      { method: "PATCH", body: patch },
      { port: opts.port },
    );
    ctx.printJson(writeSuccess(board, compactBoardEntity(board)));
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}
