import { printJson } from "../lib/output";
import type { OutputPort } from "../ports/output";

/** Stdout/stderr implementation using `process` streams (Bun/Node). */
export function createNodeOutputAdapter(): OutputPort {
  return { printJson };
}
