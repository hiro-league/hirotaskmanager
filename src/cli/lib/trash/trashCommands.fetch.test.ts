import { afterEach, describe, expect, test } from "bun:test";
import { createDefaultCliContext } from "../../handlers/context";
import { resetCliOutputFormat } from "../output/output";
import { runTrashBoards } from "./trashCommands";

const ctx = createDefaultCliContext();

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let buf = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._args: unknown[]
  ): boolean => {
    buf +=
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);
    return true;
  };
  try {
    await run();
  } finally {
    process.stdout.write = orig;
  }
  return buf;
}

describe("trashCommands fetch smoke (mock fetch)", () => {
  const origFetch = globalThis.fetch;

  function setMockFetch(
    impl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>,
  ): void {
    globalThis.fetch = impl as unknown as typeof globalThis.fetch;
  }

  afterEach(() => {
    globalThis.fetch = origFetch;
    resetCliOutputFormat();
  });

  test("runTrashBoards prints rows from GET /trash/boards", async () => {
    const rows = [
      {
        type: "board" as const,
        id: 1,
        name: "Trashed",
        slug: "t",
        emoji: null,
        deletedAt: "2026-01-01T00:00:00.000Z",
        canRestore: true,
      },
    ];

    const envelope = {
      items: rows,
      total: rows.length,
      limit: rows.length,
      offset: 0,
    };
    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toContain("/api/trash/boards");
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const out = await captureStdout(() => runTrashBoards(ctx, { port: 21100 }));
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(rows[0]);
  });
});
