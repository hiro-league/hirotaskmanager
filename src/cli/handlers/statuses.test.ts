import { describe, expect, test } from "bun:test";
import type { Status } from "../../shared/models";
import { handleStatusesList } from "./statuses";
import type { CliContext } from "./context";

describe("handleStatusesList", () => {
  test("fetches /statuses and prints JSON", async () => {
    const rows: Status[] = [
      { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
    ];
    let path = "";
    let printed: unknown;
    const ctx: CliContext = {
      resolvePort: () => 3010,
      resolveDataDir: () => "/tmp",
      fetchApi: (async (p) => {
        path = p;
        return rows;
      }) as CliContext["fetchApi"],
      printJson: (d) => {
        printed = d;
      },
      printSearchTable: () => {},
      startServer: async () => {
        throw new Error("unused");
      },
      stopServer: async () => {
        throw new Error("unused");
      },
      readServerStatus: async () => ({ running: false }),
    };

    await handleStatusesList(ctx, {});

    expect(path).toBe("/statuses");
    expect(printed).toEqual(rows);
  });
});
