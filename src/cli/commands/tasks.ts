import { Command } from "commander";
import type { CliContext } from "../types/context";
// Board-scoped task listing lives in boards handlers (shared GET /boards/:id/tasks); `tasks list` is the CLI home for that API.
import { handleBoardsTasks } from "../handlers/boards";
import {
  handleTasksAdd,
  handleTasksDelete,
  handleTasksMove,
  handleTasksPurge,
  handleTasksRestore,
  handleTasksShow,
  handleTasksUpdate,
} from "../handlers/tasks";
import {
  addClientNameOption,
  addCountOnlyOption,
  addDryRunOption,
  addYesOption,
  CLI_FIELDS_OPTION_DESC,
  cliAction,
  collectMultiValue,
} from "../lib/core/command-helpers";
import { CLI_DEFAULTS } from "../lib/core/constants";
import {
  HELP_AFTER_TASKS_ADD,
  HELP_AFTER_TASKS_DELETE,
  HELP_AFTER_TASKS_GROUP,
  HELP_AFTER_TASKS_LIST,
  HELP_AFTER_TASKS_MOVE,
  HELP_AFTER_TASKS_PURGE,
  HELP_AFTER_TASKS_RESTORE,
  HELP_AFTER_TASKS_SHOW,
  HELP_AFTER_TASKS_UPDATE,
} from "../lib/core/cliCommandHelp";

export function registerTaskCommands(
  program: Command,
  ctx: CliContext,
): void {
  const tasksCommand = program
    .command("tasks")
    .description("List, show, create, and update tasks on boards")
    .addHelpText("after", HELP_AFTER_TASKS_GROUP);

  addClientNameOption(
    addCountOnlyOption(
      tasksCommand
        .command("list")
        .description("List filtered tasks for one board")
        .requiredOption("--board <id-or-slug>", "Board id or slug")
      .option("--list <id>", "List id")
      .option(
        "--group <id>",
        "Task group ids, comma separated",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--priority <id>",
        "Task priority ids, comma separated",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--status <id>",
        "Workflow status ids, comma separated",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--release-id <id>",
        "Release ids, comma separated",
        collectMultiValue,
        [] as string[],
      )
      .option(
        "--untagged",
        "Include tasks with no release",
      )
      .option("--date-mode <mode>", "Date filter mode: opened, closed, or any")
      .option("--from <yyyy-mm-dd>", "Inclusive start date")
      .option("--to <yyyy-mm-dd>", "Inclusive end date")
      .option(
        "--limit <n>",
        "Page size",
      )
      .option("--offset <n>", "Skip n tasks (default 0)")
      .option(
        "--page-all",
        `Fetch all pages (up to ${CLI_DEFAULTS.MAX_PAGE_LIMIT})`,
      )
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
      .addHelpText("after", HELP_AFTER_TASKS_LIST),
    ),
  ).action(
    cliAction((options: {
      board: string;
      list?: string;
      group?: string[];
      priority?: string[];
      status?: string[];
      releaseId?: string[];
      untagged?: boolean;
      dateMode?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
      pageAll?: boolean;
      countOnly?: boolean;
      fields?: string;
    }) =>
      handleBoardsTasks(ctx, options.board, {
        list: options.list,
        group: options.group,
        priority: options.priority,
        status: options.status,
        releaseId: options.releaseId,
        untagged: options.untagged,
        dateMode: options.dateMode,
        from: options.from,
        to: options.to,
        limit: options.limit,
        offset: options.offset,
        pageAll: options.pageAll,
        countOnly: options.countOnly,
        fields: options.fields,
      })),
  );

  addClientNameOption(
    tasksCommand
      .command("show")
      .description("Show one task by global id")
      .argument("<task-id>", "Numeric task id")
      .option("--fields <keys>", CLI_FIELDS_OPTION_DESC)
      .addHelpText("after", HELP_AFTER_TASKS_SHOW),
  ).action(
    cliAction((taskId: string, options: { fields?: string }) =>
      handleTasksShow(ctx, taskId, options)),
  );

  addClientNameOption(
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
      .option("--body-stdin", "Read body from stdin until EOF")
      .addHelpText("after", HELP_AFTER_TASKS_ADD),
  ).action(
    cliAction((options: {
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
    }) => handleTasksAdd(ctx, options)),
  );

  addClientNameOption(
    tasksCommand
      .command("update")
      .description("Patch fields on a task")
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
      .option("--clear-emoji", "Clear emoji")
      .addHelpText("after", HELP_AFTER_TASKS_UPDATE),
  ).action(
    cliAction(
      (
        taskId: string,
        options: {
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
      ) => handleTasksUpdate(ctx, taskId, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        tasksCommand
          .command("delete")
          .description(
            "Move a task to Trash (tasks restore / purge use the task id only)",
          )
          .argument("<task-id>", "Numeric task id")
          .addHelpText("after", HELP_AFTER_TASKS_DELETE),
      ),
    ),
  ).action(
    cliAction(
      (
        taskId: string,
        options: { yes?: boolean; dryRun?: boolean },
      ) => handleTasksDelete(ctx, taskId, options),
    ),
  );

  addClientNameOption(
    addYesOption(
      tasksCommand
        .command("restore")
        .description("Restore a task from Trash (board and list must allow it)")
        .argument("<task-id>", "Numeric task id (see: hirotm trash list tasks)")
        .addHelpText("after", HELP_AFTER_TASKS_RESTORE),
    ),
  ).action(
    cliAction((taskId: string, options: { yes?: boolean }) =>
      handleTasksRestore(ctx, taskId, options),
    ),
  );

  addClientNameOption(
    addDryRunOption(
      addYesOption(
        tasksCommand
          .command("purge")
          .description(
            "Permanently delete a task from Trash (cannot be undone)",
          )
          .argument("<task-id>", "Numeric task id")
          .addHelpText("after", HELP_AFTER_TASKS_PURGE),
      ),
    ),
  ).action(
    cliAction(
      (taskId: string, options: { yes?: boolean; dryRun?: boolean }) =>
        handleTasksPurge(ctx, taskId, options),
    ),
  );

  addClientNameOption(
    tasksCommand
      .command("move")
      .description("Move a task with server-owned relative placement")
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
      .option("--last", "Move to the last position in the destination band")
      .addHelpText("after", HELP_AFTER_TASKS_MOVE),
  ).action(
    cliAction(
      (
        taskId: string,
        options: {
          toList: string;
          toStatus?: string;
          beforeTask?: string;
          afterTask?: string;
          first?: boolean;
          last?: boolean;
        },
      ) => handleTasksMove(ctx, taskId, options),
    ),
  );
}
