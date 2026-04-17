import type { BoardDescribeResponse } from "../../../../shared/boardDescribe";
import type { PatchBoardTaskGroupConfigInput } from "../../../../shared/taskGroupConfig";
import { parsePatchBoardTaskGroupConfigBody } from "../../../../shared/taskGroupConfig";
import type { CliContext } from "../../../types/context";
import { CLI_ERR } from "../../../types/errors";
import { enrichNotFoundError } from "../../client/cli-http-errors";
import { loadJsonArrayInput, loadJsonObjectInput } from "../write/helpers";
import { CliError } from "../../output/output";

type GroupDryRunAnalysis = {
  unknownUpdateGroupIds: number[];
  unknownDeleteGroupIds: number[];
  warnings: string[];
};

function analyzeGroupPatch(
  currentGroupIds: ReadonlySet<number>,
  patch: PatchBoardTaskGroupConfigInput,
): GroupDryRunAnalysis {
  const unknownUpdateGroupIds = patch.updates
    .map((u) => u.groupId)
    .filter((id) => !currentGroupIds.has(id));
  const unknownDeleteGroupIds = patch.deletes
    .map((d) => d.groupId)
    .filter((id) => !currentGroupIds.has(id));

  const deleteSet = new Set(patch.deletes.map((d) => d.groupId));
  const warnings: string[] = [];

  const createClientIds = new Set(patch.creates.map((c) => c.clientId));

  if (patch.defaultTaskGroupId != null) {
    if (deleteSet.has(patch.defaultTaskGroupId)) {
      warnings.push(
        "defaultTaskGroupId names a group that is also listed in deletes — server may reject",
      );
    }
    if (!patch.defaultTaskGroupClientId && !currentGroupIds.has(patch.defaultTaskGroupId)) {
      warnings.push("defaultTaskGroupId is not among current server group ids");
    }
  }
  if (patch.defaultTaskGroupClientId && !createClientIds.has(patch.defaultTaskGroupClientId)) {
    warnings.push("defaultTaskGroupClientId does not match any creates[].clientId");
  }

  if (patch.deletedGroupFallbackId != null) {
    if (deleteSet.has(patch.deletedGroupFallbackId)) {
      warnings.push(
        "deletedGroupFallbackId names a group that is also listed in deletes — server may reject",
      );
    }
    if (
      !patch.deletedGroupFallbackClientId &&
      !currentGroupIds.has(patch.deletedGroupFallbackId)
    ) {
      warnings.push("deletedGroupFallbackId is not among current server group ids");
    }
  }
  if (
    patch.deletedGroupFallbackClientId &&
    !createClientIds.has(patch.deletedGroupFallbackClientId)
  ) {
    warnings.push("deletedGroupFallbackClientId does not match any creates[].clientId");
  }

  return { unknownUpdateGroupIds, unknownDeleteGroupIds, warnings };
}

/** `boards configure groups --dry-run` — parse JSON + GET describe (groups); no PATCH. */
export async function dryRunBoardsConfigureGroups(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    json?: string;
    file?: string;
    stdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const raw = await loadJsonObjectInput("task groups", {
    json: opts.json,
    file: opts.file,
    stdin: opts.stdin,
  });
  const parsed = parsePatchBoardTaskGroupConfigBody(raw);
  if (!parsed.ok) {
    throw new CliError(parsed.error, 2, { code: CLI_ERR.invalidInputShape });
  }

  const path = `/boards/${encodeURIComponent(boardId)}/describe?entities=${encodeURIComponent("group")}`;
  try {
    const describe = await ctx.fetchApi<BoardDescribeResponse>(path, {
      port: opts.port,
    });
    const currentRows = describe.groups?.items ?? [];
    const currentIds = new Set(currentRows.map((g) => g.groupId));
    const analysis = analyzeGroupPatch(currentIds, parsed.value);

    ctx.printJson({
      dryRun: true,
      command: "boards configure groups",
      board: boardId,
      wouldPatch: parsed.value,
      currentGroups: currentRows,
      analysis,
    });
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}

/** `boards configure priorities --dry-run` — parse JSON + GET describe (priorities); no PATCH. */
export async function dryRunBoardsConfigurePriorities(
  ctx: CliContext,
  opts: {
    port?: number;
    board: string | undefined;
    json?: string;
    file?: string;
    stdin?: boolean;
  },
): Promise<void> {
  const boardId = opts.board?.trim();
  if (!boardId) {
    throw new CliError("Missing required argument: <id-or-slug>", 2, {
      code: CLI_ERR.missingRequired,
    });
  }
  const taskPriorities = await loadJsonArrayInput(
    "task priorities",
    {
      json: opts.json,
      file: opts.file,
      stdin: opts.stdin,
    },
    "taskPriorities",
  );

  const path = `/boards/${encodeURIComponent(boardId)}/describe?entities=${encodeURIComponent("priority")}`;
  try {
    const describe = await ctx.fetchApi<BoardDescribeResponse>(path, {
      port: opts.port,
    });
    const currentRows = describe.priorities?.items ?? [];

    ctx.printJson({
      dryRun: true,
      command: "boards configure priorities",
      board: boardId,
      wouldPatch: { taskPriorities },
      currentPriorities: currentRows,
      analysis: {
        nextCount: taskPriorities.length,
        currentCount: currentRows.length,
      },
    });
  } catch (e) {
    enrichNotFoundError(e, { board: boardId });
  }
}
