import type { Database } from "bun:sqlite";

export function parseJsonColumn<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function statusWorkflowOrder(db: Database): string[] {
  const rows = db
    .query("SELECT id FROM status ORDER BY sort_order ASC, id ASC")
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Keep visible statuses in workflow order, drop unknown ids, default to full workflow when empty.
 * Drop band weights when length/values do not match visible statuses (client will recompute).
 */
export function normalizeBoardViewState(
  db: Database,
  visibleStatuses: string[],
  statusBandWeights: number[] | undefined,
): { visibleStatuses: string[]; statusBandWeights: number[] | undefined } {
  const workflowOrder = statusWorkflowOrder(db);
  const allowed = new Set(workflowOrder);
  let vis = visibleStatuses.filter((s) => allowed.has(s));
  if (vis.length === 0) {
    vis = [...workflowOrder];
  } else {
    vis = workflowOrder.filter((s) => vis.includes(s));
  }
  let weights = statusBandWeights;
  if (
    !weights ||
    weights.length !== vis.length ||
    !weights.every((n) => Number.isFinite(n) && n > 0)
  ) {
    weights = undefined;
  }
  return { visibleStatuses: vis, statusBandWeights: weights };
}

export function boardExists(db: Database, boardId: number): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM board WHERE id = ?")
    .get(boardId) as { ok: number } | null;
  return row != null;
}

/** True when `status.id` has `is_closed` set in the `status` table. */
export function statusIsClosed(db: Database, statusId: string): boolean {
  const row = db
    .query("SELECT is_closed FROM status WHERE id = ?")
    .get(statusId) as { is_closed: number } | null;
  return row != null && row.is_closed !== 0;
}
