import type { Task } from "../../../../shared/models";

const FNV_OFFSET = 2166136261 >>> 0;
const FNV_PRIME = 16777619;

function fnv1aAddUint32(h: number, n: number): number {
  h ^= n >>> 0;
  return Math.imul(h, FNV_PRIME) >>> 0;
}

/**
 * FNV-1a fingerprint of task layout fields in `tasks` **array order** (board perf plan Phase 2 #8).
 * Replaces a giant `join("|")` string used only to invalidate DnD container-map memos when
 * list/status/order/group/priority/release placement changes.
 */
export function hashTasksForDndLayoutDeps(tasks: readonly Task[]): number {
  let h = FNV_OFFSET;
  for (const t of tasks) {
    h = fnv1aAddUint32(h, t.taskId);
    h = fnv1aAddUint32(h, t.listId);
    for (let i = 0; i < t.status.length; i++) {
      h = fnv1aAddUint32(h, t.status.charCodeAt(i));
    }
    h = fnv1aAddUint32(h, t.order);
    h = fnv1aAddUint32(h, t.groupId);
    h = fnv1aAddUint32(h, t.priorityId);
    h = fnv1aAddUint32(h, t.releaseId == null ? -1 : t.releaseId);
  }
  h = fnv1aAddUint32(h, tasks.length);
  return h >>> 0;
}

/**
 * Structural equality for task container maps without building sorted key strings (plan #8).
 */
export function taskContainerMapsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
  }
  for (const k of ak) {
    const aa = a[k];
    const bb = b[k];
    if (aa === undefined || bb === undefined) return false;
    if (aa.length !== bb.length) return false;
    for (let j = 0; j < aa.length; j++) {
      if (aa[j] !== bb[j]) return false;
    }
  }
  return true;
}
