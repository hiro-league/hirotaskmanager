import type { ListWithBoard } from "../../../shared/models";
import { CLI_ERR } from "../../types/errors";
import {
  FIELDS_LIST,
  parseAndValidateFields,
  projectRecord,
} from "../core/jsonFieldProjection";
import { requireNdjsonWhenUsingFields } from "../core/command-helpers";
import { parsePositiveInt } from "../mutations/write/helpers";
import { CliError } from "../output/output";
import type { CliContext } from "../../types/context";

/** One list by global id (`GET /api/lists/:listId`). */
export async function runListsShow(
  ctx: CliContext,
  listIdRaw: string,
  options: { fields?: string },
): Promise<void> {
  const port = ctx.resolvePort();
  const fieldKeys = parseAndValidateFields(options.fields, FIELDS_LIST);
  requireNdjsonWhenUsingFields(fieldKeys);
  const listId = parsePositiveInt("listId", listIdRaw.trim());
  if (listId === undefined) {
    throw new CliError("Invalid list id", 2, {
      code: CLI_ERR.invalidValue,
      listId: listIdRaw,
    });
  }
  const list = await ctx.fetchApi<ListWithBoard>(`/lists/${listId}`, { port });
  ctx.printJson(fieldKeys?.length ? projectRecord(list, fieldKeys) : list);
}
