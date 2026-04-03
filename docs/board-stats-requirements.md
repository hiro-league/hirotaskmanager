# Board statistics requirements

This document captures the confirmed product requirements for task count statistics on the board page (board-level and per-list), plus deferred ideas.

## Scope

- **Board-level** chips (title row): show **L** (number of lists on the board), then **T**, **O**, and **C** as **rectangular chips** wherever this feature is enabled:
  - **L** — count of lists on the board (structural; not derived from task filters).
  - **T** — total task count for the stats scope (see filters below).
  - **O** — open count (tasks whose current status is not closed; see definitions).
  - **C** — closed count (tasks whose current status is closed).
- **List-level** chips (sub-header under each list title): **T**, **O**, **C** only (no **L**).
- **Chip labels** use **single-letter abbreviations only** (`L`, `T`, `O`, `C` on the board row; `T`, `O`, `C` on lists). Do not spell out full words on the chips (tooltips or screen-reader text may still describe them in full where appropriate).
- **Board-level** chips appear on the **board title row**, **after the search button** and **after the inline active-filter summaries** (the same “Group / Priority / Dates” style pills shown when filters are set). Order: board name → search → filter summaries → **L / T / O / C** chips. List-level placement should **feel consistent** with this (chips after the list title and any list-level filter hints).
- **List-level** chips appear in a **sub-header** directly **below the list title** (not replacing the title row). Placement relative to drag handles is flexible; the sub-header should **stay sticky** while scrolling tasks in that column.
- A **single visibility control** (icon beside the task card size control) shows or hides **all** statistics: board chips **and** every list’s chips. Default: **hidden**. Keyboard: **n** toggles visibility (see shortcuts registry).
- **Persistence**: remember show/hide **per board**, using the **same storage mechanism** as other per-board preferences (e.g. filter state). Do **not** put this in the URL.

## Definitions

- **Closed** — a task whose **current status** has `isClosed === true` in the board’s status model.
- **Open** — any task that is **not** closed (same as “non-closed” for metrics). The **O** chip uses **orange** as its chip background to reflect that “open” here is a **bucket label**, not necessarily the status named “open”.
- **Total (T)** — count of all tasks in the stats scope under the active counting filters. With no archived/deleted/hidden tasks in the product yet, **T** is the full count for that scope; there is no separate “excluded” bucket in v1.

## Board vs list scope

- **Board** — task counts include tasks **across all lists** on that board (empty lists contribute **0** tasks to board totals; there is no separate “collapsed list” concept). **L** is the number of lists on the board.
- **List** — counts include **only tasks in that list**. There is no cross-list or subtask nuance in v1.

## Filters and dynamics

**Search is not a filter** for these metrics.

**Status visibility is not a filter for statistics.** The board’s **Status** toggles (`BoardStatusToggles`) control which status columns/lists are **shown** in the UI; they do **not** narrow **T / O / C**, because **O** and **C** already partition tasks by closed vs non-closed. Changing which statuses are visible must not change stats totals (unless tasks themselves change).

The following **three** board controls define the **task filter set** for **T / O / C** (and should stay aligned with how those dimensions filter tasks elsewhere):

1. **Priority** — `BoardPriorityToggles` (which priorities are included).
2. **Task group** — `TaskGroupSwitcher` (active group filter).
3. **Task date** — `BoardTaskDateFilter` (date-based filter).

Any **new** board-level task filter added later **must** be included in the same predicate used to compute **T / O / C** so counts stay consistent with that model.

**Semantics:** task counts reflect tasks matching **priority + group + date**. They may **differ** from the set of tasks visible in status columns when the user hides some statuses — that is intentional.

**Empty filter result:** if no tasks match the filters, show **0** on the relevant chips **consistently** (no special empty-state copy for chips in v1).

**Recalculation:** it is acceptable for counts to update after a short delay. While counts are **not** ready, show a **non-intrusive, subtle** loading indicator **inside** the task metric chips (e.g. small rotator) until values are stable.

## Implementation note (non-binding)

Aggregates may be computed **on the client** from data already loaded for the board, as long as performance remains acceptable for typical boards. Server-side aggregates or hybrid approaches can be considered during design if needed.

## Non-goals (v1)

- Archived, deleted, or hidden tasks/lists (not in the product yet; treat as **future** when those exist).
- Assignee-based metrics (assignees do not exist yet).
- Showing “matched / total” fractions on chips (e.g. `3/5`).
- Deep-linking or encoding stats visibility in the URL.
- Spelling out full words on the **L / T / O / C** chips.

## Future options

- **Product concepts:** archived / deleted / hidden tasks and lists; adjust definitions and counts when those ship.
- **Chips:** “filtered of total” display (e.g. `3/5`) alongside or instead of raw filtered counts.
- **Filters UX:** small counts **next to filter labels** (e.g. per group, per priority) when it makes sense.
- **Analytics dashboard:** separate view with **charts**, for **one board** or **across boards** (broader than inline chips).
- **Server-side or hybrid aggregation** for very large boards if client-side totals become too heavy.
