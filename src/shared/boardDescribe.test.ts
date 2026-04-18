import { describe, expect, test } from "bun:test";
import {
  BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS,
  BOARD_DESCRIBE_MAX_ITEMS,
  buildBoardDescribeResponse,
  parseBoardDescribeEntities,
  truncateBoardDescribeDescription,
} from "./boardDescribe";
import type { Board } from "./models";
import type { BoardCliPolicy } from "./cliPolicy";
import { FULL_BOARD_CLI_POLICY } from "./cliPolicy";

const policy: BoardCliPolicy = FULL_BOARD_CLI_POLICY;

function shell(overrides: Partial<Omit<Board, "tasks">>): Omit<Board, "tasks"> {
  return {
    boardId: 1,
    slug: "s",
    name: "N",
    emoji: null,
    description: "",
    cliPolicy: policy,
    taskGroups: [],
    defaultTaskGroupId: 1,
    deletedGroupFallbackId: 1,
    taskPriorities: [],
    releases: [],
    defaultReleaseId: null,
    autoAssignReleaseOnCreateUi: false,
    autoAssignReleaseOnCreateCli: false,
    visibleStatuses: [],
    lists: [],
    showStats: false,
    muteCelebrationSounds: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("parseBoardDescribeEntities", () => {
  test("undefined → include all default sections (no meta)", () => {
    const p = parseBoardDescribeEntities(undefined);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.includeAll).toBe(true);
    expect(p.set.size).toBe(5);
    expect(p.order).toEqual([
      "list",
      "group",
      "priority",
      "release",
      "status",
    ]);
  });

  test("empty string → error", () => {
    const p = parseBoardDescribeEntities("");
    expect(p.ok).toBe(false);
  });

  test("unknown token → error", () => {
    const p = parseBoardDescribeEntities("list,wat");
    expect(p.ok).toBe(false);
  });

  test("subset preserves order", () => {
    const p = parseBoardDescribeEntities("group, list");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.includeAll).toBe(false);
    expect(p.order).toEqual(["group", "list"]);
    expect(p.set.has("list")).toBe(true);
    expect(p.set.has("group")).toBe(true);
    expect(p.set.has("priority")).toBe(false);
  });

  test("board token → error", () => {
    const p = parseBoardDescribeEntities("board,list");
    expect(p.ok).toBe(false);
  });

  test("duplicate token → error", () => {
    const p = parseBoardDescribeEntities("list,list");
    expect(p.ok).toBe(false);
  });

  test("meta alone is valid", () => {
    const p = parseBoardDescribeEntities("meta");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.set.has("meta")).toBe(true);
    expect(p.set.size).toBe(1);
  });
});

describe("truncateBoardDescribeDescription", () => {
  test("short text unchanged", () => {
    const r = truncateBoardDescribeDescription("hi");
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("hi");
  });

  test("long text truncated", () => {
    const long = "x".repeat(BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS + 50);
    const r = truncateBoardDescribeDescription(long);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS);
  });
});

describe("buildBoardDescribeResponse", () => {
  test("omits optional sections when not requested", () => {
    const b = shell({
      lists: [{ listId: 9, name: "L", order: 0 }],
      taskGroups: [
        {
          groupId: 2,
          label: "g",
          sortOrder: 0,
          emoji: null,
        },
      ],
      defaultTaskGroupId: 2,
    });
    const parsed = parseBoardDescribeEntities("group");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = buildBoardDescribeResponse(b, [], parsed);
    expect(out.board.boardId).toBe(1);
    expect(out.lists).toBeUndefined();
    expect(out.groups).toBeDefined();
  });

  test("meta adds aggregate without requiring list in response", () => {
    const b = shell({
      lists: [{ listId: 9, name: "L", order: 0 }],
    });
    const parsed = parseBoardDescribeEntities("meta");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = buildBoardDescribeResponse(b, [], parsed);
    expect(out.lists).toBeUndefined();
    expect(out.meta?.lists).toEqual({
      truncated: false,
      total: 1,
      shown: 1,
    });
  });

  test("lists slice truncation metadata", () => {
    const lists = Array.from({ length: BOARD_DESCRIBE_MAX_ITEMS + 7 }, (_, i) => ({
      listId: i + 1,
      name: `L${i}`,
      order: i,
    }));
    const b = shell({ lists });
    const parsed = parseBoardDescribeEntities(undefined);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = buildBoardDescribeResponse(
      b,
      [
        {
          statusId: "open",
          label: "Open",
          sortOrder: 0,
          isClosed: false,
        },
      ],
      parsed,
    );
    expect(out.lists?.items.length).toBe(BOARD_DESCRIBE_MAX_ITEMS);
    expect(out.lists?.truncated).toBe(true);
    expect(out.lists?.total).toBe(BOARD_DESCRIBE_MAX_ITEMS + 7);
  });
});
