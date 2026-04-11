/**
 * CLI stdout for `boards describe`: ndjson = one JSON object per line;
 * human = fixed-width tables. Order follows parsed `--entities` (default:
 * list → group → priority → release → status); `board` and `policy` lines
 * always precede row sections.
 */
import type {
  BoardDescribeMeta,
  BoardDescribeResponse,
  ParsedBoardDescribeEntities,
} from "../../shared/boardDescribe";
import type { BoardCliPolicy } from "../../shared/cliPolicy";
import { getCliOutputFormat } from "./cliFormat";
import {
  COLUMNS_DESCRIBE_BOARD,
  COLUMNS_DESCRIBE_GROUP,
  COLUMNS_DESCRIBE_LIST,
  COLUMNS_DESCRIBE_PRIORITY,
  COLUMNS_DESCRIBE_RELEASE,
  COLUMNS_DESCRIBE_STATUS,
} from "./listTableSpecs";
import { renderRecordsTable } from "./textTable";

function policyRows(policy: BoardCliPolicy): Record<string, unknown>[] {
  const keys: (keyof BoardCliPolicy)[] = [
    "readBoard",
    "createTasks",
    "manageCliCreatedTasks",
    "manageAnyTasks",
    "createLists",
    "manageCliCreatedLists",
    "manageAnyLists",
    "manageStructure",
    "deleteBoard",
    "editBoard",
  ];
  return keys.map((k) => ({
    key: k,
    value: policy[k] ? "yes" : "no",
  }));
}

function policyNdjson(policy: BoardCliPolicy): Record<string, unknown> {
  return {
    kind: "policy",
    readBoard: policy.readBoard,
    createTasks: policy.createTasks,
    manageCliCreatedTasks: policy.manageCliCreatedTasks,
    manageAnyTasks: policy.manageAnyTasks,
    createLists: policy.createLists,
    manageCliCreatedLists: policy.manageCliCreatedLists,
    manageAnyLists: policy.manageAnyLists,
    manageStructure: policy.manageStructure,
    deleteBoard: policy.deleteBoard,
    editBoard: policy.editBoard,
  };
}

function sliceFooter(
  slice: { items: unknown[]; truncated?: boolean; total?: number } | undefined,
): string[] {
  if (!slice) return [];
  const n = slice.items.length;
  const total = slice.total ?? n;
  if (slice.truncated === true) {
    return [`total ${total} · showing ${n} (truncated)`];
  }
  return [`total ${total} · showing ${n}`];
}

const COLUMNS_DESCRIBE_META = [
  { key: "section", header: "Section", width: 12 },
  { key: "truncated", header: "Trunc", width: 6 },
  { key: "total", header: "Total", width: 8 },
  { key: "shown", header: "Shown", width: 8 },
] as const;

function metaTableRows(m: BoardDescribeMeta): Record<string, unknown>[] {
  const row = (
    section: string,
    s: { truncated: boolean; total: number; shown: number },
  ) => ({
    section,
    truncated: s.truncated ? "yes" : "no",
    total: s.total,
    shown: s.shown,
  });
  return [
    row("lists", m.lists),
    row("groups", m.groups),
    row("priorities", m.priorities),
    row("releases", m.releases),
    row("statuses", m.statuses),
  ];
}

function printBoardDescribeNdjson(
  body: BoardDescribeResponse,
  parsed: ParsedBoardDescribeEntities & { ok: true },
): void {
  const b = body.board;
  const boardLine: Record<string, unknown> = {
    kind: "board",
    boardId: b.boardId,
    slug: b.slug,
    name: b.name,
    emoji: b.emoji ?? null,
    description: b.description,
  };
  if (b.descriptionTruncated === true) {
    boardLine.descriptionTruncated = true;
  }
  process.stdout.write(`${JSON.stringify(boardLine)}\n`);
  process.stdout.write(`${JSON.stringify(policyNdjson(b.cliPolicy))}\n`);

  for (const token of parsed.order) {
    if (token === "list") {
      for (const row of body.lists?.items ?? []) {
        process.stdout.write(
          `${JSON.stringify({ kind: "list", listId: row.listId, name: row.name })}\n`,
        );
      }
    } else if (token === "group") {
      for (const row of body.groups?.items ?? []) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "group",
            groupId: row.groupId,
            label: row.label,
            default: row.default,
          })}\n`,
        );
      }
    } else if (token === "priority") {
      for (const row of body.priorities?.items ?? []) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "priority",
            priorityId: row.priorityId,
            label: row.label,
            value: row.value,
          })}\n`,
        );
      }
    } else if (token === "release") {
      for (const row of body.releases?.items ?? []) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "release",
            releaseId: row.releaseId,
            name: row.name,
            releaseDate: row.releaseDate,
            default: row.default,
          })}\n`,
        );
      }
    } else if (token === "status") {
      for (const row of body.statuses?.items ?? []) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "status",
            statusId: row.statusId,
            label: row.label,
          })}\n`,
        );
      }
    } else if (token === "meta" && body.meta) {
      process.stdout.write(
        `${JSON.stringify({ kind: "meta", ...body.meta })}\n`,
      );
    }
  }
}

function printBoardDescribeHuman(
  body: BoardDescribeResponse,
  parsed: ParsedBoardDescribeEntities & { ok: true },
): void {
  const b = body.board;
  const parts: string[] = [];

  parts.push("Board\n");
  parts.push(
    renderRecordsTable(
      [
        {
          boardId: b.boardId,
          slug: b.slug,
          name: b.name,
          emoji: b.emoji ?? "",
        },
      ],
      COLUMNS_DESCRIBE_BOARD,
    ),
  );

  const descLabel =
    b.description.trim() === "" ? "(empty)" : b.description;
  parts.push(`\nDescription\n`);
  parts.push(`${descLabel}\n`);
  if (b.descriptionTruncated === true) {
    parts.push(`descriptionTruncated: yes\n`);
  } else {
    parts.push(`descriptionTruncated: no\n`);
  }

  parts.push(`\nCLI policy\n`);
  parts.push(
    renderRecordsTable(policyRows(b.cliPolicy), [
      { key: "key", header: "Key", width: 22 },
      { key: "value", header: "Value", width: 6 },
    ]),
  );

  for (const token of parsed.order) {
    if (token === "list" && body.lists) {
      parts.push(`\nLists\n`);
      const rows = body.lists.items.map((r) => ({
        listId: r.listId,
        name: r.name,
      }));
      parts.push(
        renderRecordsTable(rows, COLUMNS_DESCRIBE_LIST, sliceFooter(body.lists)),
      );
    } else if (token === "group" && body.groups) {
      parts.push(`\nGroups\n`);
      const rows = body.groups.items.map((r) => ({
        groupId: r.groupId,
        label: r.label,
        def: r.default ? "yes" : "no",
      }));
      parts.push(
        renderRecordsTable(rows, COLUMNS_DESCRIBE_GROUP, sliceFooter(body.groups)),
      );
    } else if (token === "priority" && body.priorities) {
      parts.push(`\nPriorities\n`);
      const rows = body.priorities.items.map((r) => ({
        priorityId: r.priorityId,
        label: r.label,
        value: r.value,
      }));
      parts.push(
        renderRecordsTable(
          rows,
          COLUMNS_DESCRIBE_PRIORITY,
          sliceFooter(body.priorities),
        ),
      );
    } else if (token === "release" && body.releases) {
      parts.push(`\nReleases\n`);
      const rows = body.releases.items.map((r) => ({
        releaseId: r.releaseId,
        name: r.name,
        releaseDate: r.releaseDate ?? "",
        def: r.default ? "yes" : "no",
      }));
      parts.push(
        renderRecordsTable(
          rows,
          COLUMNS_DESCRIBE_RELEASE,
          sliceFooter(body.releases),
        ),
      );
    } else if (token === "status" && body.statuses) {
      parts.push(`\nStatuses\n`);
      const rows = body.statuses.items.map((r) => ({
        statusId: r.statusId,
        label: r.label,
      }));
      parts.push(
        renderRecordsTable(
          rows,
          COLUMNS_DESCRIBE_STATUS,
          sliceFooter(body.statuses),
        ),
      );
    } else if (token === "meta" && body.meta) {
      parts.push(`\nMeta (slice caps)\n`);
      parts.push(
        renderRecordsTable(metaTableRows(body.meta), COLUMNS_DESCRIBE_META),
      );
    }
  }

  process.stdout.write(parts.join(""));
}

export function printBoardDescribeResponse(
  body: BoardDescribeResponse,
  parsed: ParsedBoardDescribeEntities & { ok: true },
): void {
  if (getCliOutputFormat() === "ndjson") {
    printBoardDescribeNdjson(body, parsed);
  } else {
    printBoardDescribeHuman(body, parsed);
  }
}
