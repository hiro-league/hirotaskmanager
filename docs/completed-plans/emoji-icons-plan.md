# Emoji icons plan

This document breaks the emoji icon feature into phases and concrete implementation tasks.

## Phase 1: task groups

Goal: prove the model on the narrowest board-scoped metadata surface before rolling it out everywhere else.

### Tasks

1. Add `emoji` to `GroupDefinition` in `src/shared/models.ts`.
2. Add `task_group.emoji` via a new migration.
3. Load and persist group emoji in `src/server/storage/board.ts`.
4. Extend the board groups patch route and client mutation payloads to carry `emoji`.
5. Update `TaskGroupsEditorDialog.tsx` to let users set, change, and clear emoji.
6. Render emoji in task-group-facing UI:
   - group switcher
   - group labels shown on task cards
   - any task editor group selector text
7. Validate migration safety with existing boards and tasks.

### Exit criteria

- Existing boards load without errors.
- Group emoji can be saved and cleared.
- Group emoji renders consistently wherever the group label is shown.
- Search behavior is unchanged.

## Phase 2: tasks

Goal: add task-level optional emoji once the storage and picker pattern is proven.

### Tasks

1. Add `emoji` to `Task` in `src/shared/models.ts`.
2. Add `task.emoji` via migration.
3. Extend task create and patch storage in `src/server/storage/tasks.ts`.
4. Extend task create and patch API payloads.
5. Update `TaskEditor.tsx` to edit task emoji.
6. Render task emoji before task titles on cards and other task title surfaces.
7. Verify task reorder, drag/drop, and status changes preserve the emoji field unchanged.

### Exit criteria

- Tasks can store, update, and clear emoji.
- Task cards show emoji inline before the title.
- Task operations unrelated to emoji keep working unchanged.

## Phase 3: lists

Goal: extend the same pattern to list headers.

### Tasks

1. Add `emoji` to `List` in `src/shared/models.ts`.
2. Add `list.emoji` via migration.
3. Extend list create and patch storage in `src/server/storage/lists.ts` and related board routes.
4. Update list editing UI to edit and clear emoji.
5. Render emoji before list names in header surfaces and list selectors.

### Exit criteria

- Lists can store and clear emoji.
- List headers render emoji inline before the name.

## Phase 4: boards

Goal: complete the feature across the highest-level entity and show the emoji in navigation.

### Tasks

1. Add `emoji` to `Board` and `BoardIndexEntry` in `src/shared/models.ts`.
2. Add `board.emoji` via migration.
3. Extend board create and rename/update flows to accept emoji.
4. Load board emoji into board detail and board index responses.
5. Render emoji in sidebar board entries and board title surfaces.

### Exit criteria

- Boards can store and clear emoji.
- Sidebar entries render board emoji before the board name.

## Shared implementation tasks

- Create a reusable emoji field component or helper once at least two editors need it.
- Reuse one picker package and one interaction pattern across all entity editors.
- Add shared formatting helpers for "emoji + label" rendering to avoid repeated conditional logic.
- Add server-side normalization and validation helpers so all entity types follow the same rules.
- Update docs when the first implementation lands and when schema/API surfaces change.

## Suggested order

1. Task groups
2. Tasks
3. Lists
4. Boards

This order keeps early work close to the current board metadata/editor patterns and leaves the broader navigation impact for last.

## Explicit deferrals

- No Lucide icons.
- No icon color.
- No FTS indexing changes.
- No mixed picker for multiple icon systems.
