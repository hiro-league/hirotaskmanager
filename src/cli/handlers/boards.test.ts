import { describe, expect, test } from "bun:test";
import type { BoardIndexEntry } from "../../shared/models";
import { handleBoardsList } from "./boards";
import type { CliContext } from "./context";

describe("handleBoardsList (CliContext)", () => {
  test("uses injected fetchApi and printJson", async () => {
    const sample: BoardIndexEntry[] = [
      {
        id: 1,
        slug: "alpha",
        name: "Alpha",
        emoji: null,
        description: "",
        cliPolicy: {
          readBoard: true,
          createTasks: true,
          manageCliCreatedTasks: true,
          manageAnyTasks: false,
          createLists: true,
          manageCliCreatedLists: true,
          manageAnyLists: false,
          manageStructure: false,
          deleteBoard: false,
          editBoard: false,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    let printed: unknown;
    const ctx: CliContext = {
      resolvePort: () => 3002,
      resolveDataDir: () => "/tmp",
      fetchApi: async () => sample,
      printJson: (data: unknown) => {
        printed = data;
      },
      printSearchTable: () => {},
      startServer: async () => {
        throw new Error("unused");
      },
      readServerStatus: async () => ({ running: false }),
    };

    await handleBoardsList(ctx, {});

    expect(printed).toEqual(sample);
  });
});
