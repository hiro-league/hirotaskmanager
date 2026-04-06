/** Granular CLI permissions for one board (Phase 2). */
export interface BoardCliPolicy {
  readBoard: boolean;
  createTasks: boolean;
  manageCliCreatedTasks: boolean;
  manageAnyTasks: boolean;
  createLists: boolean;
  manageCliCreatedLists: boolean;
  manageAnyLists: boolean;
  manageStructure: boolean;
  deleteBoard: boolean;
  /** PATCH board metadata, emoji, description, theme color, and view prefs. */
  editBoard: boolean;
}

export interface CliGlobalPolicy {
  createBoard: boolean;
}

export const EMPTY_BOARD_CLI_POLICY: BoardCliPolicy = {
  readBoard: false,
  createTasks: false,
  manageCliCreatedTasks: false,
  manageAnyTasks: false,
  createLists: false,
  manageCliCreatedLists: false,
  manageAnyLists: false,
  manageStructure: false,
  deleteBoard: false,
  editBoard: false,
};

export const FULL_BOARD_CLI_POLICY: BoardCliPolicy = {
  readBoard: true,
  createTasks: true,
  manageCliCreatedTasks: true,
  manageAnyTasks: true,
  createLists: true,
  manageCliCreatedLists: true,
  manageAnyLists: true,
  manageStructure: true,
  deleteBoard: true,
  editBoard: true,
};

/** Persisted policy: `manage_any_*` implies the matching `manage_cli_created_*` flags. */
export function normalizeBoardCliPolicyImplied(p: BoardCliPolicy): BoardCliPolicy {
  if (!p.readBoard) {
    return { ...EMPTY_BOARD_CLI_POLICY };
  }
  return {
    ...p,
    manageCliCreatedTasks: p.manageAnyTasks || p.manageCliCreatedTasks,
    manageCliCreatedLists: p.manageAnyLists || p.manageCliCreatedLists,
  };
}

const BOARD_CLI_POLICY_KEYS = [
  "readBoard",
  "createTasks",
  "manageCliCreatedTasks",
  "manageAnyTasks",
  "createLists",
  "manageCliCreatedLists",
  "manageAnyLists",
  "manageStructure",
  "deleteBoard",
  "editBoard",
] as const satisfies readonly (keyof BoardCliPolicy)[];

/** Strict parser for `PATCH /api/boards/:id` with a full granular `cliPolicy` object. */
export function parseBoardCliPolicy(raw: unknown): BoardCliPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: Partial<BoardCliPolicy> = {};
  for (const key of BOARD_CLI_POLICY_KEYS) {
    if (!(key in o) || typeof o[key] !== "boolean") return null;
    out[key] = o[key] as boolean;
  }
  return out as BoardCliPolicy;
}
