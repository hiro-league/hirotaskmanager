import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  boardDetailQueryKey,
  boardKeys,
  boardTaskDetailKey,
  fetchJson,
  fetchTrashedBoards,
  invalidateBoardStatsQueries,
  trashKeys,
} from "./queries";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("queries", () => {
  test("boardDetailQueryKey coerces numeric strings to numbers", () => {
    expect(boardDetailQueryKey(null)).toBeNull();
    expect(boardDetailQueryKey(undefined)).toBeNull();
    expect(boardDetailQueryKey("")).toBeNull();
    expect(boardDetailQueryKey("42")).toBe(42);
    expect(boardDetailQueryKey(42)).toBe(42);
    expect(boardDetailQueryKey("my-slug")).toBe("my-slug");
  });

  test("boardTaskDetailKey and boardKeys.detail", () => {
    expect(boardTaskDetailKey(1, 2)).toEqual(["boards", 1, "task", 2]);
    expect(boardKeys.detail(9)).toEqual(["boards", 9]);
    expect(boardKeys.all).toEqual(["boards"]);
  });

  test("trashKeys", () => {
    expect(trashKeys.all).toEqual(["trash"]);
    expect(trashKeys.boards()).toEqual(["trash", "boards"]);
    expect(trashKeys.lists()).toEqual(["trash", "lists"]);
    expect(trashKeys.tasks()).toEqual(["trash", "tasks"]);
  });

  test("invalidateBoardStatsQueries calls invalidateQueries with stats key", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    invalidateBoardStatsQueries(qc, 3);
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["boards", 3, "stats"],
    });
  });

  test("fetchJson returns parsed JSON when response is ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ hello: "world" }),
      }),
    );
    await expect(fetchJson<{ hello: string }>("/api/x")).resolves.toEqual({
      hello: "world",
    });
  });

  test("fetchJson throws Error with message from non-ok body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => '{"error":"nope"}',
      }),
    );
    await expect(fetchJson("/api/x")).rejects.toThrow(/nope/);
  });

  test("fetchJson uses statusText when non-ok body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "",
      }),
    );
    await expect(fetchJson("/api/x")).rejects.toThrow(/Bad Gateway/);
  });

  test("fetchTrashedBoards accumulates paginated trash rows until total", async () => {
    const mkItem = (idx: number) =>
      ({
        type: "board" as const,
        boardId: idx,
        name: `b${idx}`,
        slug: "",
        emoji: null,
        deletedAt: "",
        canRestore: true as const,
      });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string" ? input : String(input),
          "http://localhost",
        );
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const total = 1200;
        const pageSize = 500;
        const remaining = Math.max(0, total - offset);
        const take = Math.min(pageSize, remaining);
        const items = Array.from({ length: take }, (_, i) =>
          mkItem(offset + i + 1),
        );
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => "",
          json: async () => ({ items, total }),
        });
      }),
    );
    const rows = await fetchTrashedBoards();
    expect(rows.length).toBe(1200);
    expect(rows[0].boardId).toBe(1);
    expect(rows.at(-1)?.boardId).toBe(1200);
  });
});
