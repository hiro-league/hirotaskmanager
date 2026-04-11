/** Global `--format ndjson|human` (see `program.ts` preAction). */
export type CliOutputFormat = "ndjson" | "human";

/** Plan for global `--quiet`: one plain-text cell per row. */
export type QuietListPlan = {
  defaultKeys: readonly string[];
  explicitField?: string;
};

/** Fixed-width column for `human` list output. */
export type TableColumn = { key: string; header: string; width: number };
