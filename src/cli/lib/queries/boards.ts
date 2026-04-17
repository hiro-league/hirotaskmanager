import type { PaginatedListBody } from "../../../shared/pagination";
import type { BoardIndexEntry } from "../../../shared/models";
import {
  COLUMNS_BOARDS_LIST,
  QUIET_DEFAULT_BOARD_INDEX,
} from "../core/listTableSpecs";
import { FIELDS_BOARD_INDEX } from "../core/jsonFieldProjection";
import { executePaginatedListRead } from "../client/paginatedListRead";
import type { CliContext } from "../../types/context";

/** Boards index list (`GET /boards`). */
export async function runBoardsList(
  ctx: CliContext,
  options: {
    limit?: string;
    offset?: string;
    pageAll?: boolean;
    countOnly?: boolean;
    fields?: string;
  },
): Promise<void> {
  const port = ctx.resolvePort();
  await executePaginatedListRead(
    {
      kind: "optionalLimit",
      basePath: "/boards",
      fieldAllowlist: FIELDS_BOARD_INDEX,
      columns: COLUMNS_BOARDS_LIST,
      quietDefaults: QUIET_DEFAULT_BOARD_INDEX,
      fetchPage: (path) =>
        ctx.fetchApi<PaginatedListBody<BoardIndexEntry>>(path, { port }),
    },
    options,
  );
}
