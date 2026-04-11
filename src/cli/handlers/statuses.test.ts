import { afterEach, describe, expect, test } from "bun:test";
import type { Status } from "../../shared/models";
import { resetCliOutputFormat } from "../lib/output";
import { handleStatusesList } from "./statuses";
import type { CliContext } from "./context";

describe("handleStatusesList", () => {
  afterEach(() => {
    resetCliOutputFormat();
  });

  test("fetches /statuses and prints NDJSON lines", async () => {
    const rows: Status[] = [
      { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
    ];
    let path = "";
    const ctx: CliContext = {
      resolvePort: () => 3010,
      resolveDataDir: () => "/tmp",
      fetchApi: (async (p) => {
        path = p;
        return rows;
      }) as CliContext["fetchApi"],
      printJson: () => {},
      startServer: async () => {
        throw new Error("unused");
      },
      stopServer: async () => {
        throw new Error("unused");
      },
      readServerStatus: async () => ({ running: false }),
    };

    let out = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      out +=
        typeof chunk === "string"
          ? chunk
          : new TextDecoder().decode(chunk as Uint8Array);
      void args;
      return true;
    };
    try {
      await handleStatusesList(ctx, {});
    } finally {
      process.stdout.write = origWrite;
    }

    expect(path).toBe("/statuses");
    const lines = out.trimEnd().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual(rows[0]);
  });
});
