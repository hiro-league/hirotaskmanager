/**
 * Commander `addHelpText("after", …)` strings for every hirotm subcommand (cli guidelines #3 / #12).
 * Heading strings align with hiro-docs `mintdocs/task-manager/cli/*.mdx` (slug: see `docsAnchorFromHeading`).
 */

import { subcommandHelpExamplesText } from "./cliWebDocs";

// --- server ---
export const HELP_AFTER_SERVER_GROUP = subcommandHelpExamplesText({
  pageStem: "server",
  mdxHeading: "Where this lives",
  lines: ["hirotm server status", "hirotm server start"],
});

export const HELP_AFTER_SERVER_START = subcommandHelpExamplesText({
  pageStem: "server",
  mdxHeading: "hirotm server start",
  lines: [
    "hirotm server start",
    "hirotm server start --foreground --profile work",
  ],
});

export const HELP_AFTER_SERVER_STOP = subcommandHelpExamplesText({
  pageStem: "server",
  mdxHeading: "hirotm server stop",
  lines: ["hirotm server stop", "hirotm server stop --profile work"],
});

export const HELP_AFTER_SERVER_STATUS = subcommandHelpExamplesText({
  pageStem: "server",
  mdxHeading: "hirotm server status",
  lines: ["hirotm server status", "hirotm server status --profile work"],
});

// --- boards ---
export const HELP_AFTER_BOARDS_GROUP = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "Board Operations",
  lines: ["hirotm boards list", "hirotm boards describe sprint"],
});

export const HELP_AFTER_BOARDS_LIST = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards list",
  lines: [
    "hirotm boards list",
    "hirotm boards list --count-only",
    "hirotm boards list --page-all --limit 100",
    "hirotm boards list --fields boardId,slug,name",
  ],
});

export const HELP_AFTER_BOARDS_DESCRIBE = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards describe",
  lines: [
    "hirotm boards describe sprint",
    "hirotm boards describe sprint --entities list,group,priority",
  ],
});

export const HELP_AFTER_BOARDS_ADD = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards add",
  lines: [
    'hirotm boards add "Q2 Planning"',
    'hirotm boards add --emoji "📌" "Releases"',
  ],
});

export const HELP_AFTER_BOARDS_UPDATE = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards update",
  lines: [
    'hirotm boards update --name "Sprint 42" sprint',
    "hirotm boards update --board-color cyan --clear-emoji sprint",
  ],
});

export const HELP_AFTER_BOARDS_DELETE = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards delete",
  lines: [
    "hirotm boards delete old-sprint",
    "hirotm boards delete old-sprint --dry-run",
    "hirotm boards delete old-sprint --yes",
  ],
});

export const HELP_AFTER_BOARDS_RESTORE = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards restore",
  lines: [
    "hirotm boards restore 1",
    "hirotm boards restore old-sprint --yes",
  ],
});

export const HELP_AFTER_BOARDS_PURGE = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards purge",
  lines: [
    "hirotm boards purge 1",
    "hirotm boards purge 1 --dry-run",
    "hirotm boards purge 1 --yes",
  ],
});

export const HELP_AFTER_BOARDS_CONFIGURE_GROUP = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "Board Settings",
  lines: [
    "hirotm boards configure groups --file groups.json sprint",
    "hirotm boards configure priorities --file priorities.json sprint",
  ],
});

export const HELP_AFTER_BOARDS_CONFIGURE_GROUPS = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards configure groups",
  lines: [
    "hirotm boards configure groups --file groups.json sprint",
    "hirotm boards configure groups --file groups.json sprint --dry-run",
    "hirotm boards configure groups --file groups.json sprint --yes",
  ],
});

export const HELP_AFTER_BOARDS_CONFIGURE_PRIORITIES = subcommandHelpExamplesText({
  pageStem: "boards",
  mdxHeading: "boards configure priorities",
  lines: [
    "hirotm boards configure priorities --file priorities.json sprint",
    "hirotm boards configure priorities --file priorities.json sprint --dry-run",
    "hirotm boards configure priorities --file priorities.json sprint --yes",
  ],
});

// --- lists ---
export const HELP_AFTER_LISTS_GROUP = subcommandHelpExamplesText({
  pageStem: "lists",
  lines: [
    "hirotm lists list --board sprint",
    "hirotm lists show 3",
  ],
});

export const HELP_AFTER_LISTS_LIST = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists list",
  lines: [
    "hirotm lists list --board sprint",
    "hirotm lists list --board sprint --count-only",
    "hirotm lists list --board sprint --page-all",
    "hirotm lists list --board sprint --fields listId,name,order",
  ],
});

export const HELP_AFTER_LISTS_SHOW = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists show",
  lines: [
    "hirotm lists show 3",
    "hirotm lists show 3 --fields listId,name,order",
  ],
});

export const HELP_AFTER_LISTS_ADD = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists add",
  lines: [
    'hirotm lists add --board sprint "Ready"',
    'hirotm lists add --board sprint --emoji "🚀" "Launch"',
  ],
});

export const HELP_AFTER_LISTS_UPDATE = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists update",
  lines: [
    'hirotm lists update --name "In review" 12',
    "hirotm lists update --clear-color 12",
  ],
});

export const HELP_AFTER_LISTS_MOVE = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists move",
  lines: [
    "hirotm lists move --first 5",
    "hirotm lists move --after 3 5",
  ],
});

export const HELP_AFTER_LISTS_DELETE = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists delete",
  lines: [
    "hirotm lists delete 12",
    "hirotm lists delete 12 --dry-run",
    "hirotm lists delete 12 --yes",
  ],
});

export const HELP_AFTER_LISTS_RESTORE = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists restore",
  lines: [
    "hirotm lists restore 12",
    "hirotm lists restore 12 --yes",
  ],
});

export const HELP_AFTER_LISTS_PURGE = subcommandHelpExamplesText({
  pageStem: "lists",
  mdxHeading: "lists purge",
  lines: [
    "hirotm lists purge 12",
    "hirotm lists purge 12 --dry-run",
    "hirotm lists purge 12 --yes",
  ],
});

// --- releases ---
export const HELP_AFTER_RELEASES_GROUP = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "Release operations",
  lines: [
    "hirotm releases list --board sprint",
    "hirotm releases show --board sprint 1",
  ],
});

export const HELP_AFTER_RELEASES_LIST = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases list",
  lines: [
    "hirotm releases list --board sprint",
    "hirotm releases list --board sprint --count-only",
    "hirotm releases list --board sprint --page-all",
  ],
});

export const HELP_AFTER_RELEASES_SHOW = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases show",
  lines: [
    "hirotm releases show --board sprint 1",
    "hirotm releases show --board sprint --fields releaseId,name,color 1",
  ],
});

export const HELP_AFTER_RELEASES_ADD = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases add",
  lines: [
    'hirotm releases add --board sprint --name "v2.0" --release-date 2026-07-01',
  ],
});

export const HELP_AFTER_RELEASES_UPDATE = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases update",
  lines: ['hirotm releases update --board sprint --name "v1.0 GA" 1'],
});

export const HELP_AFTER_RELEASES_SET_DEFAULT = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases set-default",
  lines: [
    "hirotm releases set-default --board sprint 1",
    "hirotm releases set-default --board sprint --clear",
  ],
});

export const HELP_AFTER_RELEASES_DELETE = subcommandHelpExamplesText({
  pageStem: "releases",
  mdxHeading: "releases delete",
  lines: [
    "hirotm releases delete --board sprint 2",
    "hirotm releases delete --board sprint --move-tasks-to 1 2 --yes",
  ],
});

// --- tasks ---
export const HELP_AFTER_TASKS_GROUP = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "Task Operations",
  lines: [
    "hirotm tasks list --board sprint",
    "hirotm tasks add --board sprint --list 2 --group 1 --title \"Ship\"",
  ],
});

export const HELP_AFTER_TASKS_LIST = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks list",
  lines: [
    "hirotm tasks list --board sprint",
    "hirotm tasks list --board sprint --count-only",
    "hirotm tasks list --board sprint --limit 10",
    "hirotm tasks list --board sprint --status 2,3 --fields taskId,title",
  ],
});

export const HELP_AFTER_TASKS_SHOW = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks show",
  lines: [
    "hirotm tasks show 101",
    "hirotm tasks show 101 --fields taskId,title,status",
  ],
});

export const HELP_AFTER_TASKS_ADD = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks add",
  lines: [
    'hirotm tasks add --board sprint --list 2 --group 1 --title "Ship v1"',
    'hirotm tasks add --board sprint --list 2 --group 1 --title "Triage" --client-name "Cursor Agent"',
  ],
});

export const HELP_AFTER_TASKS_UPDATE = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks update",
  lines: [
    'hirotm tasks update --title "Ship v1.1" 101',
    "hirotm tasks update --list 3 --group 1 101",
  ],
});

export const HELP_AFTER_TASKS_MOVE = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks move",
  lines: [
    "hirotm tasks move --to-list 3 --first 101",
    "hirotm tasks move --to-list 3 --after-task 99 101",
  ],
});

export const HELP_AFTER_TASKS_DELETE = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks delete",
  lines: [
    "hirotm tasks delete 101",
    "hirotm tasks delete 101 --dry-run",
    "hirotm tasks delete 101 --yes",
  ],
});

export const HELP_AFTER_TASKS_RESTORE = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks restore",
  lines: ["hirotm tasks restore 101", "hirotm tasks restore 101 --yes"],
});

export const HELP_AFTER_TASKS_PURGE = subcommandHelpExamplesText({
  pageStem: "tasks",
  mdxHeading: "tasks purge",
  lines: [
    "hirotm tasks purge 101",
    "hirotm tasks purge 101 --dry-run",
    "hirotm tasks purge 101 --yes",
  ],
});

// --- statuses ---
export const HELP_AFTER_STATUSES_GROUP = subcommandHelpExamplesText({
  pageStem: "statuses",
  mdxHeading: "statuses list",
  lines: ["hirotm statuses list", "hirotm statuses list --fields statusId,label,isClosed"],
});

export const HELP_AFTER_STATUSES_LIST = HELP_AFTER_STATUSES_GROUP;

// --- trash ---
export const HELP_AFTER_TRASH_GROUP = subcommandHelpExamplesText({
  pageStem: "trash",
  mdxHeading: "Trash views",
  lines: [
    "hirotm trash list boards",
    "hirotm trash list tasks --count-only",
    "hirotm trash list tasks --limit 50",
  ],
});

export const HELP_AFTER_TRASH_LIST_GROUP = subcommandHelpExamplesText({
  pageStem: "trash",
  mdxHeading: "Trash views",
  lines: [
    "hirotm trash list boards",
    "hirotm trash list lists",
    "hirotm trash list tasks",
  ],
});

export const HELP_AFTER_TRASH_LIST_BOARDS = subcommandHelpExamplesText({
  pageStem: "trash",
  mdxHeading: "trash list boards",
  lines: [
    "hirotm trash list boards",
    "hirotm trash list boards --page-all",
    "hirotm trash list boards --fields boardId,name,slug",
  ],
});

export const HELP_AFTER_TRASH_LIST_LISTS = subcommandHelpExamplesText({
  pageStem: "trash",
  mdxHeading: "trash list lists",
  lines: ["hirotm trash list lists", "hirotm trash list lists --page-all --limit 100"],
});

export const HELP_AFTER_TRASH_LIST_TASKS = subcommandHelpExamplesText({
  pageStem: "trash",
  mdxHeading: "trash list tasks",
  lines: [
    "hirotm trash list tasks",
    "hirotm trash list tasks --limit 200 --offset 0",
  ],
});

// --- query ---
export const HELP_AFTER_QUERY_GROUP = subcommandHelpExamplesText({
  pageStem: "search",
  mdxHeading: "query search",
  lines: [
    'hirotm query search "login bug"',
    'hirotm query search "login bug" --count-only',
    "hirotm query search password --board sprint --limit 10",
  ],
});
