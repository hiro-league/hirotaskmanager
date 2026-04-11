import { afterEach, describe, expect, test } from "bun:test";
import type { BoardDescribeResponse } from "../../shared/boardDescribe";
import { parseBoardDescribeEntities } from "../../shared/boardDescribe";
import { resetCliOutputFormat, syncCliOutputFormatFromGlobals } from "./cliFormat";
import { printBoardDescribeResponse } from "./boardDescribeOutput";

const fullPolicy = {
  readBoard: true,
  createTasks: true,
  manageCliCreatedTasks: false,
  manageAnyTasks: false,
  createLists: true,
  manageCliCreatedLists: false,
  manageAnyLists: false,
  manageStructure: false,
  deleteBoard: false,
  editBoard: false,
} as const;

function sampleResponse(): BoardDescribeResponse {
  return {
    board: {
      boardId: 7,
      slug: "alpha",
      name: "Alpha",
      emoji: "📌",
      description: "hi",
      cliPolicy: { ...fullPolicy },
    },
    lists: {
      items: [
        { listId: 10, name: "Ready" },
        { listId: 11, name: "Doing" },
      ],
    },
    groups: {
      items: [{ groupId: 2, label: "feature", default: true }],
    },
    priorities: {
      items: [{ priorityId: 5, label: "none", value: 0 }],
    },
    releases: {
      items: [
        {
          releaseId: 3,
          name: "v1",
          releaseDate: "2026-04-01",
          default: true,
        },
      ],
    },
    statuses: {
      items: [{ statusId: "open", label: "Open" }],
    },
  };
}

function capturePrint(
  fn: () => void,
): string {
  let out = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c: string | Uint8Array, ...a: unknown[]) => {
    out += typeof c === "string" ? c : new TextDecoder().decode(c);
    void a;
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

describe("printBoardDescribeResponse", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("ndjson: board (no cliPolicy), policy line, then rows in default order", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const parsed = parseBoardDescribeEntities(undefined);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = capturePrint(() =>
      printBoardDescribeResponse(sampleResponse(), parsed),
    );
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(8);
    const board = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(board.kind).toBe("board");
    expect(board.boardId).toBe(7);
    expect(board.slug).toBe("alpha");
    expect(board.cliPolicy).toBeUndefined();
    const policy = JSON.parse(lines[1]!) as Record<string, unknown>;
    expect(policy.kind).toBe("policy");
    expect(policy.readBoard).toBe(true);
    const kinds = lines.slice(2).map((l) => (JSON.parse(l) as { kind: string }).kind);
    expect(kinds).toEqual([
      "list",
      "list",
      "group",
      "priority",
      "release",
      "status",
    ]);
  });

  test("ndjson: entities order status before list when parsed that way", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const parsed = parseBoardDescribeEntities("status,list");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const body = sampleResponse();
    const out = capturePrint(() => printBoardDescribeResponse(body, parsed));
    const kinds = out
      .trimEnd()
      .split("\n")
      .slice(2)
      .map((l) => (JSON.parse(l) as { kind: string }).kind);
    expect(kinds).toEqual(["status", "list", "list"]);
  });

  test("ndjson: meta line appears in CSV position", () => {
    syncCliOutputFormatFromGlobals({ format: "ndjson", quiet: false });
    const parsed = parseBoardDescribeEntities("list,meta");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const body: BoardDescribeResponse = {
      ...sampleResponse(),
      meta: {
        lists: { truncated: false, total: 2, shown: 2 },
        groups: { truncated: false, total: 1, shown: 1 },
        priorities: { truncated: false, total: 1, shown: 1 },
        releases: { truncated: false, total: 1, shown: 1 },
        statuses: { truncated: false, total: 1, shown: 1 },
      },
    };
    const out = capturePrint(() => printBoardDescribeResponse(body, parsed));
    const lines = out.trimEnd().split("\n").filter(Boolean);
    const kinds = lines.slice(2).map((l) => (JSON.parse(l) as { kind: string }).kind);
    expect(kinds).toEqual(["list", "list", "meta"]);
    const meta = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
    expect(meta.kind).toBe("meta");
    expect(meta.lists).toEqual({ truncated: false, total: 2, shown: 2 });
  });

  test("human: section titles and tables", () => {
    syncCliOutputFormatFromGlobals({ format: "human", quiet: false });
    const parsed = parseBoardDescribeEntities(undefined);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = capturePrint(() =>
      printBoardDescribeResponse(sampleResponse(), parsed),
    );
    expect(out).toContain("Board\n");
    expect(out).toMatch(/Id\s+Slug\s+Name/);
    expect(out).toContain("CLI policy\n");
    expect(out).toContain("readBoard");
    expect(out).toContain("Lists\n");
    expect(out).toContain("Ready");
    expect(out).toContain("Groups\n");
    expect(out).toContain("Priorities\n");
    expect(out).toContain("Releases\n");
    expect(out).toContain("Statuses\n");
    expect(out).toContain("total 2 · showing 2");
  });
});
