import { migration001 } from "./001_initial";
import { migration002 } from "./002_closed_at";
import { migration003 } from "./003_task_search_fts5";
import { migration004 } from "./004_task_search_extended";
import { migration005 } from "./005_task_priorities";
import { migration006 } from "./006_task_group_emoji";
import { migration007 } from "./007_task_emoji";
import { migration008 } from "./008_list_emoji";
import { migration009 } from "./009_board_emoji";
import { migration010 } from "./010_celebration_sounds_muted";
import { migration011 } from "./011_board_cli_access";
import { migration012 } from "./012_notification_event";
import type { Migration } from "./types";

/** Numbered migrations, ascending by version. */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
];
