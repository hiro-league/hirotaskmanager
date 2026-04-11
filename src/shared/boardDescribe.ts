import type { BoardCliPolicy } from "./cliPolicy";
import type { Board, ReleaseDefinition, Status } from "./models";

/** Max items per array section in `GET /api/boards/:id/describe` / `hirotm boards describe`. */
export const BOARD_DESCRIBE_MAX_ITEMS = 100;

/** Truncate board `description` in describe payloads (UTF-16 code units; aligns with JS string indexing). */
export const BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS = 4096;

/** `GET …/describe?entities=` tokens (`board` is implicit in the JSON; do not pass). */
const ENTITY_KEYS = [
  "list",
  "group",
  "priority",
  "release",
  "status",
  "meta",
] as const;

export type BoardDescribeEntity = (typeof ENTITY_KEYS)[number];

export const BOARD_DESCRIBE_ENTITY_NAMES: readonly BoardDescribeEntity[] =
  ENTITY_KEYS;

/** Default CLI/API section order when `entities` is omitted. */
export const BOARD_DESCRIBE_DEFAULT_ORDER: readonly BoardDescribeEntity[] = [
  "list",
  "group",
  "priority",
  "release",
  "status",
];

export type BoardDescribeListRow = {
  listId: number;
  name: string;
};

export type BoardDescribeGroupRow = {
  groupId: number;
  label: string;
  default: boolean;
};

export type BoardDescribePriorityRow = {
  priorityId: number;
  label: string;
  value: number;
};

export type BoardDescribeReleaseRow = {
  releaseId: number;
  name: string;
  releaseDate: string | null;
  default: boolean;
};

export type BoardDescribeStatusRow = {
  statusId: string;
  label: string;
};

export type BoardDescribeSlice<T> = {
  items: T[];
  truncated?: boolean;
  total?: number;
};

export type BoardDescribeBoardHeader = {
  boardId: number;
  slug: string;
  name: string;
  emoji?: string | null;
  description: string;
  /** Present when `description` was shortened (see {@link BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS}). */
  descriptionTruncated?: boolean;
  cliPolicy: BoardCliPolicy;
};

/** Aggregate slice stats for `entities=meta` (all five dimensions, even when counts are zero). */
export type BoardDescribeMeta = {
  lists: { truncated: boolean; total: number; shown: number };
  groups: { truncated: boolean; total: number; shown: number };
  priorities: { truncated: boolean; total: number; shown: number };
  releases: { truncated: boolean; total: number; shown: number };
  statuses: { truncated: boolean; total: number; shown: number };
};

export type BoardDescribeResponse = {
  board: BoardDescribeBoardHeader;
  lists?: BoardDescribeSlice<BoardDescribeListRow>;
  groups?: BoardDescribeSlice<BoardDescribeGroupRow>;
  priorities?: BoardDescribeSlice<BoardDescribePriorityRow>;
  releases?: BoardDescribeSlice<BoardDescribeReleaseRow>;
  statuses?: BoardDescribeSlice<BoardDescribeStatusRow>;
  /** Present when `meta` was requested; counts reflect cap/truncation rules per section. */
  meta?: BoardDescribeMeta;
};

function capItems<T>(items: T[]): BoardDescribeSlice<T> {
  if (items.length <= BOARD_DESCRIBE_MAX_ITEMS) {
    return { items };
  }
  return {
    items: items.slice(0, BOARD_DESCRIBE_MAX_ITEMS),
    truncated: true,
    total: items.length,
  };
}

export function truncateBoardDescribeDescription(raw: string): {
  text: string;
  truncated: boolean;
} {
  if (raw.length <= BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS) {
    return { text: raw, truncated: false };
  }
  return {
    text: raw.slice(0, BOARD_DESCRIBE_MAX_DESCRIPTION_CHARS),
    truncated: true,
  };
}

/**
 * Sort releases for describe: `releaseDate` descending, null dates last; tie-break `createdAt` desc, then `releaseId` desc.
 */
export function sortReleasesForDescribe(
  releases: readonly ReleaseDefinition[],
): ReleaseDefinition[] {
  return [...releases].sort((a, b) => {
    const ad =
      a.releaseDate != null && String(a.releaseDate).trim() !== ""
        ? String(a.releaseDate).trim()
        : null;
    const bd =
      b.releaseDate != null && String(b.releaseDate).trim() !== ""
        ? String(b.releaseDate).trim()
        : null;
    if (ad !== null && bd !== null) {
      const c = bd.localeCompare(ad);
      if (c !== 0) return c;
    } else if (ad !== null && bd === null) {
      return -1;
    } else if (ad === null && bd !== null) {
      return 1;
    }
    const tc = b.createdAt.localeCompare(a.createdAt);
    if (tc !== 0) return tc;
    return b.releaseId - a.releaseId;
  });
}

export type ParsedBoardDescribeEntities =
  | {
      ok: true;
      /** True when `entities` was omitted — default sections only, no `meta`. */
      includeAll: boolean;
      /** Emission / request order for row sections and `meta` (after implicit `board` + `policy` in CLI). */
      order: readonly BoardDescribeEntity[];
      set: Set<BoardDescribeEntity>;
    }
  | { ok: false; error: string };

function metaFromSlice(
  slice: BoardDescribeSlice<unknown>,
): { truncated: boolean; total: number; shown: number } {
  const shown = slice.items.length;
  return {
    truncated: slice.truncated === true,
    total: slice.total ?? shown,
    shown,
  };
}

/**
 * Parse `entities` query / `--entities` CSV. Empty / whitespace-only string is invalid.
 * When `raw` is `undefined`, all row sections are included in default order; **`meta` is not** included.
 * **`board` is invalid** (always returned in JSON). Duplicate tokens are rejected.
 */
export function parseBoardDescribeEntities(
  raw: string | undefined,
): ParsedBoardDescribeEntities {
  if (raw === undefined) {
    return {
      ok: true,
      includeAll: true,
      order: [...BOARD_DESCRIBE_DEFAULT_ORDER],
      set: new Set(BOARD_DESCRIBE_DEFAULT_ORDER),
    };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "entities must not be empty" };
  }
  const parts = trimmed
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return { ok: false, error: "entities must not be empty" };
  }
  const order: BoardDescribeEntity[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (p === "board") {
      return {
        ok: false,
        error:
          "unknown entity: board (board is always included in the response; omit it)",
      };
    }
    if (!ENTITY_KEYS.includes(p as BoardDescribeEntity)) {
      return { ok: false, error: `unknown entity: ${p}` };
    }
    if (seen.has(p)) {
      return { ok: false, error: `duplicate entity: ${p}` };
    }
    seen.add(p);
    order.push(p as BoardDescribeEntity);
  }
  return { ok: true, includeAll: false, order, set: new Set(order) };
}

export function buildBoardDescribeResponse(
  board: Omit<Board, "tasks">,
  statuses: readonly Status[],
  parsed: ParsedBoardDescribeEntities & { ok: true },
): BoardDescribeResponse {
  const { set } = parsed;
  const want = (e: BoardDescribeEntity) => set.has(e);

  const desc = truncateBoardDescribeDescription(board.description ?? "");
  const header: BoardDescribeBoardHeader = {
    boardId: board.boardId,
    slug: board.slug ?? "",
    name: board.name,
    emoji: board.emoji,
    description: desc.text,
    cliPolicy: board.cliPolicy,
  };
  if (desc.truncated) {
    header.descriptionTruncated = true;
  }

  const out: BoardDescribeResponse = { board: header };

  const listSlice = capItems(
    board.lists.map((l) => ({ listId: l.listId, name: l.name })),
  );
  const groupSlice = capItems(
    board.taskGroups.map((g) => ({
      groupId: g.groupId,
      label: g.label,
      default: g.groupId === board.defaultTaskGroupId,
    })),
  );
  const prioritySlice = capItems(
    board.taskPriorities.map((p) => ({
      priorityId: p.priorityId,
      label: p.label,
      value: p.value,
    })),
  );
  const releaseSorted = sortReleasesForDescribe(board.releases);
  const defId = board.defaultReleaseId;
  const releaseSlice = capItems(
    releaseSorted.map((r) => ({
      releaseId: r.releaseId,
      name: r.name,
      releaseDate: r.releaseDate ?? null,
      default: defId !== null && r.releaseId === defId,
    })),
  );
  const statusOrdered = [...statuses].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.statusId.localeCompare(b.statusId, "en"),
  );
  const statusSlice = capItems(
    statusOrdered.map((s) => ({ statusId: s.statusId, label: s.label })),
  );

  if (want("meta")) {
    out.meta = {
      lists: metaFromSlice(listSlice),
      groups: metaFromSlice(groupSlice),
      priorities: metaFromSlice(prioritySlice),
      releases: metaFromSlice(releaseSlice),
      statuses: metaFromSlice(statusSlice),
    };
  }

  if (want("list")) {
    out.lists = listSlice;
  }

  if (want("group")) {
    out.groups = groupSlice;
  }

  if (want("priority")) {
    out.priorities = prioritySlice;
  }

  if (want("release")) {
    out.releases = releaseSlice;
  }

  if (want("status")) {
    out.statuses = statusSlice;
  }

  return out;
}
