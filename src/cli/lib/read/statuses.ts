import type { Status } from "../../../shared/models";
import {
  requireNdjsonWhenQuiet,
  requireNdjsonWhenUsingFields,
  resolveQuietExplicitField,
} from "../command-helpers";
import {
  FIELDS_STATUS,
  parseAndValidateFields,
  projectArrayItems,
} from "../jsonFieldProjection";
import {
  COLUMNS_STATUSES_LIST,
  QUIET_DEFAULT_STATUS,
} from "../listTableSpecs";
import { printArrayListRead } from "../output";
import type { CliContext } from "../../types/context";

/** Global workflow statuses (`GET /statuses`). */
export async function runStatusesList(
  ctx: CliContext,
  options: { fields?: string },
): Promise<void> {
  const port = ctx.resolvePort();
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
