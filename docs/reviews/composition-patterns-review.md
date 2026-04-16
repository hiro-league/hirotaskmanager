# Composition Patterns Review — `src/client/**`

Skill: [`vercel-composition-patterns`](../../.agents/skills/vercel-composition-patterns/SKILL.md)
Date: 2026-04-16
Scope: Web client only (`src/client/**`). React 19.2.4 + Radix UI + Tailwind v4.

> Abiding to the workspace `no-backward-compatibility` rule — every
> suggestion below can land as a direct refactor (no wrappers).

---

## TL;DR

The app already uses several composition-friendly patterns: a compound
provider stack in `BoardView`, dependency-injected context (`BoardSearchContext`,
`BoardStatsDisplayContext`, `BoardKeyboardNavContext`), and Radix
compound primitives for Dialog. The **biggest architectural issue** is
`BoardHeader` and a few sibling components receiving **15–25 props that
are really "state + setter + ref" bundles** lifted up from `BoardView`.
This is prop drilling disguised as props, not composition.

Secondary issues: one leftover `forwardRef` (React 19), `useContext`
usage everywhere (should be `use()`), and a couple of `isX` boolean
props that are better expressed as explicit variants.

---

## Recommendations, sorted by impact

| # | Priority | Recommendation | Location(s) | Why it matters |
|---|----------|----------------|-------------|----------------|
| 1 | **CRITICAL** | Extract a `BoardEditingProvider` that owns the board‑rename draft (`editingBoardName`, `boardNameDraft`, refs, commit/cancel) instead of drilling 9 of those props from `BoardView` → `BoardHeader`. | `src/client/components/board/BoardView.tsx:90-158`, `src/client/components/board/header/BoardHeader.tsx:22-48` | `BoardHeaderProps` has **25 props**; 9 exist only to synchronize rename state between `BoardView` and `BoardHeader`. Classic "lift state into provider" case. |
| 2 | **CRITICAL** | Extract a `BoardDialogsProvider` (or a small `useBoardDialogs()` store) that owns the 5 dialog open-state + setters (`boardEditOpen`, `groupsEditorOpen`, `prioritiesEditorOpen`, `releasesEditorOpen`, `shortcutHelpOpen`) instead of threading `onOpenBoardEdit`, `onOpenGroupsEditor`, etc. through `BoardHeader`. | `BoardView.tsx:90-101`, `BoardHeader.tsx` (4 callback props) | Same "lift state to provider" pattern. Lets `BoardHeader` become much smaller and removes circular prop passing. |
| 3 | **HIGH** | Turn `BoardHeader` into a compound component: `<BoardHeader.Root>` with `<BoardHeader.Title>`, `<BoardHeader.FilterStrip>`, `<BoardHeader.Stats>`, etc. Each piece reads from the providers above. | `components/board/header/BoardHeader.tsx` | Today it's a monolith that receives state + setters for every child concern. After the provider extraction this is a near-free refactor and removes 20+ lines of props. |
| 4 | **HIGH** | Replace the one remaining `forwardRef` in `src/client/components/multi-select.tsx:307` with a plain prop `ref`. React 19 supports it. | `components/multi-select.tsx:307` | Skill rule `react19-no-forwardref`. |
| 5 | **HIGH** | Replace every `useContext(X)` call with `use(X)` (React 19 API). 11 call sites. | `components/board/shortcuts/ShortcutScopeContext.tsx:38,46`, `BoardKeyboardNavContext.tsx:74,82`, `BoardTaskKeyboardBridge.tsx:73,83`, `BoardStatsContext.tsx:40`, `context/BoardSearchContext.tsx:36,44`, `gamification/BoardTaskCompletionCelebrationContext.tsx:243,253`, `board/lanes/useColumnInViewport.ts:73` | Skill rule `react19-no-forwardref` (also covers `use()`). Enables conditional use, cleaner semantics. |
| 6 | **MEDIUM** | Split `BandComposer` (inline "Add task" form) and `BandFab` into a real compound `<Composer.*>` with a dedicated provider that owns `title`, `isPending`, `inputRef`, and the submit/cancel actions. `StackedTaskList` / `BoardListStackedColumn` / `BoardListColumn` duplicate the same control flow today. | `components/board/lanes/BandComposer.tsx`, `components/board/columns/BoardListStackedColumn.tsx:165+`, `components/board/columns/useAddListComposer.ts` | Directly mirrors the "Composer" example from the skill. The composer appears in 3+ places with slightly different props/wrapping. |
| 7 | **MEDIUM** | Replace `<Dialog … showCloseButton={false}>` / `<DialogFooter showCloseButton>` boolean variants with compound slots: `<Dialog.Content>` and `<Dialog.Close asChild>…</Dialog.Close>` explicitly. | `components/ui/dialog.tsx:51,98` | Skill rule `architecture-avoid-boolean-props` + `patterns-children-over-render-props`. The close button is a single child — let consumers render/omit it. |
| 8 | **MEDIUM** | Rename `AuthScreen` into explicit variants: `<SetupAuthScreen />` and `<LoginScreen />` at the route boundary instead of an `initialized` boolean switch. Each variant already exists internally. | `components/auth/AuthScreen.tsx:313-322` | Skill rule `patterns-explicit-variants`. The file is already shaped this way; promote the internals. |
| 9 | **MEDIUM** | Move sidebar's inline editing state (new-board draft, rename draft) into a `SidebarProvider` so `SidebarBoardItem`/`Sidebar` stop passing drafts and refs between each other. | `components/layout/Sidebar.tsx`, `components/layout/SidebarBoardItem.tsx` | Similar to #1 but smaller blast radius. |
| 10 | **LOW** | `TaskCard` has 10+ optional callback props (`onTitleCommit`, `onTitleCancel`, `onCompleteFromCircle`, `onTitleDraftChange`, `editingTitle`, `titleDraft`, `titleEditBusy`, `skipNavRegistration`, `isDragging`, …). Group them into `{ inlineEdit?: { draft, setDraft, commit, cancel, busy } }` object or, better, wrap the inline-editing variant as `<TaskCardInlineEditing>` sibling. | `components/task/TaskCard.tsx:122-147` | Reduces the "exponential state" problem called out in `architecture-avoid-boolean-props`. |
| 11 | **LOW** | The "stacked vs lanes" board layout is a boolean fork at 3 call sites (`BoardColumns` vs `BoardColumnsStacked`, `useBandController` vs `useStackedListTaskActions`, `BandTaskList` vs `StackedTaskList`). Consider a `LayoutProvider` that picks the correct primitives, or keep it but document the variance clearly. | `BoardView.tsx:75`, `columns/BoardColumns*.tsx` | Already using explicit variants (good), but the parent still forks. |

---

## What looks good (keep it)

- `BoardSearchContext` has the exact shape the skill recommends: state +
  actions, plus an optional reader hook for components that may render
  outside the provider.
- `BoardStatsDisplayContext` exposes a `{ board, listStat, fetching,
  pending, showChipSpinner, statsError }` interface so consumers don't
  need to know about TanStack Query internals. This is textbook
  "decouple state from UI".
- `BoardView` composes 6 providers (`ShortcutScopeProvider`,
  `BoardStatsDisplayProvider`, `BoardTaskKeyboardBridgeProvider`,
  `BoardKeyboardNavProvider`, `BoardTaskCompletionCelebrationProvider`)
  around the UI tree. This is the right shape.
- `BoardKeyboardNavContext` and `BoardTaskCompletionCelebrationContext`
  both expose a strict and an `*Optional()` reader — matches the
  pattern for components that may live outside the provider.
- Almost no `render*` props anywhere in `src/client/**`. Composition via
  `children` is the dominant pattern already.

---

## Compliance matrix

Rule ID and name come from `.agents/skills/vercel-composition-patterns/rules/`.
"Pass" means no violation was found in the audited files; "Partial" means
the app follows the rule in most places but has 1–3 specific counter-examples
covered in the Recommendations above.

### 1. Component Architecture — HIGH

| Rule | Status | Evidence |
|------|--------|----------|
| `architecture-avoid-boolean-props` | **Partial** | `BoardHeaderProps` has `editingBoardName`, `filterCollapsed`, `patchBoardPending` + 20 siblings; `Dialog` uses `showCloseButton`; `TaskCard` uses `editingTitle`, `isDragging`, `skipNavRegistration`. |
| `architecture-compound-components` | **Partial** | `Dialog`, `Command`, `Popover`, `DropdownMenu` are compound (via Radix). Custom compound components (`BoardHeader.*`, `Composer.*`) are missing. |

### 2. State Management — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `state-decouple-implementation` | **Pass** | Providers (`BoardStatsDisplayProvider`, `BoardKeyboardNavProvider`) expose `{state, actions, meta}`-shaped values; UI components read the interface, not TanStack Query / Zustand directly. |
| `state-context-interface` | **Pass** | `BoardSearchContext`, `BoardStatsDisplayContext`, `BoardKeyboardNavContext`, `BoardTaskCompletionCelebrationContext` all define an explicit interface with actions + state. |
| `state-lift-state` | **Partial** | Board-level state is correctly lifted to `BoardView` + context. The rename draft and dialog open-states stayed as `useState` in `BoardView` and are drilled through `BoardHeader` — they should be lifted one more level into a provider. |

### 3. Implementation Patterns — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `patterns-explicit-variants` | **Partial** | Good: `BoardColumns` vs `BoardColumnsStacked`, `BandTaskList` vs `StackedTaskList`. Counter-example: `AuthScreen` forks on an `initialized` boolean rather than exporting two variants at the route level. |
| `patterns-children-over-render-props` | **Pass** | No `renderHeader` / `renderFooter` / `renderItem`-style props found in `src/client/**`. Composition via `children` is the default. |

### 4. React 19 APIs — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `react19-no-forwardref` (ref as prop) | **Fail** | `src/client/components/multi-select.tsx:307` still uses `React.forwardRef`. |
| `react19-no-forwardref` (`use()` over `useContext()`) | **Fail** | 11 `useContext(...)` call sites across 7 files. None use `use()`. |

### Summary

| Category | Rules checked | Pass | Partial | Fail |
|----------|---------------|------|---------|------|
| 1. Component Architecture | 2 | 0 | 2 | 0 |
| 2. State Management | 3 | 2 | 1 | 0 |
| 3. Implementation Patterns | 2 | 1 | 1 | 0 |
| 4. React 19 APIs | 2 (under one rule id) | 0 | 0 | 2 |
| **Total** | **9** | **3** | **4** | **2** |

Compliance rate (Pass only): **33%** (3 / 9).
Compliance rate (Pass + Partial): **78%** (7 / 9) — most rules are
respected in spirit; the remaining work is mostly two high-leverage
refactors (`BoardHeader` decomposition + React 19 API sweep).

---

## Suggested order of execution

1. **React 19 API sweep** (recommendations #4 + #5) — mechanical, no
   behavior change, good warm-up. One PR, ~30 minutes.
2. **Lift rename draft + dialog opens into providers** (#1 + #2). This
   immediately simplifies `BoardView`'s JSX and `BoardHeaderProps`.
3. **Decompose `BoardHeader` into compound parts** (#3) — free follow-up
   once #1 and #2 land.
4. **Composer compound component** (#6) — factor out the shared
   "add task" primitive; gives a reusable `<Composer.*>` for future
   features (quick-reply, forward, etc.).
5. **Boolean → variants cleanup** (#7, #8, #10) as opportunistic
   cleanups while touching those files.
