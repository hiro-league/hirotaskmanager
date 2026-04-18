Request ID:
8efef7a1-ded3-4af6-8caa-e32371a4519b


# Round 1 Questions


## Context from your codebase

So before implementing Archive, the very first question is **why archive in addition to trash** — what semantic gap does it fill?

## Requirements questions you need to answer

**Semantic / product**

1. **Why archive vs trash?** 

Tasks that I processed but decided not to work on for a variety of reason, duplicate, turned to be non issue, decided not to do.
I put them in a place, i dont see them anymore, they dont appear in my reports.
but i can search for them if needed, i can retrieve them if needed.

2. **Lifecycle interaction with status `closed`** 
Yes it is kind of closed but not completed for whatever reason, they don't even count towards closed in statistics and reports. i dont know if that qualifies as ui filter.

3. **Manual only, or automatic?** 

it's user's decision to archive or not.

4. **Scope**: 

i can only see a usecase for tasks. But with the same concept, we could later archive boards that are not currently active or that i dont want to see cluttering my space. not sure if its the same meaning, its probably not, and its definitely not in my scope now.

5. **Cascade semantics**: 

no list archive, no board archive now, no cascade.

**Visibility**

6. Should archived tasks appear in board view by default? With a "Show archived" toggle? Or only on a dedicated archive view?

yes, toggle is fine.

7. Should FTS search include archived tasks by default, with a flag to exclude, or vice versa?

maybe an app wide setting to include archived tasks in search.

8. Should board statistics include or exclude archived tasks? (Trash excludes — should archive differ?)

EXCLUDE FOR SURE.

9. Should archived tasks count toward release/group counts in headers?

EXCLUDE.


**Trash interplay**

10. Can an archived task be moved to trash? When restored from trash, does it return as archived or active?

yes, they can be deleted and return as archived. archived is not a deletion state, its more of a visibility state.

11. Permanent delete from trash — same path for archived items, or do archived-then-trashed items need special handling?


no, like any unarchived task.

12. Should `tasks list` from CLI hide archived by default like it hides trashed?

yes, any listing or searching should exclude archived tasks by default. maybe a flag to include them in cli.

**UI**

13. Where does the archive action live — task editor, right-click menu, keyboard shortcut?

task editor, right click menu, shortcut.

14. Confirmation needed, or one-click with undo toast?

one click with undo toast.

15. Visual treatment: greyed out, separate section, collapsed group?

if toggle enabled in board filters, show them with a greyed out, bottom of stack. it kinda sould like a status, but i guess its not?

16. Per-board archive page in sidebar (like Trash), or a tab on the board?

not really... simply a toggle to show them in place with ability to show only archived tasks.

**CLI**

17. Command shape: `hirotm tasks archive <id>` vs `hirotm tasks set --archived <id>`?
18. Read filter flag name: `--include-archived`, `--archived`, `--show-archived`?

i dont know, maybe just a flag in tasks update? dont know if it deserves a full sub command?

19. Should it respect board CLI policy like trash does?

tasks management policy applies.

**Notifications & live updates**

20. New notification types, or reuse existing task-update with a metadata flag?

i think like status updates.

21. Notification wording for archive/unarchive.

archived: "Task has been archived."
unarchived: "Task has been unarchived."

**Permissions / policy**

22. Same auth/policy as delete (move-to-trash), or weaker (e.g. anyone who can edit can archive)?

same policy as manage tasks.

**Data retention**

23. Any auto-purge policy? Trash currently keeps items indefinitely — should archive too?

stays forever

**Migration**

24. Any existing tasks that should be auto-archived on rollout (e.g. closed tasks older than X)?

nop.

-----------

# Round 2 Questions

## Synthesized requirements

**Concept**
- Archive is a **visibility state on tasks**, not a deletion state and not a workflow status.
- Use case: tasks user processed but decided not to work on (duplicate, won't-do, non-issue). Hidden from normal views and excluded from all counts/stats/search by default, but recoverable and searchable on demand.
- Manual only. Tasks only (boards/lists explicitly out of scope).
- No cascade. No auto-purge. No backfill on rollout.

**Visibility & filtering**
- Hidden from board view by default.
- Per-board UI toggle: "Show archived" (in-place, greyed out, sorted to bottom of each stack).
- Likely a second mode: "Show only archived" (your wording suggested this).
- Excluded from board statistics, release/group counts, header counts.
- Excluded from FTS search by default.
- App-wide setting to include archived tasks in search globally.
- Excluded from CLI `tasks list` / `search` by default; opt-in flag to include.

**Lifecycle interplay**
- Independent of `status` (`isClosed`). An archived task retains whatever status it had.
- Independent of trash. An archived task can be moved to trash; restoring from trash returns it in its prior archived state.
- Permanent delete: nothing special — same path as any task.

**UI**
- Action surfaces: task editor, right-click menu, keyboard shortcut.
- One-click with undo toast (no confirmation dialog).
- Visual: greyed out, sorted to bottom when toggle is on.

**CLI**
- Likely a flag on `tasks update` (e.g. `--archive` / `--unarchive`) rather than a dedicated subcommand.
- Read flag to include archived (e.g. `--include-archived`).
- Subject to the board's "manage tasks" policy.

**Notifications**
- Treat like a status change: emit task-update events with the new field; reuse existing notification machinery.
- Wording: "Task has been archived." / "Task has been unarchived."

**Data model**
- New nullable `task.archived_at TEXT` column on `task` table.
- Index supporting board-scoped active reads, e.g. `idx_task_board_archived(board_id, archived_at)`.
- All existing "active task" SQL predicates gain `AND archived_at IS NULL` where appropriate.

## Remaining open questions worth nailing down before design

**A. Toggle modes — exactly how many?**
You said "toggle to show them in place" and "ability to show only archived." That's effectively three states:
1. Hide archived (default)
2. Show archived inline (greyed, bottom)
3. Show only archived

→ Confirm: tri-state control? Or two separate toggles? Per-user persisted, or per-board, or session-only?

**B. "Sorted to bottom of stack" — which stack?**
Board view groups tasks by status (column), and within columns by sort order, group, priority. Does "bottom" mean:
- Bottom of each status column?
- Bottom of each group within a column?
- A separate collapsed "Archived" section per column?

This matters because tasks have explicit `sortOrder` today. Does archive **override** sort order for display only, or do you want a stable secondary sort (`archived_at IS NOT NULL`, then existing order)?

**C. Search — app-wide setting location**
You mentioned an app-wide setting to include archived in search. Where does it live?
- User setting (per browser/profile)?
- A toggle in the search UI itself (transient, like an FTS option)?
- A server-side setting persisted in `runtimeConfig`?

This affects whether the CLI `search` command also respects it or always requires the explicit flag.

**D. Interaction with the "closed" status**
You said archived tasks "don't even count towards closed in statistics." Two interpretations:
- (i) An archived task is removed from **all** stat buckets (open, in-progress, closed) — pretend it doesn't exist.
- (ii) An archived task is still visible in counts but in a separate "archived" bucket.

I'd assume (i) based on your other answers — please confirm.

**E. Filters**
Existing board filters (status, group, priority, release, search-in-board) — when "Show archived" toggle is on, do filters apply to archived tasks too, or are archived tasks shown unfiltered alongside filtered active tasks? Most natural is "filters apply to both."

**F. CLI command shape — small but worth deciding**
You leaned toward `tasks update --archive`. But:
- `tasks update` today probably takes field=value pairs. Is `--archive`/`--unarchive` a clean fit, or would `tasks archive <id>` / `tasks unarchive <id>` be more discoverable and consistent with `hirotm trash …` patterns?
- Bulk: do you want `hirotm tasks update --archive <id1> <id2> …`?

**G. Live updates / change stream**
The board uses `useBoardChangeStream` for live updates. Archive/unarchive will emit task-update events — should an archived task emit a "task removed" hint to clients that have the toggle off (so they remove it from view), or just rely on clients re-filtering on the new `archivedAt` field?

**H. Audit / provenance**
Trash records `deleted_at`. For archive, do you also want `archived_at` only, or also `archived_by` (principal: user vs CLI key) for audit, mirroring how the codebase tracks `creator_principal_type`?

**I. UI affordance for archived state**
When viewing a single archived task (task editor opened directly via URL, or from search results), should the editor:
- Show a banner "This task is archived" with an Unarchive button?
- Make fields read-only until unarchived, or fully editable?

**J. Reports / exports**
You said "don't appear in my reports." Are there current report/export surfaces (CSV, board stats endpoints, CLI `boards stats`) — should each be enumerated and explicitly excluded? This will be the long tail of "find every active-task SQL query."

## Trickier implementation hotspots

Based on the trash precedent, these are the spots that will need the most careful work:

1. **Every "active task" read predicate.** Trash added `deleted_at IS NULL` everywhere. You'll need to add `AND archived_at IS NULL` in parallel — but **conditionally** based on the new "include archived" flag from the caller. Trash never had a "show me trashed inline" mode, so this is genuinely new plumbing through the API → storage layers.

2. **FTS index.** If the FTS table currently mirrors task rows, decide whether archived rows stay indexed (yes — you want to search them when opted in) and how the query layer filters them out by default.

3. **Board stats SQL.** Multiple aggregations in `src/server/storage/board/board.ts` and stats code — each needs the new exclusion.

4. **Sort order semantics.** Archived-to-bottom requires either a SQL-side `ORDER BY archived_at IS NOT NULL, …existing…` or a client-side post-sort. Decide once, apply consistently.

5. **CLI dry-run + write-result plumbing.** Trash has `trashEntityDryRun.ts` and write-result types — archive will likely want analogous structures so the CLI can preview and report.

6. **Trash + archive composition.** A task can be `(archived=Y, trashed=Y)`. The trash page filters by `deleted_at IS NOT NULL` — does the trash list show whether each item was archived? Probably surface it as a small badge so users know what state they'll get on restore.

7. **Notifications.** "Treat like status updates" is clean, but make sure the notification text generator distinguishes archive from a normal field change so the wording you specified actually fires.

If you answer A–J, you'd have enough to write the requirements doc in the same shape as `docs/completed-plans/trash-requirements.md`, and then a design doc that mirrors the trash design at one level smaller scope (since it's task-only and no cascade).


-----------------------
