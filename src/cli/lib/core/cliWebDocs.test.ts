import { describe, expect, test } from "bun:test";
import {
  docsAnchorFromHeading,
  docsPageUrl,
  docsUrl,
  HIROTM_CLI_DOCS_OVERVIEW_URL,
} from "./cliWebDocs";

describe("docsAnchorFromHeading", () => {
  test("lowercases and replaces spaces with hyphens (Mintlify-style)", () => {
    expect(docsAnchorFromHeading("tasks list")).toBe("tasks-list");
    expect(docsAnchorFromHeading("Board Operations")).toBe("board-operations");
    expect(docsAnchorFromHeading("query search")).toBe("query-search");
    expect(docsAnchorFromHeading("hirotm server start")).toBe(
      "hirotm-server-start",
    );
  });
});

describe("docsUrl", () => {
  test("joins base path, page stem, and slugified anchor", () => {
    expect(docsUrl("tasks", "tasks list")).toBe(
      "https://docs.hiroleague.com/task-manager/cli/tasks#tasks-list",
    );
  });
});

describe("docsPageUrl", () => {
  test("returns page path without hash", () => {
    expect(docsPageUrl("lists")).toBe(
      "https://docs.hiroleague.com/task-manager/cli/lists",
    );
  });
});

describe("HIROTM_CLI_DOCS_OVERVIEW_URL", () => {
  test("points at published overview page", () => {
    expect(HIROTM_CLI_DOCS_OVERVIEW_URL).toBe(
      "https://docs.hiroleague.com/task-manager/cli/cli-overview",
    );
  });
});
