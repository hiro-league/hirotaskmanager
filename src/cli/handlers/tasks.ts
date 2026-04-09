import { parsePortOption } from "../lib/command-helpers";
import { runTasksPurge, runTasksRestore } from "../lib/trashCommands";
import {
  runTasksAdd,
  runTasksDelete,
  runTasksMove,
  runTasksUpdate,
} from "../lib/writeCommands";
import type { CliContext } from "./context";

export async function handleTasksAdd(
  ctx: CliContext,
  options: {
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
  },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksAdd({
    port,
    board: options.board,
    list: options.list,
    group: options.group,
    title: options.title,
    status: options.status,
    priority: options.priority,
    release: options.release,
    releaseId: options.releaseId,
    emoji: options.emoji,
    clearEmoji: options.clearEmoji,
    body: options.body,
    bodyFile: options.bodyFile,
    bodyStdin: options.bodyStdin,
  });
}

export async function handleTasksUpdate(
  ctx: CliContext,
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
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksUpdate({
    port,
    board: options.board,
    taskId,
    title: options.title,
    body: options.body,
    bodyFile: options.bodyFile,
    bodyStdin: options.bodyStdin,
    status: options.status,
    list: options.list,
    group: options.group,
    priority: options.priority,
    release: options.release,
    releaseId: options.releaseId,
    color: options.color,
    clearColor: options.clearColor,
    emoji: options.emoji,
    clearEmoji: options.clearEmoji,
  });
}

export async function handleTasksDelete(
  ctx: CliContext,
  taskId: string,
  options: { port?: string; board: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksDelete({
    port,
    board: options.board,
    taskId,
  });
}

export async function handleTasksRestore(
  ctx: CliContext,
  taskId: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksRestore({ port, taskId });
}

export async function handleTasksPurge(
  ctx: CliContext,
  taskId: string,
  options: { port?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksPurge({ port, taskId });
}

export async function handleTasksMove(
  ctx: CliContext,
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
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  await runTasksMove({
    port,
    board: options.board,
    taskId,
    toList: options.toList,
    toStatus: options.toStatus,
    beforeTask: options.beforeTask,
    afterTask: options.afterTask,
    first: options.first,
    last: options.last,
  });
}
