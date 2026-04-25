/** Temporary client-only ids (negative) until the server assigns real PKs. */
export function tempNumericId(): number {
  return -(Date.now() * 1000 + ((Math.random() * 0x7fffffff) | 0));
}

/** `board.lists` entries from optimistic list creation use `tempNumericId()`; positive ids are server-assigned. */
export function isOptimisticListId(listId: number): boolean {
  return listId < 0;
}
