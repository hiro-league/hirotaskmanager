import { mkdir } from "node:fs/promises";
import type { Status } from "../../../shared/models";
import { getDb, resolveDataDir } from "../../db";

/** Ensures the data directory exists (see docs/sqlite_migration §5a / §5d). */
export async function ensureDataDir(): Promise<void> {
  await mkdir(resolveDataDir(), { recursive: true });
}

/** Rows from `status` for `GET /api/statuses`. */
export function listStatuses(): Status[] {
  const db = getDb();
  const rows = db
    .query(
      "SELECT id, label, sort_order, is_closed FROM status ORDER BY sort_order ASC, id ASC",
    )
    .all() as {
    id: string;
    label: string;
    sort_order: number;
    is_closed: number;
  }[];
  return rows.map((r) => ({
    statusId: r.id,
    label: r.label,
    sortOrder: r.sort_order,
    isClosed: r.is_closed !== 0,
  }));
}
