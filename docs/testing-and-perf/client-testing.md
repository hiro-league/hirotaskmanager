# Client testing plan

Scope: automated testing for the React/Vite client in `src/client`. This is a practical execution plan for building coverage over time, with separate guidance for pure logic, DOM/component tests, and browser E2E.

Abiding by **no-backward-compatibility** rule (initial development mode).

Relationship to other docs:

- `docs/testing-strategy.md` is the repo-wide pyramid and tooling overview.
- This file is the client-specific execution plan.

---

## 1. Current state

The client stack is **implemented** (Phases 0–11 for plan items below): **Vitest + RTL + jsdom** (+ **`@testing-library/jest-dom`**) for `src/client`, **Playwright** for `e2e/` (includes board FTS E2E, Phase 11), **Bun** for everything outside `src/client` and `e2e/`.

- **Commands:** `npm run test` (Bun; ignores `**/src/client/**` and `**/e2e/**`), `npm run test:client` (Vitest), `npm run test:e2e` (Playwright), `npm run release:check` (typecheck + Bun + Vitest + build + pack — no E2E).
- **CI:** `.github/workflows/ci.yml` runs a **fast** job then **e2e** (`needs: fast`).
- **Coverage:** There is solid coverage for many pure helpers, query/mutation hooks, keyboard/dialog smokes, route/page smokes, and a **small** E2E suite (board load, create/edit task, DnD smoke, app shell). The **CLI and server** test suites remain larger in file count; closing that gap is optional and should stay layered (pyramid), not “match CLI line count in the browser.”
- **Main risk surface** (unchanged): board UI — filters, query/cache, shortcuts, dialogs, DnD, and board-level interactions.

Phases 0–8 are **done**; **9–11** are **done** (see Phase 9–11 sections). **Phase 12** below is sustainability / flake policy.

---

## 2. Recommended stack

### 2.1 Recommendation

Use a split approach:

- **Pure client logic:** keep using **`bun test`**
- **DOM / component / hook tests:** add **Vitest + React Testing Library + jsdom**
- **Browser E2E:** add **Playwright**

### 2.2 Why this stack fits this repo

- The repo already uses Bun, so pure logic tests should stay fast and simple.
- The client is a Vite + React app with TanStack Query; Vitest + RTL is the most standard and lowest-friction setup for DOM tests here.
- Playwright is the right tool for a very small set of critical board journeys and DnD smoke coverage.
- This avoids forcing the entire repo onto a second runner while still giving the client the tooling it actually needs.

### 2.3 What not to do first

- Do not start by trying to deeply test `BoardView.tsx` end-to-end through DOM only.
- Do not start with a large Playwright suite.
- Do not try to unit-test every DnD detail through synthetic drag internals if one browser journey would cover the behavior more reliably.

---

## 3. Testing principles for the client

1. **Start at the lowest useful layer.**
   Test pure helpers before rendering full components.
2. **Prefer user-visible behavior over implementation details.**
   Assert rendered text, keyboard behavior, query invalidation results, and route outcomes instead of private state.
3. **Keep board tests targeted.**
   The board is the highest-risk area, but also the easiest place to create brittle tests if coverage is too broad.
4. **Use Playwright only for critical journeys.**
   Browser tests should confirm that the app works, not restate every component test.
5. **Keep tests hermetic.**
   No dependence on the developer’s existing dev data or manual app state.
6. **No compatibility wrappers for tests.**
   In initial development mode, test current behavior directly instead of preserving old shapes just to keep tests easy.

---

## 4. Coverage model

Use this pyramid for the client:

1. **Pure unit tests**
   Fastest. Best for formatting, filtering, ordering, path parsing, DnD id helpers, and cache-key logic.
2. **Hook / DOM tests**
   Best for keyboard shortcuts, dialogs, React Query hooks, mutation flows, and route behavior.
3. **Browser E2E**
   Best for a few critical journeys: board load, create/edit task, drag/reorder smoke, and one notification or search flow if it proves risky.

---

## 5. Phase plan

Phases are intentionally ordered. Earlier phases reduce the risk and cost of later ones.

**Status:** **0–11** are implemented for the items below (see each phase). **12** is sustainability / flake policy.

### Phase 0 — Decide tooling and create test commands

Goal: choose one client DOM stack and make it easy to run.

Recommended decisions:

- Keep `bun test` for pure logic.
- Add `vitest`, `@testing-library/react`, `@testing-library/user-event`, and `jsdom` for client DOM tests.
- Add `playwright` later, not in the same first PR unless setup is tiny.

Planned commands:

- `npm run test` for existing Bun tests
- `npm run test:client` for Vitest DOM tests
- `npm run test:e2e` for Playwright

Exit criteria:

- One documented command exists for client DOM tests.
- One documented command exists for browser E2E once Playwright is introduced.
- Contributors know which client tests belong to Bun vs Vitest.

**Implemented:** `vitest.config.ts` merges `vite.config.ts` and runs `src/client/**/*.test.{ts,tsx}` in `node` by default. Scripts: `npm run test:client` (`vitest run`), `npm run test:client:watch` (`vitest`). Dev deps: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`. **`npm run test` (Bun)** uses `--path-ignore-patterns "**/src/client/**"` and `"**/e2e/**"` so client and Playwright specs are not executed by Bun. **`npm run test:e2e`** (Playwright) is wired in Phase 6.

### Phase 1 — Build fast coverage with pure client unit tests

Goal: cover the highest-value client logic without needing a DOM.

Priority targets:

- `src/client/components/board/boardStatusUtils.ts`
- `src/client/components/board/shortcuts/boardTaskNavigation.ts`
- `src/client/components/board/boardFilterSummaries.ts`
- `src/client/components/board/dnd/dndIds.ts`
- `src/client/components/board/boardTheme.ts`
- `src/client/components/layout/boardCollapsedLabel.ts`
- `src/client/lib/boardPath.ts`
- `src/client/lib/mutationErrorUi.ts`
- `src/client/lib/notificationTime.ts`
- `src/client/api/queries.ts`

What to cover:

- Status visibility and merged ordering rules
- Filter summary labels and edge cases
- DnD id parse / round-trip helpers
- Board path parsing and encoding
- Error message normalization
- Time formatting boundaries
- Query-key normalization such as numeric-string board ids
- Theme output shape for representative presets

Suggested test file pattern:

- colocated `*.test.ts` beside each pure module

Exit criteria:

- The client has a meaningful base of pure tests under `src/client`.
- Regressions in board ordering/filter logic are caught without rendering React.

**Implemented:** Colocated `*.test.ts` files for `boardStatusUtils`, `boardTaskNavigation`, `boardFilterSummaries`, `dndIds`, `boardTheme`, `boardCollapsedLabel`, `boardPath`, `mutationErrorUi`, `notificationTime`, `queries`, plus migrated `boardTaskDndDeps` (Vitest). `release:check` runs `npm run test` then `npm run test:client`.

### Phase 2 — Add API and cache behavior tests

Goal: cover fetch, React Query keys, cache updates, and mutation behavior before large DOM suites.

Priority targets:

- `src/client/api/queries.ts`
- `src/client/api/notifications.ts`
- `src/client/api/mutations/tasks.ts`
- `src/client/api/mutations/lists.ts`
- `src/client/api/mutations/board.ts`
- `src/client/api/mutations/releases.ts`
- `src/client/api/useBoardChangeStream.ts`

What to cover:

- `fetchJson()` success and error parsing
- paginated list accumulation
- query-key normalization and invalidation behavior
- optimistic task create/update rollback and success replacement
- notification cache updates such as mark-all-read behavior
- SSE event handling that invalidates or updates queries

Recommended style:

- Pure helpers: Bun tests
- Hooks or React Query integration: Vitest + RTL `renderHook` / provider wrappers

Notes:

- This phase gives strong confidence in client behavior even before large component tests exist.
- It also reduces pressure to test every mutation only through browser flows.

Exit criteria:

- Representative query and mutation flows are covered.
- At least one optimistic update path and one rollback path are tested.

**Implemented:** Extended `queries.test.ts` (`fetchJson` error edge cases, `fetchTrashedBoards` pagination). `notifications.test.ts` / `notifications.test.tsx` (invalidation keys, `useMarkAllNotificationsRead` cache). Mutation hooks: `tasks.test.tsx` (create task optimistic replace + rollback), `lists.test.tsx` / `board.test.tsx` (rollback), `releases.test.tsx` (invalidate on success). `useBoardChangeStream.test.tsx` (shell `board-index-changed` → board index invalidation). Client `*.test.tsx` files use `/** @vitest-environment jsdom */` for RTL.

### Phase 3 — Establish DOM test infrastructure

Goal: make component and hook tests easy to write and consistent.

Create shared test utilities for:

- `renderWithProviders(...)`
- `QueryClientProvider` with isolated client per test
- router wrapper for route-aware components
- optional store reset helpers for Zustand-backed preferences/UI stores
- consistent fake data builders for `Board`, `Task`, `List`, and notifications

First files to use the harness:

- `src/client/components/routing/BoardPage.tsx`
- `src/client/components/task/useTaskEditorForm.ts`
- `src/client/components/board/shortcuts/useBoardShortcutKeydown.ts`

What to validate:

- route param behavior
- localStorage writes where intentionally user-visible
- query + mutation hooks inside providers
- keyboard handler enable/disable rules

Exit criteria:

- The repo has a reusable client test harness.
- New client DOM tests do not have to reinvent providers or mock setup.

**Implemented:** `src/client/test/` — `renderWithProviders`, `renderHookWithProviders`, `createTestQueryClient` (`QueryClient` with retries off); optional `MemoryRouter` + `Routes`/`Route` via `initialEntries` + `routePath`; optional `ShortcutScopeProvider` via `withShortcutScope`. Fixtures: `buildTestBoard`, `buildTestTask`, `buildTestList`, `buildTaskEditorBoardData`, `buildBoardShortcutBoard`, `buildNotificationsPage`, `createMockBoardShortcutActions`. `resetNotificationUiStore()` for Zustand notification UI. First harness consumers: `BoardPage.test.tsx` (route + `localStorage`), `useTaskEditorForm.test.tsx` (defaults, detail fetch, dirty state), `useBoardShortcutKeydown.test.tsx` (dispatch / no-op rules). Re-export barrel: `src/client/test/index.ts`.

### Phase 4 — Add focused DOM coverage for board interactions

Goal: test the most important non-browser interactions without trying to render every full-board detail.

Priority targets:

- `src/client/components/board/shortcuts/useBoardShortcutKeydown.ts`
- `src/client/components/board/shortcuts/boardShortcutRegistry.ts`
- `src/client/components/board/shortcuts/BoardKeyboardNavContext.tsx`
- `src/client/components/board/shortcuts/useBoardHighlightState.ts`
- `src/client/components/task/useTaskEditorForm.ts`
- `src/client/components/task/TaskEditor.tsx`
- `src/client/components/board/dialogs/BoardSearchDialog.tsx`
- `src/client/components/board/dialogs/BoardEditDialog.tsx`
- `src/client/components/layout/NotificationToasts.tsx`

What to cover:

- keyboard shortcuts do not fire inside editable targets
- shortcut dispatch to the correct action
- highlight/focus state transitions
- create vs edit task form behavior
- dirty-form handling and close/save flows
- dialog open/close and basic validation
- notification rendering and dismiss behavior if stable enough

What not to over-test:

- exact Tailwind classes
- Radix internals
- full DnD pointer choreography in unit tests

Exit criteria:

- The client has representative DOM tests for board shortcuts, task editing, and dialogs.
- The test suite covers behaviors users actually trigger from keyboard and dialogs.

**Implemented:** `boardShortcutRegistry.test.ts` (match keys, `enabled` for cycle-group, ordering). Extended `useBoardShortcutKeydown.test.tsx` (F3, modifier keys, empty `taskGroups`). `useBoardHighlightState.test.tsx` (`applyNotificationTarget`, `moveHighlight`). `BoardKeyboardNavContext.test.tsx` (hook throws without provider). `BoardSearchDialog.test.tsx` (empty state, debounced FTS hit list, Escape). `BoardEditDialog.test.tsx` (Save disabled when name cleared; emoji picker mocked). `NotificationToasts.test.tsx` (system dismiss + notification message). `TaskEditor.tsx` remains covered via `useTaskEditorForm.test.tsx` (full `TaskEditor` shell is heavy to mock; add targeted `TaskEditor` tests later if needed). Assertions use native element properties where `@testing-library/jest-dom` is not installed (`value`, `disabled`).

### Phase 5 — Add route-level and page-level smoke DOM tests

Goal: validate page composition and major route outcomes without reaching for Playwright yet.

Priority targets:

- `src/client/components/routing/BoardPage.tsx`
- `src/client/components/routing/HomeRedirect.tsx`
- `src/client/components/board/BoardView.tsx`

What to cover:

- no-board-selected empty state
- loading and error states
- board-not-found redirect behavior
- stacked vs lanes branching
- shortcut-help auto-open behavior if it remains stable

Important note:

- `BoardView.tsx` is an orchestrator and should be tested only for a few key states.
- Avoid writing a giant “full board does everything” DOM suite.

Exit criteria:

- Route-level regressions are caught before browser E2E.
- `BoardView` has a few targeted smoke tests, not a sprawling brittle test file.

**Implemented:** `HomeRedirect.test.tsx` (loading, error, empty → `BoardView` with no board, redirect to last or first board). `BoardPage.test.tsx` asserts `BoardView` receives route `boardId`. `BoardView.test.tsx` mocks `useBoard` + column shells for smoke: empty, loading, generic error, 404 → `/trash`, stacked vs lanes, shortcut-help dialog on first load. Shared `src/client/test/vitest-setup.ts` (ResizeObserver, `matchMedia`, `scrollTo`, RTL `cleanup`); `vitest.config.ts` uses `environment: "jsdom"` for client tests.

### Phase 6 — Introduce Playwright infrastructure

Goal: add a minimal browser suite only after lower layers exist.

Recommended setup:

- `playwright.config.ts`
- dedicated `npm run test:e2e`
- launch against a controlled local app URL
- use disposable data where possible

Playwright scope should begin with only **3-5 scenarios**.

Required browser-test qualities:

- deterministic setup
- useful traces/screenshots on failure
- no dependence on a developer’s hand-made local state

Exit criteria:

- Playwright can run locally and in CI.
- Failures produce enough evidence to debug quickly.

**Implemented:** `playwright.config.ts` (`testDir` `e2e/`, Chromium, `webServer: npm run dev`, `reuseExistingServer: false`, trace on first retry, screenshot + video on failure). Disposable data: fresh temp dir for `TASKMANAGER_DATA_DIR` / `TASKMANAGER_AUTH_DIR` each run unless you set both env vars (overridable). Scripts: `npm run test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `playwright:install`. `e2e/app-smoke.spec.ts` (3 smoke tests: title, auth vs sidebar shell, API health). CI: Playwright runs in `.github/workflows/ci.yml` after the fast job (see Phase 8); report artifact on failure. First run locally: `npx playwright install` (or `npm run playwright:install`). **Local:** stop any other dev server so ports **5173** and **3002** are free before E2E.

### Phase 7 — Add minimal critical Playwright journeys

Goal: cover only the user journeys that lower layers cannot fully de-risk.

Recommended first scenarios:

1. **Board load**
   Open a board and verify columns/tasks render.
2. **Create task**
   Open the task editor, create a task, and verify it appears.
3. **Edit task**
   Update a task title/body or metadata and verify persistence in the UI.
4. **Move or reorder task**
   One DnD smoke path only, just enough to prove the integration works.
5. **Board search or notifications**
   Add only if this area continues to change or break.

What Playwright should own:

- true browser keyboard behavior
- DnD smoke
- page-to-page routing
- regression checks that require real DOM layout/event behavior

What Playwright should not own:

- every filter summary label permutation
- all mutation error strings
- deep component branching already covered in lower layers

Exit criteria:

- Critical board flows are covered by a very small, stable suite.
- E2E runtime stays bounded and maintainable.

**Implemented:** `e2e/helpers/e2eSession.ts` (UI setup/login with fixed passphrase, API helpers for board/list/task, dismiss shortcut help). `e2e/board-journeys.spec.ts`: board load (column + aria-label), quick-add create task (`T` + composer), TaskEditor edit + save, DnD smoke (order change via `apiLoadBoard` poll). Playwright uses a **fresh OS temp** `TASKMANAGER_DATA_DIR` / `TASKMANAGER_AUTH_DIR` per run (`playwright.config.ts`); `webServer.reuseExistingServer` is **false** so the spawned `npm run dev` uses that DB—**stop any other `npm run dev`** before `npm run test:e2e` locally (ports **5173** and **3002** must be free). `workers: 1` for stable SQLite. Phase 5 board search / notifications E2E skipped per plan unless needed later.

### Phase 8 — CI rollout and coverage discipline

Goal: make the plan sustainable.

Recommended CI order:

1. typecheck
2. Bun tests
3. client DOM tests
4. Playwright in a separate job or gated path

Guidelines:

- Run Playwright separately from fast test jobs.
- Keep browser coverage intentionally small.
- Any flaky test should be fixed or quarantined quickly.

Exit criteria:

- Fast tests stay fast.
- Browser tests remain a confidence layer, not a drag on delivery.

**Implemented:** `.github/workflows/ci.yml` — single workflow on `push` to `main`/`master` and on `pull_request`. Job **`fast`** runs `typecheck` → `npm run test` (Bun) → `npm run test:client` (Vitest) → `npm run build`. Job **`e2e`** (`needs: fast`) runs Playwright only after fast checks pass; uploads `playwright-report` artifact on failure. Replaces the standalone `e2e.yml` to avoid duplicate browser runs. **`npm run test`** ignores `**/e2e/**` as well as `**/src/client/**` so Playwright specs are never collected by Bun. **`npm run release:check`** (tags / local) remains the publish gate: typecheck, Bun, Vitest, build, pack — **does not** run E2E (add a manual or pre-release gate if you want E2E before publish).

### Phase 9 — Deepen unit and hook coverage (under-tested board modules)

Goal: cover **board mechanics and navigation** that Phases 1–4 did not prioritize, without rendering the full board.

Priority targets:

- **`boardSurfaceWheel.ts`**, **`boardColumnData.ts`:** extract or test pure branches (scroll/wheel math, column derivations) with **Bun** or **Vitest** where the code is isolatable.
- **`useBoardColumnMap.ts`**, **`useTaskRevealRegistry.ts`:** **Vitest + `renderHook`** with `renderHookWithProviders` / minimal board fixtures.
- **DnD beyond ids:** mutation side effects, cache updates after reorder/move (where not already covered by mutation hook tests).

Exit criteria:

- High-churn board helpers have regression tests at the lowest practical layer.
- New behavior in these modules ships with at least one targeted test.

### Phase 10 — DOM coverage for heavy components and app shell

Goal: test **large or frequently edited UI** where hook-only tests are insufficient.

Priority targets:

- **`TaskEditor.tsx`:** targeted RTL tests (open/close, disabled states, key sections) beyond `useTaskEditorForm` — only where stable and user-visible.
- **Notifications / sidebar / layout:** smoke tests for routes or components that change often (e.g. toast list, nav entries) using existing harness + fixtures.
- **Optional:** add **`@testing-library/jest-dom`** for clearer matchers (`toBeDisabled`, `toHaveAccessibleName`) if raw property asserts become noisy.

Exit criteria:

- Critical editor and shell regressions are catchable without Playwright for simple cases.
- No “full app render” tests; keep files small and scenario-focused.

**Implemented:** `@testing-library/jest-dom` + `import "@testing-library/jest-dom/vitest"` in `src/client/test/vitest-setup.ts`. **`TaskEditor.test.tsx`**: closed vs open, create-mode dialog/actions, edit-mode heading / body after detail load / Move to Trash, Cancel → `onClose` — with mocks for emoji, markdown field, gamification, and `useBlocker` (MemoryRouter). **`AppHeader.test.tsx`** / **`AppShell.test.tsx`**: title, sidebar toggle, skip link + main landmark (with `QueryClientProvider`; `AppShell` mocks `useBoardChangeStream`). **`Sidebar.test.tsx`**: board row label + loading copy via `useBoards` spy. **`NotificationToasts`** remains covered by existing `NotificationToasts.test.tsx` (Phase 4).

### Phase 11 — Selective E2E expansion and optional release gates

Goal: add **one journey at a time** when lower layers cannot de-risk it, and optionally tighten release confidence.

Candidate journeys (pick order by churn / incidents):

1. **Board search (FTS)** — open search, run query, assert a hit (mirrors `BoardSearchDialog` DOM tests at browser fidelity).
2. **Notifications** — mark read or open panel smoke if that flow breaks in production.
3. **Cross-route** — e.g. trash restore → board appears (only if not covered by DOM + API tests).

Optional CI / release hardening:

- **Path filters:** run E2E only when `e2e/`, `src/client/`, or Playwright config changes (reduces noise; use with care so “unrelated” breaks still surface on `main`).
- **E2E on tag or nightly:** run Playwright before publish without slowing every PR.

Exit criteria:

- E2E count stays **small**; each new spec has a written reason (link to bug or risk).
- Runtime and flake budget stay acceptable; quarantine or fix flakiness quickly (see Phase 12).

**Implemented:** `e2e/board-search.spec.ts` — one journey: disposable board + task with a unique token in the title → open header “Search tasks on this board” → type query → assert hit row appears (FTS + debounced client path). Comment in file documents rationale (Phase 11). **Optional** path-filtered CI / E2E-on-tag **not** enabled (per plan: avoid hiding `main` breaks); revisit if PR noise dominates.

### Phase 12 — Coverage maturity and sustainability

Goal: make breadth **measurable and maintainable**, not just “more files.”

Practices:

- **Flake policy:** no permanent `test.skip` without a ticket; prefer `test.fixme` with owner; cap retries in CI.
- **Optional coverage reporting:** `vitest run --coverage` (with thresholds on critical paths only) or periodic manual review — avoid gaming numbers.
- **Backlog hygiene:** revisit **§6** quarterly; align new work with Phases **9–12**.
- **Feature rule:** new client features include at least one test at the **lowest practical layer** (unchanged from §9).

Exit criteria:

- Team agrees what “enough” coverage means for the board (e.g. critical paths + top incident areas).
- CI remains fast; E2E stays a confidence layer, not the primary feedback loop.

---

## 6. Concrete coverage backlog by area

Rolling list of **module-level** opportunities. For **ordered** execution, use **Phases 9–12** above (Phase **11** FTS E2E is implemented; remaining optional ideas are notifications E2E, trash restore, etc.); this section groups ideas by feature area.

### Board logic

Highest-value early coverage:

- `boardStatusUtils.ts`
- `boardFilterSummaries.ts`
- `boardTheme.ts`
- `boardSurfaceWheel.ts`
- `boardColumnData.ts`

Best layers:

- Pure logic: Bun
- wheel behavior helpers: Bun if exported as pure DOM-adjacent functions
- route/render state: Vitest + RTL
- full wheel + layout behavior: Playwright only if needed

### Shortcuts and keyboard navigation

Highest-value early coverage:

- `boardShortcutRegistry.ts`
- `useBoardShortcutKeydown.ts`
- `BoardKeyboardNavContext.tsx`
- `useBoardColumnMap.ts`
- `useBoardHighlightState.ts`
- `useTaskRevealRegistry.ts`

Best layers:

- registry matching rules: Bun
- keyboard dispatch and editable-target suppression: Vitest + RTL
- true browser key interactions across focus boundaries: Playwright smoke only

### Task editing

Highest-value early coverage:

- `useTaskEditorForm.ts`
- `TaskEditor.tsx`
- task create/update mutations

Best layers:

- form logic and release/group defaults: Vitest + RTL
- optimistic update/rollback: hook/query tests
- full create/edit journey: one Playwright path

### DnD

Highest-value early coverage:

- `dndIds.ts`
- existing `boardTaskDndDeps` tests
- DnD mutation side effects

Best layers:

- id helpers and dependency hashing: Bun
- most pointer/drag choreography: Playwright

### Routes and app shell

Highest-value early coverage:

- `BoardPage.tsx`
- `HomeRedirect.tsx`
- notifications and sidebar behavior if frequently changed

Best layers:

- route composition: Vitest + RTL
- real app navigation: Playwright

---

## 7. Historical: first milestones (completed)

The following sequence was the **initial** rollout; it is **done** (see Phases 1–7). Use **Phases 9–12** for what to build next.

1. `boardStatusUtils.test.ts`
2. `boardFilterSummaries.test.ts`
3. `dndIds.test.ts`
4. `boardPath.test.ts`
5. `mutationErrorUi.test.ts`
6. `notificationTime.test.ts`
7. `queries.test.ts`
8. `notifications.test.ts`
9. `useTaskEditorForm.test.tsx`
10. `useBoardShortcutKeydown.test.tsx`
11. `BoardPage.test.tsx`
12. First Playwright specs: app smoke + board journeys (Phase 6–7)

---

## 8. Definition of done per layer

### Pure tests

- fast
- deterministic
- colocated with the module
- cover edge cases, not just happy paths

### DOM tests

- use shared provider helpers
- assert behavior the user can observe
- avoid asserting framework internals
- remain stable across harmless refactors

### Playwright tests

- cover only critical journeys
- produce actionable failure output
- avoid overlapping too heavily with DOM tests

---

## 9. Maintenance rules

Update this plan when:

- CI layout changes (`ci.yml`, jobs, or release gates)
- Vitest / Playwright / Bun test boundaries change (`package.json` scripts, ignore patterns)
- major board architecture changes shift the best test seams
- you complete or reprioritize **Phases 9–12**

When adding new client behavior:

- add at least one test at the lowest practical layer
- prefer pure or DOM tests before adding new Playwright cases
- only expand browser coverage when the journey is release-critical or hard to de-risk elsewhere

---

## 10. Next execution slice (Phase 12)

Suggested order for **more complete** coverage without abandoning the pyramid:

1. **Phase 12** — Flake policy, optional coverage thresholds, backlog review cadence.

Optional later E2E (not required for Phase 11 exit): notifications panel smoke, trash restore → board (only if incidents justify).

(Phases **9–11** are implemented; see §5.)

Tighten or skip phases based on incident data and refactor churn—not on blanket percentage targets.
