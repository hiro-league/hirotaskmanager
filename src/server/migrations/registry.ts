import { migration001 } from "./001_initial";
import type { Migration } from "./types";

/** Numbered migrations, ascending by version. */
export const migrations: Migration[] = [migration001];
