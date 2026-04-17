/**
 * Shared parsing / IO helpers for CLI write paths (split from monolithic writeCommands).
 */
import type { Board } from "../../../../shared/models";
import type { ListWithBoard, TaskWithBoard } from "../../../../shared/models";
import type { CliContext } from "../../../types/context";
import { CLI_ERR } from "../../../types/errors";
import { CliError } from "../../output/output";
import type { TextInputSource } from "../../../types/options";

export function parsePositiveInt(
  label: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError(`Invalid ${label}`, 2, {
      code: CLI_ERR.invalidValue,
      [label]: raw,
    });
  }
  return n;
}

export function parseTaskId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError("Invalid task id", 2, {
      code: CLI_ERR.invalidValue,
      taskId: raw,
    });
  }
  return n;
}

export type ResolvedBoardRef = {
  boardId: number;
  boardSlug: string;
};

export function formatResolvedBoardRef(board: ResolvedBoardRef): string {
  return board.boardSlug.trim() || String(board.boardId);
}

function assertResolvedBoardRef(
  entity: "task" | "list",
  raw: Partial<ResolvedBoardRef>,
): ResolvedBoardRef {
  if (
    typeof raw.boardId !== "number" ||
    !Number.isInteger(raw.boardId) ||
    raw.boardId < 1 ||
    typeof raw.boardSlug !== "string"
  ) {
    throw new CliError(`${entity} response missing board metadata`, 1, {
      code: CLI_ERR.responseInconsistent,
      entity,
    });
  }
  return { boardId: raw.boardId, boardSlug: raw.boardSlug };
}

export async function resolveTaskBoardRef(
  ctx: Pick<CliContext, "fetchApi">,
  taskId: number,
  port: number | undefined,
): Promise<ResolvedBoardRef> {
  // `tasks update|move|delete` no longer require `--board`, so resolve the owning board once from the global read.
  const task = await ctx.fetchApi<TaskWithBoard>(`/tasks/${taskId}`, { port });
  return assertResolvedBoardRef("task", task);
}

export async function resolveListBoardRef(
  ctx: Pick<CliContext, "fetchApi">,
  listId: number,
  port: number | undefined,
): Promise<ResolvedBoardRef> {
  // `lists update|move|delete` no longer require `--board`, so resolve the owning board once from the global read.
  const list = await ctx.fetchApi<ListWithBoard>(`/lists/${listId}`, { port });
  return assertResolvedBoardRef("list", list);
}

type CliReleaseFlagInput =
  | { mode: "omit" }
  | { mode: "null" }
  | { mode: "id"; id: number }
  | { mode: "name"; name: string };

export function parseCliReleaseFlags(opts: {
  release?: string;
  releaseId?: string;
}): CliReleaseFlagInput {
  const rawName = opts.release?.trim();
  const rawId = opts.releaseId?.trim();
  const hasName = rawName !== undefined && rawName.length > 0;
  const hasId = rawId !== undefined && rawId.length > 0;
  if (hasName && hasId) {
    throw new CliError("Use only one of --release or --release-id", 2, {
      code: CLI_ERR.mutuallyExclusiveOptions,
    });
  }
  if (!hasName && !hasId) return { mode: "omit" };
  if (hasId) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) {
      throw new CliError("Invalid release id", 2, {
        code: CLI_ERR.invalidValue,
        releaseId: rawId,
      });
    }
    return { mode: "id", id };
  }
  const name = rawName!;
  if (name.toLowerCase() === "none") return { mode: "null" };
  return { mode: "name", name };
}

export async function resolveCliReleaseToApiValue(
  ctx: Pick<CliContext, "fetchApi">,
  boardId: string,
  input: CliReleaseFlagInput,
  port: number | undefined,
): Promise<number | null | undefined> {
  switch (input.mode) {
    case "omit":
      return undefined;
    case "null":
      return null;
    case "id":
      return input.id;
    case "name": {
      const board = await ctx.fetchApi<Board>(
        `/boards/${encodeURIComponent(boardId)}`,
        { port },
      );
      const hit = board.releases.find((rel) => rel.name === input.name);
      if (!hit) {
        throw new CliError("Release not found for name", 2, {
          code: CLI_ERR.releaseNotFoundByName,
          board: boardId,
          name: input.name,
        });
      }
      return hit.releaseId;
    }
  }
}

/** Resolved exclusive text input: flag value, file path string, or stdin (empty placeholder). */
export type { TextInputSource } from "../../../types/options";

export function resolveExclusiveTextInput(
  label: string,
  options: {
    text?: string;
    file?: string;
    stdin?: boolean;
  },
): { source: TextInputSource; text: string } | undefined {
  const hasText = options.text !== undefined;
  const hasFile = Boolean(options.file?.trim());
  const hasStdin = Boolean(options.stdin);
  const count = (hasText ? 1 : 0) + (hasFile ? 1 : 0) + (hasStdin ? 1 : 0);
  if (count > 1) {
    throw new CliError(`Exactly one ${label} input source is allowed`, 2, {
      code: CLI_ERR.conflictingInputSources,
    });
  }
  if (hasText) {
    return { source: "flag", text: options.text ?? "" };
  }
  if (hasFile) {
    return { source: "file", text: options.file!.trim() };
  }
  if (hasStdin) {
    return { source: "stdin", text: "" };
  }
  return undefined;
}

async function readStdinUtf8(): Promise<string> {
  return await new Response(Bun.stdin.stream()).text();
}

export async function loadTextInput(
  label: string,
  resolved: { source: TextInputSource; text: string },
): Promise<string> {
  if (resolved.source === "flag") {
    return resolved.text;
  }
  if (resolved.source === "stdin") {
    return await readStdinUtf8();
  }
  const path = resolved.text;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new CliError(`${label} file not found`, 3, {
      code: CLI_ERR.fileNotFound,
      path,
    });
  }
  return await file.text();
}

export async function loadJsonArrayInput(
  label: string,
  options: {
    json?: string;
    file?: string;
    stdin?: boolean;
  },
  propertyName: string,
): Promise<unknown[]> {
  const resolved = resolveExclusiveTextInput(label, {
    text: options.json,
    file: options.file,
    stdin: options.stdin,
  });
  if (!resolved) {
    throw new CliError(`One ${label} input source is required`, 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const text = await loadTextInput(label, resolved);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliError(`Invalid ${label} JSON`, 2, {
      code: CLI_ERR.invalidJson,
    });
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>)[propertyName])
  ) {
    return (parsed as Record<string, unknown>)[propertyName] as unknown[];
  }
  throw new CliError(
    `${label} must be a JSON array or an object with ${propertyName}`,
    2,
    { code: CLI_ERR.invalidInputShape },
  );
}

export async function loadJsonObjectInput(
  label: string,
  options: {
    json?: string;
    file?: string;
    stdin?: boolean;
  },
): Promise<Record<string, unknown>> {
  const resolved = resolveExclusiveTextInput(label, {
    text: options.json,
    file: options.file,
    stdin: options.stdin,
  });
  if (!resolved) {
    throw new CliError(`One ${label} input source is required`, 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const text = await loadTextInput(label, resolved);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliError(`Invalid ${label} JSON`, 2, {
      code: CLI_ERR.invalidJson,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`${label} must be a JSON object`, 2, {
      code: CLI_ERR.invalidInputShape,
    });
  }
  return parsed as Record<string, unknown>;
}
