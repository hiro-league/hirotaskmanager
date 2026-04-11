import type { Status } from "../../shared/models";
import {
  parsePortOption,
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "../lib/command-helpers";
import {
  FIELDS_STATUS,
  parseAndValidateFields,
  projectArrayItems,
} from "../lib/jsonFieldProjection";
import {
  COLUMNS_STATUSES_LIST,
  QUIET_DEFAULT_STATUS,
} from "../lib/listTableSpecs";
import { printArrayListRead } from "../lib/output";
import type { CliContext } from "./context";

export async function handleStatusesList(
  ctx: CliContext,
  options: { port?: string; fields?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_STATUS);
  requireNdjsonWhenUsingFields(fieldKeys);
  requireNdjsonWhenQuiet();
  const quietExplicit = resolveQuietExplicitField(fieldKeys);
  const statuses = await ctx.fetchApi<Status[]>("/statuses", { port });
  const rows = fieldKeys ? projectArrayItems(statuses, fieldKeys) : statuses;
  printArrayListRead(rows, COLUMNS_STATUSES_LIST, {
    defaultKeys: QUIET_DEFAULT_STATUS,
    explicitField: quietExplicit,
  });
}
