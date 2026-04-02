import { migration001 } from "./001_initial";
import { migration002 } from "./002_closed_at";
import { migration003 } from "./003_task_search_fts5";
import { migration004 } from "./004_task_search_extended";
import { migration005 } from "./005_task_priorities";
import type { Migration } from "./types";

/** Numbered migrations, ascending by version. */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];
