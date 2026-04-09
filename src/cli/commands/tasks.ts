import { Command } from "commander";
import type { CliContext } from "../handlers/context";
import {
  handleTasksAdd,
  handleTasksDelete,
  handleTasksMove,
  handleTasksPurge,
  handleTasksRestore,
  handleTasksUpdate,
} from "../handlers/tasks";
import { addPortOption, withCliErrors } from "../lib/command-helpers";

export function registerTaskCommands(
  program: Command,
  ctx: CliContext,
): void {
  const tasksCommand = program
    .command("tasks")
    .description("Create and update tasks on boards");

  addPortOption(
    tasksCommand
      .command("add")
      .description("Create a task")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .requiredOption("--list <id>", "Destination list id")
      .requiredOption("--group <id>", "Task group id")
      .option("--title <text>", 'Title (default "Untitled")')
      .option("--status <id>", "Workflow status id (default open)")
      .option(
        "--priority <id>",
        "Task priority row id (omit to use builtin none for this board)",
      )
      .option(
        "--release <name-or-none>",
        "Release by exact board name, or none for untagged (omit with --release-id for server auto-assign)",
      )
      .option(
        "--release-id <id>",
        "Numeric release id (mutually exclusive with --release)",
      )
      .option("--emoji <text>", "Optional emoji before the title")
      .option("--clear-emoji", "Clear task emoji")
      .option("--body <text>", "Task body (Markdown)")
      .option("--body-file <path>", "Read body from a UTF-8 file")
      .option("--body-stdin", "Read body from stdin until EOF"),
  ).action(
    async (options: {
      port?: string;
      board: string;
      list: string;
      group: string;
      title?: string;
      status?: string;
      priority?: string;
      release?: string;
      releaseId?: string;
      emoji?: string;
      clearEmoji?: boolean;
      body?: string;
      bodyFile?: string;
      bodyStdin?: boolean;
    }) => {
      await withCliErrors(() => handleTasksAdd(ctx, options));
    },
  );

  addPortOption(
    tasksCommand
      .command("update")
      .description("Patch fields on a task")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<task-id>", "Numeric task id")
      .option("--title <text>", "Task title")
      .option("--body <text>", "Task body (Markdown)")
      .option("--body-file <path>", "Read body from a UTF-8 file")
      .option("--body-stdin", "Read body from stdin until EOF")
      .option("--status <id>", "Workflow status id")
      .option("--list <id>", "List id")
      .option("--group <id>", "Task group id")
      .option(
        "--priority <id>",
        "Task priority row id (use builtin none id to reset to default)",
      )
      .option(
        "--release <name-or-none>",
        "Set release by exact board name, or none to clear",
      )
      .option(
        "--release-id <id>",
        "Set release by numeric id (mutually exclusive with --release)",
      )
      .option("--color <css>", "Card color (CSS)")
      .option("--clear-color", "Clear card color")
      .option("--emoji <text>", "Emoji before the title")
      .option("--clear-emoji", "Clear emoji"),
  ).action(
    async (
      taskId: string,
      options: {
        port?: string;
        board: string;
        title?: string;
        body?: string;
        bodyFile?: string;
        bodyStdin?: boolean;
        status?: string;
        list?: string;
        group?: string;
        priority?: string;
        release?: string;
        releaseId?: string;
        color?: string;
        clearColor?: boolean;
        emoji?: string;
        clearEmoji?: boolean;
      },
    ) => {
      await withCliErrors(() => handleTasksUpdate(ctx, taskId, options));
    },
  );

  addPortOption(
    tasksCommand
      .command("delete")
      .description(
        "Move a task to Trash (tasks restore / purge use the task id only)",
      )
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .argument("<task-id>", "Numeric task id"),
  ).action(
    async (taskId: string, options: { port?: string; board: string }) => {
      await withCliErrors(() => handleTasksDelete(ctx, taskId, options));
    },
  );

  addPortOption(
    tasksCommand
      .command("restore")
      .description("Restore a task from Trash (board and list must allow it)")
      .argument("<task-id>", "Numeric task id (see: hirotm trash tasks)"),
  ).action(async (taskId: string, options: { port?: string }) => {
    await withCliErrors(() => handleTasksRestore(ctx, taskId, options));
  });

  addPortOption(
    tasksCommand
      .command("purge")
      .description("Permanently delete a task from Trash (cannot be undone)")
      .argument("<task-id>", "Numeric task id"),
  ).action(async (taskId: string, options: { port?: string }) => {
    await withCliErrors(() => handleTasksPurge(ctx, taskId, options));
  });

  addPortOption(
    tasksCommand
      .command("move")
      .description("Move a task with server-owned relative placement")
      .requiredOption("--board <id-or-slug>", "Board id or slug")
      .requiredOption("--to-list <id>", "Destination list id")
      .argument("<task-id>", "Numeric task id")
      .option(
        "--to-status <id>",
        "Workflow status in the destination (default: keep current)",
      )
      .option(
        "--before-task <id>",
        "Place before another task in the destination band",
      )
      .option(
        "--after-task <id>",
        "Place after another task in the destination band",
      )
      .option("--first", "Move to the first position in the destination band")
      .option("--last", "Move to the last position in the destination band"),
  ).action(
    async (
      taskId: string,
      options: {
        port?: string;
        board: string;
        toList: string;
        toStatus?: string;
        beforeTask?: string;
        afterTask?: string;
        first?: boolean;
        last?: boolean;
      },
    ) => {
      await withCliErrors(() => handleTasksMove(ctx, taskId, options));
    },
  );
}
