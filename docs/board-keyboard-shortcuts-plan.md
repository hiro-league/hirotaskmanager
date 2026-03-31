# Board keyboard shortcuts plan

This document proposes a modular keyboard shortcut system for board interactions, with a scoped shortcut registry, task highlighting, layout-aware navigation, and a shortcut help dialog.

## Goals

- Support board-first keyboard use with minimal mouse reliance.
- Keep shortcut definitions centralized, readable, and easy to extend.
- Scope shortcuts to the active UI module so they do not conflict.
- Introduce task highlighting as a navigation state that is separate from browser focus.
- Make navigation work in both board layouts:
  - `lanes`
  - `stacked`
- Support first-run shortcut onboarding for boards.
- Ensure highlight and dialog behavior works in both light and dark themes.

## Confirmed product decisions

- Opening a board from the sidebar should auto-open the shortcut help every time a board is opened until the user checks “Don’t show again”.
- `f` should highlight the task under the mouse when one is hovered; otherwise it should highlight the first visible task, or scroll the current highlight back into view.
- `Esc` on a dirty dialog should show a discard confirmation, not silently close.
- Backdrop click and close buttons should follow the same dirty/clean close rules as `Esc`.
- `Enter` on a highlighted task should open the same task editor used by clicking a task.
- `d` should open a custom confirmation dialog for the highlighted task; browser `confirm()` dialogs should be replaced over time.
- `c` should complete any non-closed highlighted task.
- `r` should reopen a closed highlighted task to the canonical `open` status.
- Shortcuts are scoped to the module they are in, with topmost dialog or menu scope overriding board scope.

## Initial shortcut set

### Board scope

| Key | Action |
|---|---|
| `h` | Open shortcut help dialog |
| `f` | Highlight a task |
| `ArrowLeft` / `ArrowRight` | Move between lists |
| `ArrowUp` / `ArrowDown` | Move between tasks |
| `Home` / `End` | Jump to first / last task |
| `PageUp` / `PageDown` | Skip several tasks |
| `Enter` | Open highlighted task |
| `d` | Open delete confirmation for highlighted task |
| `c` | Complete highlighted task |
| `r` | Reopen highlighted task |
| `g` | Cycle task groups filter |
| `a` | Switch to all groups |
| `m` | Toggle filters / compact header |

### Dialog scope

| Key | Action |
|---|---|
| `Esc` | Dismiss dialog, or show discard confirmation if dirty |
| `Enter` | Confirm primary action when appropriate |

## Design principles

### 1. Keep shortcut definitions declarative

Do not scatter `window.addEventListener("keydown", ...)` handlers across board components.

Instead, define shortcuts in a registry with:
- `id`
- `scope`
- `keys`
- `description`
- `enabled(context)`
- `run(context)`
- `preventDefault`

This provides:
- one source of truth for behavior
- one source of truth for the shortcut help dialog
- predictable conflict handling
- easier future expansion

### 2. Keep highlight separate from DOM focus

Task highlighting is a board navigation concept, not the same as browser focus.

Why:
- task cards are not currently built as focus-managed controls
- the board contains drag-and-drop wrappers
- dialogs and inline editors already need normal input focus behavior
- using DOM focus for board navigation will create conflicts with text inputs and drag handles

Recommended state:
- `highlightedTaskId: number | null`
- optional `highlightedListId: number | null`
- a per-board navigation state stored in component state or a small board-scoped context

### 3. Navigation should use derived board data, not DOM order

Do not navigate by querying sibling DOM nodes.

Instead, compute a normalized navigation model from:
- visible lists
- visible statuses
- current layout
- filtered task set
- task ordering
- group filter state

This avoids fragile behavior and makes `ArrowUp` / `ArrowDown` work consistently across both `lanes` and `stacked` layouts.

### 4. Scope resolution must be explicit

The active scope should be resolved in priority order:
1. topmost modal dialog
2. board module
3. other app-level scopes later if added

Board shortcuts must be ignored while typing in:
- `input`
- `textarea`
- `select`
- contenteditable elements

## Current codebase implications

The board currently has the right component boundaries for this feature:
- `src/client/components/board/BoardView.tsx`
- `src/client/components/board/BoardColumns.tsx`
- `src/client/components/board/BoardColumnsStacked.tsx`
- `src/client/components/board/BoardListColumn.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`
- `src/client/components/board/ListStatusBand.tsx`
- `src/client/components/board/SortableTaskRow.tsx`
- `src/client/components/task/TaskCard.tsx`

The main architectural issue today is that some dialogs use independent global `window` key listeners. That works for simple `Escape` handling, but it will conflict with a scoped shortcut system once board shortcuts are introduced. Dialog keyboard handling should move to the same scoped system.

The existing preferences store is a good place to persist first-run shortcut onboarding:
- `src/client/store/preferences.ts`

## Proposed architecture

## 1. Board shortcut provider

Create a board-scoped provider near `BoardView` that owns:
- active scope registration for board-owned UI
- highlighted task state
- registered task element refs for scroll-into-view
- shortcut dispatch
- open/closed state for shortcut help dialog
- first-run onboarding state

Suggested responsibilities:
- install a single keydown handler for the board scope
- ignore events when a higher-priority scope is active
- ignore board shortcuts while typing in editable controls
- expose actions for highlight movement and task actions

## 2. Shortcut registry

Recommended file split:
- `src/client/components/board/shortcuts/boardShortcutTypes.ts`
- `src/client/components/board/shortcuts/boardShortcutRegistry.ts`
- `src/client/components/board/shortcuts/useScopedShortcuts.ts`
- `src/client/components/board/shortcuts/ShortcutHelpDialog.tsx`

Suggested type shape:

```ts
type ShortcutScope = "board" | "task-dialog" | "groups-dialog" | "discard-dialog";

interface ShortcutDefinition {
  id: string;
  scope: ShortcutScope;
  keys: string[];
  description: string;
  preventDefault?: boolean;
  enabled: (ctx: ShortcutContext) => boolean;
  run: (ctx: ShortcutContext) => void | Promise<void>;
}
```

Notes:
- `keys` can stay simple at first because the current set is mostly single-key shortcuts.
- The registry should be grouped by scope and rendered directly by the help dialog.

## 3. Board navigation model

Introduce a derived navigation structure that produces a stable ordered view of visible tasks.

Suggested output shape:

```ts
interface NavigableTask {
  taskId: number;
  listId: number;
  status: string;
  rowIndex: number;
  columnIndex: number;
  linearIndex: number;
}
```

The navigation model should expose helpers like:
- `getFirstTask()`
- `getLastTask()`
- `getNextTask(currentTaskId)`
- `getPreviousTask(currentTaskId)`
- `getTaskInAdjacentList(currentTaskId, direction)`
- `getPageTask(currentTaskId, delta)`
- `getDefaultTaskToHighlight()`

### Lanes layout behavior

In `lanes`, tasks are visually grouped by status band within each list.

Recommended behavior:
- `Left` / `Right`: keep the closest logical row when moving to another list
- `Up` / `Down`: traverse tasks in the visible reading order across statuses
- `Home` / `End`: jump to the first or last visible task in the whole board
- `PageUp` / `PageDown`: move by a fixed step such as 5 tasks

### Stacked layout behavior

In `stacked`, each list is a single ordered task column.

Recommended behavior:
- `Left` / `Right`: move between list columns
- `Up` / `Down`: move within the list
- if the target list is shorter, clamp to the nearest available row

## 4. Highlight rendering

Highlight should be visible in both themes and should not depend on hover.

Recommended visual treatment:
- use theme tokens rather than hardcoded colors
- keep the card background unchanged
- add a clear ring and offset

Suggested style direction:
- `ring-2 ring-ring ring-offset-2 ring-offset-background`
- optional stronger shadow while highlighted
- preserve existing left color bar if the task has one

Highlight should be applied at the task card level and flow from the board context into:
- `TaskCard`
- `SortableTaskRow`
- task renderers in both layouts

## 5. Task element registry and scroll behavior

Each rendered task should register its DOM element by `taskId`.

Needed for:
- scroll highlighted task into view
- keeping highlight visible after arrow navigation
- handling `f` and `Enter` reliably

Recommended behavior:
- if no task is highlighted and the user presses `f`, highlight the first visible task
- if a task is highlighted and the user presses `f`, scroll it into view again
- after navigation, call `scrollIntoView({ block: "nearest" })`

## 6. Shortcut help dialog

The help dialog should render directly from the shortcut registry.

Requirements:
- grouped by scope or category
- concise labels
- include a “Don’t show this again” checkbox
- explain that shortcuts are scoped to the current board/module
- accessible close behavior with `Esc`
- `Enter` should activate the primary action when appropriate

First-run behavior:
- when a board is opened from the sidebar for the first time ever, show the help dialog
- if the user checks “Don’t show again”, persist that preference
- `h` should always reopen the help dialog later

## 7. Dirty dialog discard flow

Dialogs that edit data should track dirty state.

Required behavior:
- `Esc` on a clean dialog closes immediately
- `Esc` on a dirty dialog opens a discard confirmation
- discard confirmation should become the active scope
- pressing `Enter` in the discard confirmation should confirm discard
- pressing `Esc` there should cancel discard and return to the editor

This applies at minimum to:
- task editor
- task groups editor

## React and library choice

## Recommended approach

Use:
- plain React
- a custom board-scoped shortcut hook
- the existing Zustand preferences store for persistence

This is enough for the current shortcut set.

## Optional library

A library such as `react-hotkeys-hook` could help with:
- key parsing
- binding cleanup
- hook ergonomics

But it does not solve the hard parts here:
- scope precedence
- board navigation model
- highlight state
- dirty-dialog discard behavior
- layout-aware movement across tasks and lists

Conclusion:
- start custom
- only add a shortcut library later if key parsing becomes complex

## Proposed phases

## Phase 1: Foundation and help dialog

### Goal

Create the board-scoped shortcut infrastructure without changing too much behavior at once.

### Work

- Add board shortcut provider/context near `BoardView`
- Add a declarative shortcut registry for board scope
- Add shortcut help dialog rendered from the registry
- Add persisted preference for “show keyboard help on first board open”
- Show the dialog the first time a board is opened from the sidebar
- Add `h` to reopen the dialog
- Add `m`, `g`, and `a` since they already map cleanly to existing board controls/state

### Deliverables

- one board-level key handler
- one board shortcut help dialog
- persisted onboarding preference
- zero conflicting ad hoc board-level handlers

### Acceptance criteria

- opening a board can show the help dialog once
- checking “don’t show again” persists across reloads
- `h` always opens the help dialog
- `m`, `g`, and `a` work when no dialog is active
- board shortcuts do not fire while typing into inputs

## Phase 2: Highlight and navigation

### Goal

Introduce keyboard movement across visible tasks and lists.

### Work

- Add `highlightedTaskId` state
- Add a normalized navigation model for both layouts
- Register task DOM refs
- Add highlight styling to `TaskCard`
- Add `f`, arrow keys, `Home`, `End`, `PageUp`, `PageDown`
- Auto-scroll highlighted tasks into view

### Deliverables

- layout-aware task movement in `lanes` and `stacked`
- stable highlight state
- visible theme-safe highlight frame

### Acceptance criteria

- `f` highlights the first visible task if none is selected
- arrow keys move predictably between tasks and lists
- movement works with group filters applied
- highlight remains visible in light and dark themes
- no DOM-query-based navigation hacks are required

## Phase 3: Task actions and dialog scope

### Goal

Make highlighted tasks actionable and move dialogs into the same scoped keyboard system.

### Work

- Add board-scope actions for:
  - `Enter`
  - `d`
  - `c`
  - `r`
- Move dialog `Esc` and `Enter` handling into the scoped system
- Track dirty state in dialogs
- Add discard confirmation flow for dirty dialogs
- Ensure dialog scope overrides board scope

### Deliverables

- highlight-driven task actions
- discard confirmation on dirty `Esc`
- board/dialog shortcut precedence

### Acceptance criteria

- `Enter` opens the highlighted task
- `d` opens delete confirmation for highlighted task
- `c` completes highlighted task when allowed
- `r` reopens highlighted task when allowed
- `Esc` on a dirty dialog shows discard confirmation
- board shortcuts do not fire while a dialog is active

## Phase 4: Scoped dialogs, confirmation flows, and remaining task actions

### Goal

Finish the scoped shortcut architecture by moving dialogs and confirmations into the same system, and replace browser-confirm-style flows with app-owned dialogs.

### Work

- Replace the board `active` boolean pattern with explicit scope registration and topmost-scope resolution
- Expand shortcut scopes at minimum to:
  - `board`
  - `shortcut-help-dialog`
  - `task-editor`
  - `task-groups-editor`
  - `discard-dialog`
  - task-delete confirmation scope
  - list-delete confirmation scope
  - menu scope(s) such as the list header actions menu if they participate in keyboard handling
- Move dialog and menu `Esc` / `Enter` handling out of ad hoc `window.addEventListener("keydown", ...)` listeners and into the scoped registry
- Add shared close-request handling for dialogs so `Esc`, backdrop click, and close buttons all follow the same clean/dirty decision path
- Track dirty state in:
  - task editor
  - task groups editor
  - other editors that can mutate data if they later join the scoped shortcut system
- Add discard confirmation flow:
  - clean dialog: close immediately
  - dirty dialog: open discard confirmation instead of closing
  - discard confirmation becomes the active scope
  - `Enter` confirms discard
  - `Esc` cancels discard and returns focus/interaction to the editor dialog
  - while save is pending, dismiss actions should be disabled
- Add remaining highlighted-task actions to board scope:
  - `Enter` opens task editor
  - `d` opens task delete confirmation
  - `c` completes highlighted task when not already closed
  - `r` reopens highlighted task to canonical `open`
- Replace browser `confirm()` usage in board-related flows with app dialogs that can participate in the same scope system
- Ensure confirmation dialogs use the common-sense default behavior:
  - clicking the confirm button confirms
  - pressing `Enter` confirms
  - pressing `Esc` cancels unless the confirmation itself is dirty, which it should not be

### Deliverables

- one scoped shortcut system that owns board, dialog, confirmation, and participating menu keyboard behavior
- highlight-driven task open / complete / reopen / delete actions
- discard confirmation on dirty close attempts from `Esc`, backdrop, and close buttons
- board-owned replacement dialogs for task and list delete confirmation
- removal of board-related browser `confirm()` flows

### Acceptance criteria

- board shortcuts do not fire while any dialog or participating menu scope is active
- `Enter` opens the highlighted task in the existing task editor
- `d` opens a custom delete confirmation for the highlighted task
- `c` completes any non-closed highlighted task
- `r` reopens a closed highlighted task to `open`
- `Esc`, backdrop click, and close buttons all close clean dialogs immediately
- `Esc`, backdrop click, and close buttons all open discard confirmation for dirty dialogs
- `Enter` on discard confirmation confirms discard
- `Esc` on discard confirmation cancels and returns to the editor dialog
- while save is pending, dirty dialogs cannot be dismissed by shortcut or backdrop
- task-delete and list-delete confirmation flows no longer use browser `confirm()`

## Phase 5: Polish, tests, and extension points

### Goal

Stabilize the completed shortcut system, keep the help UI and registry aligned, and document the pattern so future modules can adopt it consistently.

### Work

- Refine category labels and descriptions in the shortcut help dialog so board, dialog, and confirmation behavior read clearly
- Group shortcut help content by scope or category while keeping the registry as the source of truth
- Add focused automated coverage for logic-heavy pieces:
  - navigation model derivation
  - shortcut enable/disable and scope precedence rules
  - dirty dialog discard decisions
  - confirmation dialog default actions
- Expand the manual test checklist to cover:
  - hovered-task `f` behavior
  - onboarding auto-open until “Don’t show again”
  - task and list delete confirmations
  - participating menu scope precedence if enabled
- Document the scoped shortcut pattern for future modules beyond board view
- Add telemetry or debug logging only if useful during development or rollout
- Optionally add support for multi-key combos later
- Optionally add visible hint text in the board UI after first-run onboarding

### Deliverables

- stable developer-facing pattern for future module scopes
- clearer UX around available shortcuts and confirmations
- focused confidence checks around the riskiest stateful behavior
- easier future adoption outside board view

### Acceptance criteria

- adding a new shortcut is mostly registry work
- new scopes can be introduced without rewriting board logic
- shortcut help stays in sync automatically with the registry
- focused tests exist for the most failure-prone decision logic if tests are added
- manual verification covers board scope, dialog scope, confirmation scope, and onboarding behavior

## Suggested persistence additions

Add to preferences state:
- `boardShortcutHelpDismissed: boolean` — user checked “don’t show again”; disables auto-open on board selection only.

Keep this in the existing persisted preferences store so onboarding behavior is consistent with other UI preferences.

## Risks and mitigations

### Risk: shortcut conflicts with existing global listeners

Mitigation:
- move dialog keyboard handling into the scoped registry pattern
- avoid multiple unrelated `window` listeners

### Risk: navigation feels inconsistent between layouts

Mitigation:
- define one normalized navigation model
- write behavior rules before implementation
- keep movement semantics consistent even if visual layout differs

### Risk: typing gets interrupted by board shortcuts

Mitigation:
- hard-block board scope when the active element is editable
- allow dialog scope to own keyboard handling while dialogs are active

### Risk: highlight styling is too subtle or theme-specific

Mitigation:
- use semantic theme tokens
- test in light and dark themes
- prefer ring + offset over background-only changes

## Testing checklist

### Manual

- Open a board from the sidebar for the first time
- Dismiss shortcut help and confirm persistence
- Reopen help with `h`
- Navigate with arrows in both `lanes` and `stacked`
- Verify movement with filtered task groups
- Verify `Home`, `End`, `PageUp`, `PageDown`
- Open a task with `Enter`
- Complete and reopen tasks with `c` and `r`
- Trigger delete confirmation with `d`
- Press `Esc` in clean and dirty dialogs
- Confirm highlight visibility in light and dark themes

### Optional focused tests

If automated tests are added, prioritize logic-heavy areas:
- navigation model derivation
- shortcut enable/disable rules
- dirty dialog discard decisions

## Implementation notes

- `BoardView` is the right board-level integration point.
- `TaskCard` should receive a simple `highlighted` prop.
- Both board layouts should consume the same navigation service or hook.
- Avoid solving this with DOM traversal or many local key handlers.
- The shortcut registry should be the single source of truth for both behavior and documentation.
