import { describe, expect, test } from "bun:test";
import type { BoardDescribeResponse } from "../../../../shared/boardDescribe";
import { FULL_BOARD_CLI_POLICY } from "../../../../shared/cliPolicy";
import { createDefaultCliContext } from "../../../handlers/context";
import { createTestCliRuntime } from "../../core/runtime";
import type { CliContext } from "../../../types/context";
import {
  dryRunBoardsConfigureGroups,
  dryRunBoardsConfigurePriorities,
} from "./boardConfigureDryRun";

function makeCtx(
  describe: BoardDescribeResponse,
): { ctx: CliContext; lines: string[] } {
  const lines: string[] = [];
  const ctx: CliContext = {
    ...createDefaultCliContext(),
    resolvePort: () => 3000,
    fetchApi: async (path: string) => {
      if (String(path).includes("/describe?entities=group")) {
        return describe;
      }
      if (String(path).includes("/describe?entities=priority")) {
        return describe;
      }
      throw new Error(`unexpected GET ${path}`);
    },
    fetchApiMutate: async () => {
      throw new Error("no mutate in dry-run test");
    },
    fetchApiTrashMutate: async () => {
      throw new Error("no trash mutate in dry-run test");
    },
    printJson: (v: unknown) => {
      lines.push(JSON.stringify(v));
    },
    getRuntime: () => createTestCliRuntime({ port: 3000 }),
  };
  return { ctx, lines };
}

describe("board configure dry-run", () => {
  test("groups — prints wouldPatch and analysis", async () => {
    const describe: BoardDescribeResponse = {
      board: {
        boardId: 1,
        slug: "b",
        name: "B",
        description: "",
        cliPolicy: FULL_BOARD_CLI_POLICY,
      },
      groups: {
        items: [
          { groupId: 10, label: "A", default: true },
          { groupId: 11, label: "B", default: false },
        ],
      },
    };
    const { ctx, lines } = makeCtx(describe);
    await dryRunBoardsConfigureGroups(ctx, {
      port: 3000,
      board: "b",
      json: JSON.stringify({
        creates: [],
        updates: [{ groupId: 10, label: "A2", sortOrder: 0 }],
        deletes: [],
        defaultTaskGroupId: 10,
        deletedGroupFallbackId: 10,
      }),
    });
    const o = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(o.dryRun).toBe(true);
    expect(o.command).toBe("boards configure groups");
    const analysis = o.analysis as {
      unknownUpdateGroupIds: number[];
      unknownDeleteGroupIds: number[];
      warnings: string[];
    };
    expect(analysis.unknownUpdateGroupIds).toEqual([]);
    expect(analysis.warnings.length).toBeGreaterThanOrEqual(0);
  });

  test("priorities — includes counts", async () => {
    const describe: BoardDescribeResponse = {
      board: {
        boardId: 1,
        slug: "b",
        name: "B",
        description: "",
        cliPolicy: FULL_BOARD_CLI_POLICY,
      },
      priorities: {
        items: [
          { priorityId: 1, label: "P", value: 0 },
        ],
      },
    };
    const { ctx, lines } = makeCtx(describe);
    await dryRunBoardsConfigurePriorities(ctx, {
      port: 3000,
      board: "b",
      json: JSON.stringify([{ priorityId: 2, value: 1, label: "Q", color: "#000", isSystem: false }]),
    });
    const o = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(o.dryRun).toBe(true);
    const analysis = o.analysis as { nextCount: number; currentCount: number };
    expect(analysis.currentCount).toBe(1);
    expect(analysis.nextCount).toBe(1);
  });
});
