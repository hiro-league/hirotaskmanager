# hirotm commands ↔ board CLI policy

This doc maps **`hirotm`** commands to **`BoardCliPolicy`** checks on the server for the **CLI principal** (`hirotm`). The web app uses the same HTTP routes but different authentication.

## Global rule

For every command below, the board in question must allow **`readBoard`** for the CLI. If `readBoard` is off, the CLI gets **403** on board-scoped and trash routes that touch that board. This document does **not** repeat `readBoard` in each row.

Trash **GET** listings (`hirotm trash …`) only apply this rule: each returned row is for a board the CLI is allowed to read; there is no separate `deleteBoard` / manage flag for listing.

---

## Boards

Board-level actions use **`deleteBoard`**. There is no separate “created by CLI vs web” branch for boards in `cliDeleteBoardError`.

| hirotm command | Extra board CLI policy (beyond `readBoard`) | Notes |
|----------------|-----------------------------------------------|-------|
| `boards delete` | `deleteBoard` | Moves the board to Trash |
| `boards restore` | `deleteBoard` | Restores a trashed board |
| `boards purge` | `deleteBoard` | Permanently deletes a board from Trash |
| `trash boards` | *(none beyond `readBoard`)* | JSON list of trashed boards the CLI may read |

---

## Lists

List mutations use **`cliManageListError`**: **either** `manageAnyLists` **or** (`manageCliCreatedLists` **and** the list is CLI-created). Rows spell out both branches.

| hirotm command | Extra board CLI policy (beyond `readBoard`) | Which list this row applies to |
|----------------|-----------------------------------------------|--------------------------------|
| `lists delete` | `manageCliCreatedLists` | List **created by CLI** (`createdByPrincipal === "cli"`) |
| `lists delete` | `manageAnyLists` | List **created by web** (or not CLI-created) |
| `lists restore` | `manageCliCreatedLists` | Trashed list whose snapshot is **CLI-created** |
| `lists restore` | `manageAnyLists` | Trashed list **not** CLI-created |
| `lists purge` | `manageCliCreatedLists` | Trashed list **CLI-created** |
| `lists purge` | `manageAnyLists` | Trashed list **not** CLI-created |
| `trash lists` | *(none beyond `readBoard`)* | Each row’s `boardId` must be readable |

---

## Tasks

Task mutations use **`cliManageTaskError`**: **either** `manageAnyTasks` **or** (`manageCliCreatedTasks` **and** the task is CLI-created).

| hirotm command | Extra board CLI policy (beyond `readBoard`) | Which task this row applies to |
|----------------|-----------------------------------------------|--------------------------------|
| `tasks delete` | `manageCliCreatedTasks` | Task **created by CLI** |
| `tasks delete` | `manageAnyTasks` | Task **created by web** (or not CLI-created) |
| `tasks restore` | `manageCliCreatedTasks` | Trashed task **CLI-created** |
| `tasks restore` | `manageAnyTasks` | Trashed task **not** CLI-created |
| `tasks purge` | `manageCliCreatedTasks` | Trashed task **CLI-created** |
| `tasks purge` | `manageAnyTasks` | Trashed task **not** CLI-created |
| `trash tasks` | *(none beyond `readBoard`)* | Each row’s `boardId` must be readable |

---

## Releases

Release routes use **`manageStructure`** for writes (create / update / delete), matching task group management. Listing releases is read-only under **`readBoard`**.

| hirotm command | Extra board CLI policy (beyond `readBoard`) | Notes |
|----------------|-----------------------------------------------|-------|
| `releases list` | *(none)* | `GET /boards/:id/releases` |
| `releases show` | *(none)* | Same list endpoint; client picks one id |
| `releases add` | `manageStructure` | `POST /boards/:id/releases` |
| `releases update` | `manageStructure` | `PATCH /boards/:id/releases/:releaseId` |
| `releases delete` | `manageStructure` | `DELETE …` — optional `moveTasksTo` query |

Filtered task listing **`boards tasks`** only requires **`readBoard`** (same as other board read/query routes that accept filter query params).

---

## Implementation reference

Guards live in `src/server/cliPolicyGuard.ts`. Trash routes apply them in `src/server/routes/trash.ts`; live deletes in `src/server/routes/boards.ts`.
