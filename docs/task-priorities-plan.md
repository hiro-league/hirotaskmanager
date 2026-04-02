# Task priorities plan

This document proposes board-local task priorities with editable names and colors, fixed seeded values, nullable task assignment, header filters, and keyboard cycling.

## Goals

- Add board-local task priorities that are separate from workflow status and task group.
- Seed every board with four built-in priorities:
  - `low` = `10`
  - `medium` = `20`
  - `high` = `30`
  - `critical` = `40`
- Allow users to rename and recolor the built-in priorities.
- Prevent users from deleting the built-in priorities or changing their numeric values.
- Allow users to add custom priorities with their own number, name, and color.
- Allow tasks to have no priority.
- Show priorities on task cards as a colored pill with abbreviated text.
- Add a board header filter row for priorities.
- Add a keyboard shortcut `p` that cycles the priority filter through one selection at a time.

## Non-goals

- Priority-based task sorting. Task priority is metadata only for now.
- Global priorities shared across boards.
- Automatic number generation for custom priorities.
- Complex “gap management” between numeric values. Users supply the number directly.

## Confirmed product decisions

- Priorities are board-local. New boards are seeded with the built-in four priorities.
- Existing tasks remain unassigned after migration.
- A task may have no priority.
- Users provide the number, name, and color for each custom priority.
- The built-in four priorities:
  - cannot be deleted
  - cannot have their numeric values changed
  - can be renamed
  - can be recolored
- Deleting a custom priority should warn when tasks are assigned to it; those tasks become unassigned after save.
- The task editor should support editing priority on both create and edit.
- New tasks default to no priority.
- Task cards should show a colored priority pill with abbreviated text, except the smallest card mode, which should stay title-only.
- Priority filters should support selecting zero, one, or many priorities.
- `p` should cycle:
  - `All`
  - then each defined priority in ascending numeric order
  - then back to `All`
- The compact summary beside the board title should show the selected priority when the active filter is a single priority, and some non-`All` summary when users manually multi-select.

## Current codebase touchpoints

The current board architecture already has the right extension points for this feature.

- Shared board/task models live in `src/shared/models.ts`.
- Board detail loading and board-scoped metadata updates live in:
  - `src/server/storage/board.ts`
  - `src/server/routes/boards.ts`
- Task create/update storage lives in:
  - `src/server/storage/tasks.ts`
  - `src/client/api/mutations/tasks.ts`
- Board-scoped editor patterns already exist in:
  - `src/client/components/board/TaskGroupsEditorDialog.tsx`
  - `src/client/api/mutations/board.ts`
- Board header filters live in:
  - `src/client/components/board/TaskGroupSwitcher.tsx`
  - `src/client/components/board/BoardStatusToggles.tsx`
  - `src/client/components/board/BoardView.tsx`
- Keyboard shortcuts are centralized in:
  - `src/client/components/board/shortcuts/boardShortcutRegistry.ts`
  - `src/client/components/board/shortcuts/boardShortcutTypes.ts`
  - `src/client/components/board/shortcuts/ShortcutHelpDialog.tsx`
- Task card rendering and task editing live in:
  - `src/client/components/task/TaskCard.tsx`
  - `src/client/components/task/TaskEditor.tsx`
- Board-local client preferences already persist board-specific filter state in `src/client/store/preferences.ts`.

Because task groups already use “board owns definitions, task stores selected id”, priorities should follow the same broad model.

## Proposed data model

## Shared types

Add a new board-scoped priority definition type in `src/shared/models.ts`.

```ts
export interface TaskPriorityDefinition {
  id: number;
  value: number;
  label: string;
  color: string;
  isSystem: boolean;
}
```

Extend `Task`:

```ts
export interface Task {
  // existing fields...
  priorityId?: number | null;
}
```

Extend `Board`:

```ts
export interface Board {
  // existing fields...
  taskPriorities: TaskPriorityDefinition[];
}
```

Recommended shared helpers:

- `createDefaultTaskPriorities()`
- `priorityLabelForId()`
- `priorityAbbreviation()`
- `sortPrioritiesByValue()`

## Database schema

Add a new migration after `002_closed_at`.

### New table

```sql
CREATE TABLE task_priority (
  id        INTEGER PRIMARY KEY,
  board_id  INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  value     INTEGER NOT NULL,
  label     TEXT    NOT NULL,
  color     TEXT    NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0
);
```

Recommended indexes and constraints:

- index on `board_id`
- unique `(board_id, value)` so ordering stays deterministic

### Task column

```sql
ALTER TABLE task ADD COLUMN priority_id INTEGER REFERENCES task_priority(id);
```

`priority_id` should be nullable.

## Seed data

When the migration runs:

1. Create the `task_priority` table.
2. Add `task.priority_id`.
3. For every existing board, insert:
   - `10 low`
   - `20 medium`
   - `30 high`
   - `40 critical`
4. Mark those rows as `is_system = 1`.
5. Leave all existing tasks with `priority_id = null`.

When a new board is created, seed the same four rows during `createBoardWithDefaults()`.

## Storage and API design

## Loading board detail

`loadBoard()` in `src/server/storage/board.ts` should:

- load `task_priority` rows for the board
- sort them by `value`, then `id`
- include them as `board.taskPriorities`
- map `task.priority_id` into `task.priorityId`

## Board priority patch endpoint

Add a new board-scoped route:

`PATCH /api/boards/:id/priorities`

Request body shape:

```ts
{
  taskPriorities: Array<{
    id: number;
    value: number;
    label: string;
    color: string;
  }>;
}
```

Server-side rules:

- At least the four built-in numeric values must remain present.
- Built-in rows must keep their existing `value`.
- Built-in rows cannot be deleted.
- Any row with a blank label is ignored or rejected.
- Any row with a missing or invalid color is rejected.
- Duplicate numeric `value`s within the same board are rejected.
- Custom rows may be inserted, updated, or deleted.
- When a custom row is deleted, tasks referencing it should be updated to `priority_id = null`.

Recommended implementation shape:

- add `patchBoardTaskPriorities(boardId, taskPriorities)` in `src/server/storage/board.ts`
- mirror the existing `patchBoardTaskGroups()` route and mutation structure
- return the full updated `Board`

## Task create and patch endpoints

Extend existing task routes and storage functions so `priorityId` can be written.

### Create task

`POST /api/boards/:id/tasks`

- accept `priorityId`
- treat omitted or `null` as no priority
- validate that a non-null `priorityId` belongs to the same board

### Patch task

`PATCH /api/boards/:id/tasks/:taskId`

- accept `priorityId`
- allow `null`
- validate board ownership for any non-null priority

## Client mutations

Update:

- `src/client/api/mutations/tasks.ts`
- `src/client/api/mutations/board.ts`

Add:

- optimistic task updates for `priorityId`
- a board mutation hook such as `usePatchBoardTaskPriorities()`

## Board priority editor

Create a board-scoped editor dialog parallel to task groups, for example:

- `src/client/components/board/TaskPrioritiesEditorDialog.tsx`

This dialog should be launched from `BoardView`, likely beside the existing task groups editor action.

## Editor row model

Each row needs:

- hidden id
- numeric value
- label
- color
- built-in/custom state
- associated task count for delete warnings

## Built-in row behavior

Built-in rows should:

- show editable `label`
- show editable `color`
- show read-only `value`
- hide or disable delete
- display a subtle “built-in” or lock affordance so the restriction is obvious

## Custom row behavior

Custom rows should:

- allow editing `value`
- allow editing `label`
- allow editing `color`
- allow delete

If a custom row has associated tasks, deleting it should show a warning in the dialog before save. The warning text should make the outcome explicit: those tasks will remain, but their priority becomes unassigned.

## Validation rules

The dialog should block save when:

- there are duplicate numeric values
- any row has a blank label
- any row has a blank or invalid color
- any built-in row is missing
- any built-in row changed its numeric value

Rows should display in ascending numeric order in the saved result. The editor may either:

- keep rows visually sorted live by `value`, or
- keep local editing order and sort on save

The simpler implementation is to sort on save and on reload.

## Task editor changes

Update `src/client/components/task/TaskEditor.tsx`.

Add a new `Priority` field:

- shown in both create and edit modes
- default value is `No priority`
- options are:
  - `No priority`
  - all board priorities sorted by ascending `value`

The stored form state should be nullable rather than coercing to `0`.

## Task card rendering

Update `src/client/components/task/TaskCard.tsx`.

### Display rules

- `small` card mode: no priority pill
- other modes: show a compact colored pill
- if a task has no priority, show nothing

### Pill content

The pill should include:

- background or border color derived from the priority color
- abbreviated text derived from the label
- full label available through visible context or `title`

Recommended abbreviation rules:

- one word: first `3` to `4` letters uppercased
- multiple words: initials, up to `4` characters

Examples:

- `Low` -> `LOW`
- `High` -> `HIGH`
- `Critical` -> `CRIT`
- `Needs Review` -> `NR`

The exact abbreviation helper can be adjusted later, but it should be deterministic and short enough for normal card widths.

## Filter behavior

Add a new header row component, for example:

- `src/client/components/board/BoardPriorityToggles.tsx`

This should render below groups and status in `BoardView`.

## Filter options

The row should render:

- `All`
- one chip per defined priority in ascending numeric order

Important behavior for unassigned tasks:

- `All` means no priority filtering at all, so tasks with no priority remain visible
- any explicit priority selection filters to matching priorities only, so unassigned tasks are excluded

This keeps the model simple and matches the requested `p` cycle order.

## Selection model

Unlike task groups, priorities are multi-select.

Recommended client preference state:

```ts
activeTaskPriorityIdsByBoardId: Record<string, string[] | undefined>
```

Where:

- `undefined` or empty means `All`
- otherwise the array stores the selected priority ids as strings

Manual filter behavior:

- clicking `All` clears explicit selections
- clicking a priority toggles it on or off
- zero selected priorities is allowed and should show no tasks

## Derived helpers

Add preference helpers similar to the existing group helpers:

- `useResolvedActiveTaskPriorityIds(boardId, taskPriorities)`
- `cycleTaskPriorityForBoard(board, setActivePriorities)`

Update task filtering in:

- `src/client/components/board/ListStatusBand.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`
- any DnD container derivation in:
  - `src/client/components/board/useLanesBoardDnd.ts`
  - `src/client/components/board/useStackedBoardDnd.ts`
  - `src/client/components/board/boardStatusUtils.ts`

Filtering rules:

- if `All`, do not filter by priority
- if one or more priorities are selected, include only matching `priorityId`
- if zero priorities are selected, render no tasks

## Header summary beside board title

`BoardView.tsx` already surfaces the active group beside the board title.

Add a similar priority summary:

- when `All`: show nothing
- when exactly one priority is selected: show that priority label
- when multiple priorities are selected: show a compact summary such as `Priorities: 3 selected`

This should not appear in `small` card mode logic; it belongs only in the board header.

## Keyboard shortcut behavior

Extend the board shortcut registry and help dialog.

## New shortcut

Add:

- key: `P`
- description: `Cycle priority filter`

## Cycle order

`p` should cycle:

1. `All`
2. first priority by numeric value
3. second priority by numeric value
4. third priority by numeric value
5. ...
6. back to `All`

Each step selects exactly one priority except `All`.

If the user currently has a manual multi-select state, pressing `p` should normalize back into the cycle by moving to the first single-priority step after `All`, or by resetting to `All` first. The simplest rule is:

- if current selection is not exactly `All` or one valid single priority, pressing `p` resets to `All`

That keeps the behavior predictable and easy to explain in the shortcut help.

## Shortcut summary behavior

When `p` changes the filter:

- the header priority summary should update immediately
- the filter chip row should reflect the single active chip

## DnD and layout implications

Priority is metadata only, so drag-and-drop ordering stays unchanged.

Still, every place that derives the visible task set must include priority filtering or it will desync:

- lane view renderers
- stacked view renderers
- keyboard navigation models
- drag container task maps

If any of those paths ignore the priority filter, users will see:

- hidden tasks still participating in keyboard navigation
- drag targets with unexpected counts
- overlays that do not match rendered cards

The implementation should therefore treat priority filtering the same way task-group filtering is treated today.

## Suggested implementation phases

## Phase 1: data model and migration

- add shared priority types and helpers
- add migration for `task_priority` and `task.priority_id`
- seed built-in priorities for existing and new boards
- load priorities on board detail

## Phase 2: API and mutations

- extend task create/update payloads with nullable `priorityId`
- add board priorities patch route and storage function
- add client mutations

## Phase 3: board priority editor

- build `TaskPrioritiesEditorDialog`
- add launch action in `BoardView`
- implement validation and delete warnings

## Phase 4: task editor and task cards

- add priority field to `TaskEditor`
- show priority pill in non-small card modes
- ensure optimistic task updates preserve priority state

## Phase 5: filters and keyboard shortcut

- add priority filter preferences
- add `BoardPriorityToggles`
- wire filtering into both board layouts and DnD derivations
- add `p` shortcut and help text
- add header summary badge

## Phase 6: verification

- verify existing boards migrate correctly
- verify tasks can stay unassigned
- verify built-in priorities cannot be deleted or renumbered
- verify custom priority deletion nulls task assignments
- verify `p` cycle order
- verify stacked and lane layouts stay in sync with the visible filtered task set

## Test plan

Manual checks:

1. Open an existing board after migration and confirm:
   - built-in priorities exist
   - old tasks have no priority
2. Create a new board and confirm it seeds the same four priorities.
3. Add a custom priority between built-ins by choosing a custom numeric value.
4. Rename and recolor a built-in priority and confirm the changes show on task cards and in filters.
5. Attempt to delete or renumber a built-in priority and confirm save is blocked.
6. Assign a priority to a task, then remove that custom priority and confirm the task becomes unassigned after the warning.
7. Create and edit tasks with `No priority`.
8. Confirm `small` task cards omit the priority pill.
9. Confirm non-small task cards show the pill and abbreviation.
10. Toggle priority chips manually:
   - all
   - one
   - many
   - zero
11. Confirm explicit priority selection hides unassigned tasks.
12. Press `p` repeatedly and confirm the cycle order is:
   - `All`
   - each priority by ascending numeric value
   - `All`
13. Verify stacked and lanes layouts show the same filtered set.
14. Verify keyboard navigation and drag behavior only operate on visible tasks under the active priority filter.

## Open design note

This plan intentionally keeps “no priority” out of the explicit filter cycle and chip list. Unassigned tasks are visible under `All`, but not individually filterable in this first version.

If later product feedback shows a need to isolate unassigned tasks, add a pseudo-filter option such as `No priority` without changing the underlying nullable task model.
