import { migration001 } from "./001_initial";
import { migration002 } from "./002_closed_at";
import type { Migration } from "./types";

/** Numbered migrations, ascending by version. */
export const migrations: Migration[] = [migration001, migration002];
