# Board releases — requirements

This document captures product requirements for **Release**: a board-scoped label that can be assigned to at most one task field (optional “untagged”). This is **not** a generic tagging system; a separate feature may add tags later.

**Related documents**

- [Releases design](./releases-design.md) — data model, API, filters, CLI.
- [Releases plan](./releases-plan.md) — implementation phases and checklists.

## Concepts

- **Release** — A row owned by a board: **name** (required), **color** and **date** (optional metadata). Names are **unique per board**. Display order follows **creation time** (`createdAt` ascending is recommended for stable lists).
- **Task release** — Each task has **at most one** release: either **untagged** (no release) or exactly one release id. There is **no** multi-release assignment per task in v1.
- **Untagged** — Not a database row; it means the task has **no** `releaseId` (null). In filters, **Untagged** behaves like the **priority “none”** idea: a selectable bucket for “no release,” **OR-combined** with named releases when multiple filter chips are selected.

## Board settings

Per board, configurable:

1. **Default release** — Optional. A single release id chosen as the board default, or **none** (no default).
2. **Auto-assign default on task creation (UI)** — Only meaningful when a default release is set. When enabled, new tasks created from the **web app** get that release unless the user explicitly chooses otherwise (see overrides).
3. **Auto-assign default on task creation (CLI)** — Only meaningful when a default release is set. When enabled, new tasks created via **`hirotm`** get that release when the create command **does not** specify a release.

**Dependency:** If **no** default release is configured, auto-assign toggles are **disabled** (hidden or visibly disabled) and have no effect.

**Override:** On create or update, the user may set **no release** or **another** release explicitly; that always wins over auto-assign.

**Escape hatch:** No separate “create untagged while auto-assign is on” shortcut is required in v1; users may change the task after create if needed.

## Keyboard

- **Shortcut:** **`e`** (while board keyboard navigation applies and a task is selected).
- **Behavior:** Assign the board’s **default release** to the selected task. If **no** default release is configured, **`e` does nothing.**
- **Overwrite:** If the task **already** has a release, **`e` still sets** the task to the **default** release (same as “snap to default,” not “only if empty”).

Shortcut copy and help text should describe **`e`** as **set to default release**, not as a toggle.

## Filters

- **Semantics:** Consistent with **priority** and **task group** filters: selected values combine with **OR** across releases (and **Untagged** when selected).
- **Empty selection** means **all** (no narrowing by release), same as empty priority / group behavior.
- **Untagged** — Selecting only **Untagged** shows tasks with **no** release. Selecting **Untagged** and one or more named releases shows tasks that are untagged **or** match any selected release.

## Search (FTS)

- **Out of scope for v1:** Release name / id does **not** participate in full-text search (`hirotm search` / board search). Filtering by release uses the **board filter** mechanisms only.

## Release lifecycle

- **Rename** — Allowed. Tasks keep the same release id; only display changes.
- **Delete** — Allowed. Behavior should align with **task groups**: either tasks become **untagged**, or the user is prompted to **move** tasks to another release (product flow matches existing group deletion where applicable).

## CLI (summary)

- **Task flags:** `--release <name>` resolves by **unique name per board**; persisted value is **release id**. Optional **`--release-id`** (or equivalent) may be supported for scripts.
- **Management:** Dedicated **`hirotm releases`** subcommands (`list`, `show`, add/update/delete) with permissions aligned to **task groups** (`BoardCliPolicy` or parallel policy surface).
- **Filtering:** Release appears in **list/filter** flows for tasks; **not** in FTS until a later iteration.

## Migration

- **Existing tasks:** `releaseId` null (untagged).
- **Backfill** from titles or external data — **out of scope.**

## Non-goals (v1)

- Generic multi-tag systems on tasks.
- Release in FTS / `hirotm search`.
- Manual sort order for releases (ordering is by `createdAt` unless design extends later).
- Multi-release per task.

## Future options

- FTS inclusion for release names; snippet/excerpt behavior.
- Manual ordering of releases in the picker.
- Analytics or stats chips that include release as a dimension (align with board stats filter model).
