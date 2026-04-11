import {
  readServerStatus,
  startServer,
  stopServer,
} from "../lib/process";
import type { ProcessPort } from "../ports/process";

/** Bun.spawn + pid file + health polling for managed servers. */
export function createNodeProcessAdapter(): ProcessPort {
  return {
    readServerStatus,
    startServer,
    stopServer,
  };
}
