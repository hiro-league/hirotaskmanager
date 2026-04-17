# Composition Patterns Review — Round 2 — `src/client/**`

Skill: [`vercel-composition-patterns`](../../.agents/skills/vercel-composition-patterns/SKILL.md)  
Date: 2026-04-17 (updated after applying recs **#1**–**#2**, **#4**, 2026-04-17)  
Scope: Web client only (`src/client/**`). React 19.2.4 + Radix UI + Tailwind v4.  
Prior round: [`composition-patterns-review.md`](./composition-patterns-review.md) (2026-04-16).

> Abiding to the workspace `no-backward-compatibility` rule — every
> suggestion below can land as a direct refactor (no wrappers).

---

## TL;DR

Round 1 items **board rename / dialog state**, **compound `BoardHeader`**, **`SidebarProvider`**, **`Composer.*`**, **`TaskCard` `inlineEdit`**, **auth as `LoginScreen` / `SetupAuthScreen`**, **dialog without `showCloseButton`**, and the **`forwardRef` → ref-as-prop** move are largely **landed**. The client is **much closer** to the skill than the Round 1 snapshot.

**Recommendations #1, #2, and #4 are implemented:** `useBoardLayout` / `useSidebar` use **`use()`**; board search and task-editor detail fetching use **`useBoardSearchHits`** and **`useBoardTaskDetail`**; **`BoardHeaderProps`** is grouped into **`board` + `shell` + `surface` + `emoji` + `filters` + `stats`** with **six focused contexts** (`BoardHeaderBoardContext`, `BoardHeaderShellContext`, …) so subcomponents read only their slice.

What remains is **optional**: normalize a few context values toward the skill’s **`{ state, actions, meta }`** split where it buys testability. **`TaskCard`** still uses small boolean flags (`isDragging`, `skipNavRegistration`).

---

## Recommendations, sorted by impact

| # | Priority | Recommendation | Location(s) | Why it matters |
|---|----------|----------------|-------------|----------------|
| 1 | ~~**HIGH**~~ **Done** | Replace `useContext(BoardLayoutContext)` and `useContext(SidebarContext)` with `use(...)` inside the respective hook implementations. | `src/client/context/BoardLayoutContext.tsx`, `src/client/components/layout/SidebarContext.tsx` | Skill rule `react19-no-forwardref` (React 19: `use()` for context). |
| 2 | ~~**MEDIUM**~~ **Done** | Move **direct `useQuery`** usage in feature UI behind **`api/`** query hooks. Implemented as **`useBoardSearchHits`** and **`useBoardTaskDetail`** (separate modules from fetch fns so tests can spy on fetches). | `src/client/api/useBoardSearchHits.ts`, `src/client/api/useBoardTaskDetail.ts`; consumers: `BoardSearchDialog.tsx`, `useTaskEditorForm.ts` | Skill rule `state-decouple-implementation` — API layer owns TanStack Query wiring. |
| 3 | **MEDIUM** | (Optional) Normalize **high-churn** contexts to the skill’s **`{ state, actions, meta }`** shape **only** where you want alternate providers (tests, Storybook, or a second backend). Skip flat contexts that are already clear. | e.g. `BoardEditingContext`, `BoardDialogsContext`, `BoardSearchContext` | Skill rule `state-context-interface` — strict reading of the rule; not required for every small context. |
| 4 | ~~**LOW**~~ **Done** | Split `BoardHeader` into **named prop slices** and **small context providers** (emoji, shell/scroll/collapse, surface id, filter summaries, stats row) instead of one flat `BoardHeaderProps` + single layout context. | `BoardHeader.tsx`, `BoardView.tsx` (`<BoardHeader shell={{…}} surface={{…}} emoji={{…}} … />`) | Skill rule `architecture-avoid-boolean-props` + compound patterns. |
| 5 | **LOW** | Keep **stacked vs lanes** variance **explicit** (`BoardLayoutProvider` + `BoardLayoutContext` comment block). Revisit a single `LayoutProvider` **only** if the fork spreads to more call sites. | `src/client/context/BoardLayoutContext.tsx`, `BoardView` / `BoardColumnsResolved` | Skill `patterns-explicit-variants` — documentation + `BoardColumnsResolved` already align; optional consolidation. |

---

## What looks good (keep it)

- **`BoardEditingProvider`** / **`BoardDialogsProvider`** own rename + dialog chrome; **`useBoardEditing()`** / **`useBoardDialogs()`** replace the old `BoardView` → `BoardHeader` drill.
- **`BoardHeader`**: **`BoardHeader.Root`** + **focused contexts** (`BoardHeaderShellContext`, `BoardHeaderEmojiContext`, …) — compound header; each piece reads only its slice.
- **`Composer`** in `lanes/Composer.tsx`: **`Composer` + `Root` / `Textarea` / `Fab` / …** via `Object.assign`; state stays in list controllers by design (avoids wide context re-renders).
- **`SidebarProvider`** + **`useSidebar()`** — drafts and mutations live in context; see comment on `SidebarContext.tsx`.
- **`TaskCard`**: **`TaskCardInlineEdit`** + **`taskCardInlineEditFor`** — bundles inline edit fields instead of many loose props.
- **`App`**: **`LoginScreen`** vs **`SetupAuthScreen`** at the auth boundary (explicit variants).
- **`Dialog`**: content/footer **without** `showCloseButton` booleans — consumers compose **`DialogClose`** where needed.
- **`BoardLayoutContext`**: documents **lanes vs stacked** and lists where the fork applies.
- **Providers in `BoardView`**: shortcut, stats, keyboard, celebration, etc. — same composition stack as Round 1 praised.
- Still **no `renderHeader` / `renderItem`**-style APIs; **`children`**-first composition.

---

## Compliance matrix

Rule ID and name come from `.agents/skills/vercel-composition-patterns/rules/`.  
"Pass" means no meaningful gap vs the skill in audited areas; "Partial" means mostly aligned with specific gaps called out in Recommendations above.

### 1. Component Architecture — HIGH

| Rule | Status | Evidence |
|------|--------|----------|
| `architecture-avoid-boolean-props` | **Partial** | **`BoardHeader`** uses grouped props + contexts (round 4); **`TaskCard`** still has `isDragging`, `skipNavRegistration`. |
| `architecture-compound-components` | **Partial** | Radix compounds (`Dialog`, `Command`, …) plus **custom** `BoardHeader.*` + **`Composer.*`**. Not every large surface is split the same way. |

### 2. State Management — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `state-decouple-implementation` | **Pass** | Feature UI uses **`api/`** hooks (`useBoardSearchHits`, `useBoardTaskDetail`, `useBoards`, etc.); no direct **`useQuery`** in `src/client/components/**` (only **`useQueryClient`** where appropriate). |
| `state-context-interface` | **Partial** | Contexts expose **clear** interfaces; few use the skill’s strict **`{ state, actions, meta }`** triple (many are **flat** domain shapes, e.g. `BoardSearchContext`). |
| `state-lift-state` | **Pass** | **Board editing**, **dialogs**, **sidebar** state live in providers; **no** major rename/dialog drill through `BoardHeader` like Round 1. |

### 3. Implementation Patterns — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `patterns-explicit-variants` | **Pass** | **`LoginScreen`** / **`SetupAuthScreen`**; **`BoardColumnsResolved`** / lane vs stacked components; layout documented on **`BoardLayoutContext`**. |
| `patterns-children-over-render-props` | **Pass** | No `renderHeader` / `renderFooter` / `renderItem`-style props found in `src/client/**`. |

### 4. React 19 APIs — MEDIUM

| Rule | Status | Evidence |
|------|--------|----------|
| `react19-no-forwardref` (ref as prop) | **Pass** | No `forwardRef` under `src/client/**` (only a comment in `multi-select.tsx` about ref-as-prop). |
| `react19-no-forwardref` (`use()` over `useContext()`) | **Pass** | All context consumers use **`use()`**; no **`useContext(`** calls (only mentioned in comments). |

### Summary

| Category | Rules checked | Pass | Partial | Fail |
|----------|---------------|------|---------|------|
| 1. Component Architecture | 2 | 0 | 2 | 0 |
| 2. State Management | 3 | 2 | 1 | 0 |
| 3. Implementation Patterns | 2 | 2 | 0 | 0 |
| 4. React 19 APIs | 2 (under one rule id) | 2 | 0 | 0 |
| **Total** | **9** | **6** | **3** | **0** |

Compliance rate (Pass only): **67%** (6 / 9).  
Compliance rate (Pass + Partial): **100%** (9 / 9) — no failing rows; remaining work is **optional strictness** on context shapes and guardrails on large surfaces.

---

## Suggested order of execution

1. ~~**`use()` sweep** (recommendation **#1**)~~ — **done.**
2. ~~**`useQuery` → `api/` hooks** (recommendation **#2**)~~ — **done** (`useBoardSearchHits`, `useBoardTaskDetail`).
3. **Optional context triple** (recommendation **#3**) — only for contexts you want to mock or swap implementations.
4. ~~**Guardrails on `BoardHeader`** (recommendation **#4**)~~ — **done** (sliced props + contexts).
5. **Layout variance** (recommendation **#5**) — when editing layout routing, keep stacked vs lanes explicit.
