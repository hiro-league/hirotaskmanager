import type { Status } from "../../shared/models";
import { parsePortOption } from "../lib/command-helpers";
import {
  FIELDS_STATUS,
  parseAndValidateFields,
  projectArrayItems,
} from "../lib/jsonFieldProjection";
import type { CliContext } from "./context";

export async function handleStatusesList(
  ctx: CliContext,
  options: { port?: string; fields?: string },
): Promise<void> {
  const port = ctx.resolvePort({ port: parsePortOption(options.port) });
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_STATUS);
  const statuses = await ctx.fetchApi<Status[]>("/statuses", { port });
  ctx.printJson(
    fieldKeys ? projectArrayItems(statuses, fieldKeys) : statuses,
  );
}
