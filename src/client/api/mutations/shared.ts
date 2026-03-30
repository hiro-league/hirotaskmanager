/** Temporary client-only ids (negative) until the server assigns real PKs. */
export function tempNumericId(): number {
  return -(Date.now() * 1000 + ((Math.random() * 0x7fffffff) | 0));
}
