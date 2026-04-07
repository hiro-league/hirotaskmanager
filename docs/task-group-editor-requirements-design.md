# Task group editor requirements and design

This document defines the product requirements and technical design for replacing the current "replace the whole task group array" flow with an explicit task group editor model.

**Related documents**

- [Task group editor plan](./task-group-editor-plan.md) - phased implementation plan for this design.
- [Emoji icons design](./emoji-icons-design.md) - existing emoji behavior that task groups must preserve.
- [hirotm CLI - Design Document](./ai-cli-design.md) - current CLI and HTTP/API assumptions that group editing changes may affect later.

## Design summary

- Keep task group management as a single-screen "edit all groups" flow.
- Stop using persisted numeric `task_group.id` values as temporary client-side row identity.
- Make create, update, reorder, and delete explicit operations instead of inferring intent from a replacement array.
- Add stable task group ordering that is independent of database ID order.
- Require every board to always have at least one surviving task group.
- Require every board to always have a valid default task group and deleted-group fallback group.
- Make the destination for tasks from removed groups explicit and visible to the user.
- Add a board-level default task group for new tasks and a board-level fallback group for deleted-group reassignment.

## Problem statement

The current implementation combines three different concepts into one numeric `id`:

- the persisted database identity of a task group
- the temporary identity of an unsaved row in the editor
- the signal the server uses to infer whether a row is a create or update

That design causes several user-facing problems:

- delete-plus-add can behave like a rename or a true delete-and-create depending on which numeric ID happened to be removed
- tasks in removed groups are silently remapped to the "first kept group"
- "first group" is an implementation detail driven by current load order, not an explicit user choice
- the editor cannot clearly explain the outcome because the outcome is partly accidental

Example of the current ambiguity:

- removing the highest-ID group and then adding a new row can reuse that numeric ID and act like a rename
- removing a non-highest-ID group and then adding a new row creates a truly new group and remaps removed-group tasks elsewhere

The product problem is not only that the behavior is surprising. It is that the model does not let the app represent user intent cleanly.

## Goals

- Keep task group editing in one place and make the result predictable.
- Let users add, rename, reorder, and delete task groups in one editing session.
- Make task reassignment on group deletion explicit before save.
- Preserve group identity across rename and reorder operations.
- Guarantee that a board can never be saved without at least one group and valid default and fallback groups.
- Allow the board to define:
  - a default group for newly created tasks
  - a default fallback group for tasks from removed groups
- Keep the final saved outcome explainable in plain language.
- Make the server contract simple to test and resilient to future UI changes.

## Non-goals

- Introduce per-user task group defaults.
- Add task group history or undo beyond the app's normal optimistic update behavior.
- Add bulk task reassignment tools outside the delete-group workflow.
- Redesign task filtering beyond what is needed to respect stable group ordering and defaults.

## User experience requirements

### Single-screen editor

The app should continue to use a single "Task groups" editor surface. A dialog remains acceptable if the editor stays readable once task counts, defaults, and delete reassignment controls are added.

The screen must support, in one editing session:

- adding a new group
- renaming an existing group
- changing emoji
- reordering groups
- deleting a group
- choosing the board default group for new tasks
- choosing the default fallback group for deleted-group reassignment

### Group row behavior

Each row in the editor should show:

- label
- optional emoji
- task count
- drag or keyboard reorder affordance
- delete action

Rows representing persisted groups and rows representing newly added groups must be visually and technically distinguishable in draft state, even if the user never sees the raw identifiers.

### Delete behavior

Deleting a group with no tasks may be a simple delete.

Deleting a group with tasks must require an explicit destination before save. The default selection should come from the board's deleted-group fallback group, but the user may override it per deleted group during that save if needed.

The screen must never silently remap tasks from removed groups to an arbitrary "first group".

Deleting the last surviving group must never be allowed. If the user wants a completely different set of groups, the editor must require at least one replacement group to survive the save.

### Save summary

Before or during save, the editor should be able to describe the pending outcome clearly, for example:

- create 1 group
- rename 2 groups
- reorder groups
- delete 1 group and move 14 tasks to "General"
- change default new-task group to "Feature"

The goal is not necessarily a confirmation dialog on every save. The goal is that the UI state can always explain what will happen.

## Functional requirements

### Group identity

- Existing groups keep their `task_group.id` across rename, emoji change, and reorder.
- New groups do not receive a real database ID until the server creates them.
- A newly added group must never be mistaken for an update to an existing group because of a reused client-generated numeric ID.

### Minimum cardinality

- Every board must always have at least one task group.
- Every board must always have one valid `defaultTaskGroupId`.
- Every board must always have one valid `deletedGroupFallbackId`.
- The default and fallback groups may point to the same surviving group.
- The server must reject any save whose resulting state would leave the board with zero groups.
- Board creation and migration backfill must both produce a valid initial group/default/fallback state.

### Ordering

- Task groups need explicit persisted order.
- Board reads should return task groups in that order.
- Keyboard cycling and any other "next group" behavior should follow that order.
- Default and fallback group pickers should display groups in that same order.

### Defaults

- Every board must have a default task group for new tasks.
- Every board must have a default fallback group used when a deleted group's tasks need reassignment.
- The default group and the deleted-group fallback group may be the same but do not have to be the same.
- The editor must prevent save if either setting points to a group that is being deleted without replacement.

### Delete reassignment

- Each deleted group with tasks must resolve to a surviving destination group before save.
- The destination may be the board fallback group or an explicit per-delete override.
- The save operation must be transactional: no partial application where a group is deleted but tasks are not reassigned.

## Data model

### `task_group`

Add:

- `sort_order INTEGER NOT NULL`

Recommended invariants:

- order task groups by `sort_order ASC, id ASC`
- add an index for `(board_id, sort_order)`
- optional uniqueness on `(board_id, sort_order)` if the chosen reorder implementation keeps it simple

### `board`

Add:

- `default_task_group_id INTEGER`
- `deleted_group_fallback_id INTEGER`

Recommended invariants:

- both columns reference surviving task groups on the same board
- both values are non-null for normal active boards after migration and backfill
- server validation prevents delete operations from leaving either pointer invalid

Keeping these values on `board` makes the policy explicit and avoids overloading task-group list order with unrelated meaning.

## API design

### Board detail payload

Extend board payloads with:

```ts
interface Board {
  // existing fields
  taskGroups: GroupDefinition[];
  defaultTaskGroupId: number;
  deletedGroupFallbackId: number;
}
```

Extend task group shape with persisted order:

```ts
interface GroupDefinition {
  id: number;
  label: string;
  emoji?: string | null;
  sortOrder: number;
}
```

### Editor save request

The editor save surface should use explicit operations rather than a replacement list. The existing groups route should be repurposed to use the new explicit contract, with the old replacement-array behavior removed entirely.

Recommended request shape for `PATCH /api/boards/:id/groups`:

```ts
interface PatchBoardTaskGroupConfigInput {
  defaultTaskGroupId: number;
  deletedGroupFallbackId: number;
  creates: Array<{
    clientId: string;
    label: string;
    emoji?: string | null;
    sortOrder: number;
  }>;
  updates: Array<{
    id: number;
    label: string;
    emoji?: string | null;
    sortOrder: number;
  }>;
  deletes: Array<{
    id: number;
    moveTasksToGroupId?: number;
  }>;
}
```

Recommended semantics:

- `creates` always create new database rows
- `updates` only target existing rows on that board
- `deletes` only target existing rows on that board
- omitted groups are not implicitly deleted
- `moveTasksToGroupId` falls back to `deletedGroupFallbackId` when omitted, but the UI should normally send it explicitly for deleted groups that still have tasks
- the resulting board state must contain at least one surviving group
- `defaultTaskGroupId` and `deletedGroupFallbackId` are required and must point at surviving groups

Recommended response:

- return the full updated `Board`

## Server behavior

The server should apply the mutation in one transaction:

1. validate all referenced group IDs belong to the board
2. validate that delete destinations resolve to surviving groups
3. create new groups and map each `clientId` to a new database `id`
4. apply updates
5. apply reordering by writing `sort_order`
6. reassign tasks from deleted groups
7. delete the removed groups
8. update board-level default and fallback pointers
9. bump board `updated_at`, publish board change, and record notifications

Validation rules:

- labels must trim to non-empty strings
- no duplicate labels after trimming if the product wants unique names
- at least one group must survive the save
- `defaultTaskGroupId` is required and must point to a surviving group
- `deletedGroupFallbackId` is required and must point to a surviving group
- a group cannot be deleted and also updated
- `moveTasksToGroupId` cannot target a deleted group
- the last surviving group cannot be deleted unless a created or updated surviving group remains in the same save

If the product keeps duplicate group labels legal, the API should still identify groups only by ID and not rely on label uniqueness.

## Client draft model

The editor should use a draft row shape that separates UI identity from persisted identity:

```ts
interface TaskGroupDraftRow {
  clientId: string;
  id?: number;
  label: string;
  emoji?: string | null;
  sortOrder: number;
  taskCount: number;
  deleteState: "keep" | "delete";
  moveTasksToGroupId?: number;
}
```

Rules:

- existing rows have both `clientId` and `id`
- new rows have `clientId` only
- React list rendering uses `clientId`
- diffing against the baseline produces `creates`, `updates`, and `deletes`

This removes the current accidental "new row reused an old numeric ID" behavior entirely.

## Create-task and board behavior

The rest of the app should stop using "first group in array" as an implicit policy.

Required behavior changes:

- task creation should default to `board.defaultTaskGroupId` when there is no more specific filtered/active group context
- delete fallback should default to `board.deletedGroupFallbackId`
- task-group keyboard cycling should use persisted `sortOrder`
- any visible group picker should reflect explicit order, not database ID order

## Notifications and audit semantics

The save operation should continue to publish a board-changed event and record a board-structure update notification.

Recommended follow-up behavior:

- keep the existing coarse "task groups updated" notification initially
- optionally add richer detail later if notifications need to describe created, renamed, or deleted groups separately

The initial redesign should favor correctness and predictability over notification granularity.

## CLI implications

The current CLI flow that replaces groups from JSON no longer matches the preferred explicit-operation model and should be updated in the same change.

Required direction:

- update the existing board task-group write command to send the new explicit request object
- update CLI help text and examples to describe explicit create, update, delete, and reassignment behavior
- remove CLI support for the old replacement-array semantics
- add CLI verification for invariants such as "at least one group survives" and "default/fallback must exist"

The CLI should use the same explicit contract as the web app. There should be no CLI-only compatibility path for the old ambiguous behavior.

## Migration and cleanup

Migration/backfill expectations:

- add `task_group.sort_order`
- backfill `sort_order` from current board-local ID order
- add board default and deleted-group fallback columns
- backfill both board-level columns to the first task group by current order for each board
- remove the old replacement-array interpretation from `PATCH /api/boards/:id/groups`
- update all callers, including CLI, to the new explicit-operation contract in the same initiative

Cleanup expectations:

- existing boards continue to work after migration without manual repair
- migrated boards preserve the visible group order users currently expect
- the old ambiguous route behavior is removed rather than preserved behind compatibility logic
- dead client, server, and CLI code for replacement-array semantics should be deleted as part of the cleanup

## Risks and trade-offs

- This is a broader cleanup than a narrow bug fix because it intentionally changes storage, API shape, and editor state.
- Board-level fallback settings add schema complexity, but they remove hidden behavior and are easier to explain.
- Replacing the existing route contract everywhere at once is more disruptive than a compatibility layer, but it leaves less ambiguity and less dead code.
- Reorder support adds implementation cost, but without it the app would still depend on accidental ID order in multiple places.

## Recommended decision

Proceed with the explicit-operation redesign rather than trying to patch the current replacement-array approach.

The smallest safe long-term shape is:

- persisted `sort_order`
- board-level default and deleted-group fallback IDs
- client-side draft rows with `clientId`
- explicit create, update, delete, and reassignment semantics on `PATCH /api/boards/:id/groups`
- complete removal of the old replacement-array behavior across web, server, and CLI

That approach is more invasive than a local bug fix, but it is the first design in this area that makes the resulting behavior predictable enough to explain to users and simple enough to test with confidence.
