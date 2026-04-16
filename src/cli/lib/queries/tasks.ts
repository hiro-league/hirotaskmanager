import { RELEASE_FILTER_UNTAGGED } from "../../../shared/boardFilters";
import type { PaginatedListBody } from "../../../shared/pagination";
import type { Task } from "../../../shared/models";
import {
  COLUMNS_TASKS_LIST,
  QUIET_DEFAULT_TASK,
} from "../core/listTableSpecs";
import { FIELDS_TASK } from "../core/jsonFieldProjection";
import { executePaginatedListRead } from "../client/paginatedListRead";
import type { CliContext } from "../../types/context";

/** Paginated tasks for a board (`GET /boards/:id/tasks`). */
export async function runBoardsTasksList(
  ctx: CliContext,
  idOrSlug: string,
  options: {
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
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  const params = new URLSearchParams();
  if (options.list?.trim()) params.set("listId", options.list.trim());
  for (const group of options.group ?? []) {
    params.append("groupId", group);
  }
  for (const priority of options.priority ?? []) {
    params.append("priorityId", priority);
  }
  for (const status of options.status ?? []) {
    params.append("status", status);
  }
  for (const rid of options.releaseId ?? []) {
    params.append("releaseId", rid);
  }
  if (options.untagged) {
    params.append("releaseId", RELEASE_FILTER_UNTAGGED);
  }
  if (options.dateMode?.trim()) {
    params.set("dateMode", options.dateMode.trim());
  }
  if (options.from?.trim()) params.set("from", options.from.trim());
  if (options.to?.trim()) params.set("to", options.to.trim());

  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: `/boards/${encodeURIComponent(idOrSlug)}/tasks`,
      extraParams: params,
      fieldAllowlist: FIELDS_TASK,
      columns: COLUMNS_TASKS_LIST,
      quietDefaults: QUIET_DEFAULT_TASK,
      fetchPage: (path) => ctx.fetchApi<PaginatedListBody<Task>>(path, { port }),
    },
    {
      limit: options.limit,
      offset: options.offset,
      pageAll: options.pageAll,
      fields: options.fields,
    },
  );
}
