#!/usr/bin/env bun
/**
 * Dev-only: create one board with N lists and (N × per-list) tasks for UI/perf testing.
 * Uses the app DB and storage helpers (same code paths as the server), but bulk-inserts
 * tasks in one transaction so seeding large boards stays fast (avoids thousands of loadBoard calls).
 *
 * Usage:
 *   bun run scripts/seed-perf-board.ts --lists 50 --per-list 200
 *   DATA_DIR=/path bun run scripts/seed-perf-board.ts --lists 10 --per-list 100
 */
import { parseArgs } from "node:util";
import { coerceTaskStatus } from "../src/shared/models";
import { runMigrations, getDb, withTransaction } from "../src/server/db";
import { generateSlug, createBoardWithDefaults } from "../src/server/storage/board";
import { createListOnBoard } from "../src/server/storage/lists";
import { statusWorkflowOrder, statusIsClosed } from "../src/server/storage/helpers";

function usage(): void {
  console.error(`Usage: bun run scripts/seed-perf-board.ts [options]

Options:
  --lists <n>       Number of lists (default: 10)
  --per-list <n>    Tasks per list; total tasks = lists × per-list (default: 100)
  --name <text>     Board title (default: Perf seed …)
  --help            Show this message
`);
}

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(xs: readonly T[]): T {
  return xs[randInt(xs.length)]!;
}

const ADJ = [
  "urgent", "minor", "blocked", "ready", "draft", "review", "spike", "polish",
  "flaky", "slow", "fast", "missing", "broken", "legacy", "new",
] as const;
const NOUN = [
  "auth", "cache", "search", "drag", "sync", "SSE", "board", "list", "task",
  "migration", "CLI", "API", "UI", "perf", "bundle", "theme", "emoji",
] as const;

function randomTitle(i: number): string {
  return `${pick(ADJ)} ${pick(NOUN)} #${i}`;
}

function randomBody(i: number): string {
  const lines = randInt(4) + 1;
  const parts: string[] = [];
  for (let L = 0; L < lines; L++) {
    parts.push(
      `Paragraph ${L + 1} for task ${i}: ${pick(ADJ)} ${pick(NOUN)}, ${pick(ADJ)} ${pick(NOUN)}.`,
    );
  }
  return parts.join("\n\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      lists: { type: "string" },
      "per-list": { type: "string" },
      name: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    process.exit(0);
  }

  const lists = Math.max(1, parseInt(values.lists ?? "10", 10) || 10);
  const perList = Math.max(1, parseInt(values["per-list"] ?? "100", 10) || 100);
  const total = lists * perList;
  const boardName =
    values.name?.trim() ||
    `Perf seed ${lists}×${perList} (${total} tasks)`;

  runMigrations();
  const db = getDb();

  const slug = await generateSlug(boardName.replace(/\s+/g, "-").toLowerCase());
  const board = await createBoardWithDefaults(boardName, slug, null);
  const boardId = board.id;

  for (let i = 0; i < lists; i++) {
    createListOnBoard(boardId, { name: `List ${i + 1}` });
  }

  const listRows = db
    .query(
      "SELECT id FROM list WHERE board_id = ? ORDER BY sort_order ASC, id ASC",
    )
    .all(boardId) as { id: number }[];
  const listIds = listRows.map((r) => r.id);

  const groupRows = db
    .query("SELECT id FROM task_group WHERE board_id = ? ORDER BY id ASC")
    .all(boardId) as { id: number }[];
  const groupIds = groupRows.map((r) => r.id);

  const priorityRows = db
    .query("SELECT id FROM task_priority WHERE board_id = ? ORDER BY id ASC")
    .all(boardId) as { id: number }[];
  const priorityIds = priorityRows.map((r) => r.id);

  const allowedStatuses = statusWorkflowOrder(db);
  const statusPool = ["open", "in-progress", "closed"] as const;

  const bandOrder = new Map<string, number>();
  function nextSortOrder(listId: number, statusId: string): number {
    const key = `${listId}:${statusId}`;
    const next = (bandOrder.get(key) ?? -1) + 1;
    bandOrder.set(key, next);
    return next;
  }

  let taskIndex = 0;
  withTransaction(db, () => {
    const nowBase = Date.now();
    for (const listId of listIds) {
      for (let t = 0; t < perList; t++) {
        taskIndex++;
        const rawStatus = pick(statusPool);
        const statusId = coerceTaskStatus(rawStatus, allowedStatuses);
        const closedAt = statusIsClosed(db, statusId)
          ? new Date(nowBase + taskIndex).toISOString()
          : null;
        const groupId = pick(groupIds);
        const usePriority = priorityIds.length > 0 && Math.random() > 0.15;
        const priorityId = usePriority ? pick(priorityIds) : null;
        const title = randomTitle(taskIndex);
        const body = randomBody(taskIndex);
        const sortOrder = nextSortOrder(listId, statusId);
        const now = new Date(nowBase + taskIndex).toISOString();

        db.run(
          `INSERT INTO task (list_id, group_id, priority_id, board_id, status_id,
             title, body, sort_order, color, emoji, created_at, updated_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            listId,
            groupId,
            priorityId,
            boardId,
            statusId,
            title,
            body,
            sortOrder,
            null,
            null,
            now,
            now,
            closedAt,
          ],
        );
      }
    }
    db.run("UPDATE board SET updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      boardId,
    ]);
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        boardId,
        slug: board.slug,
        name: boardName,
        lists,
        perList,
        totalTasks: total,
        dataDir: process.env.DATA_DIR ?? "(cwd)/data",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
