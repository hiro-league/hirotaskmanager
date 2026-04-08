# Board releases — implementation plan

Execution-oriented checklists. Product rules live in [releases requirements](./releases-requirements.md); architecture in [releases design](./releases-design.md).

**Related documents**

- [Releases requirements](./releases-requirements.md)
- [Releases design](./releases-design.md)

## Suggested order

1. Phase 1 — Schema, migrations, server storage, core API
2. Phase 2 — Shared types, board load, task create/update, auto-assign
3. Phase 3 — Web UI: editor, task surfaces, board filters, shortcut `e`
4. Phase 4 — CLI (`releases` + task flags + filters)
5. Phase 5 — Sync (if applicable), polish, tests

---

## Phase 1: Database and server core

**Goal:** Persist releases and `task.release_id`; CRUD releases; validate board uniqueness and FKs.

### Checklist

- [x] Add migration: `board_release` (or agreed name) + nullable `task.release_id` + indexes + unique `(board_id, name)`.
- [x] Server storage layer: list/create/update/delete release; delete with **reassign** or **clear** tasks (match task group patterns).
- [x] Board read includes `releases[]` and default/auto-assign fields; board patch updates those fields with validation (toggles off when no default).
- [x] Unit tests: uniqueness, delete flows, orphan prevention.

### Exit criteria

- API can manage releases and persist task `release_id` without the React app.

---

## Phase 2: Task mutations and auto-assign

**Goal:** Task create/update accept `releaseId`; server applies default per **UI vs CLI** flags and **explicit null** rules.

### Checklist

- [x] Define **omit vs null** contract for create payload; document in types + route handler.
- [x] On create, set `createdByPrincipal` as today; gate auto-assign with `autoAssignReleaseOnCreateUi` / `Cli` + `defaultReleaseId`.
- [x] Extend shared `Task` / `Board` types and any serializers.
- [x] Tests: auto-assign on/off; explicit untagged; wrong-board release id rejected.

### Exit criteria

- Creating tasks via API matches requirements without relying on client-side default injection only.

---

## Phase 3: Web client

**Goal:** Full UX: release editor, display on cards/editor, board filter (OR + Untagged), preferences/URL if used elsewhere, **`e`** shortcut.

### Checklist

- [ ] Release management UI (board settings or dedicated surface—align with task group editor patterns).
- [ ] Task editor + card: show release; change release; respect theme/colors.
- [ ] Extend `boardFilters` + `taskMatchesBoardFilter` (+ URL/query prefs if board filters sync to URL).
- [ ] `BoardHeaderMultiSelect` (or equivalent): release multi-select with **Untagged** option.
- [ ] Register **`e`** in `boardShortcutRegistry`; no-op when no default; **overwrite** when default exists.
- [ ] Board stats (if required): include release in filter predicate per [board stats requirements](./completed-plans/board-stats-requirements.md) “new filter” rule.

### Exit criteria

- Board matches requirements for filters, keyboard, and settings; empty filter = all.

---

## Phase 4: CLI

**Goal:** Parity with web for management and task assignment; policy aligned with task groups.

### Checklist

- [ ] `hirotm releases list`, `show`, add/update/delete (names mirror task group CLI UX).
- [ ] `hirotm tasks add|update`: `--release <name>`, optional `--release-id`, `--release none` (or agreed spelling).
- [ ] Task list / board-oriented commands: filter by release + untagged where applicable; **do not** add release to `search` yet.
- [ ] Extend `BoardCliPolicy` (or equivalent) for release management permissions.
- [ ] Document in `AGENTS.md` / CLI help.

### Exit criteria

- Agents can manage releases and tasks end-to-end via `hirotm` only; auto-assign CLI toggle behaves like requirements.

---

## Phase 5: Sync and hardening

**Goal:** Multi-writer sync (if in scope), regression coverage, performance.

### Checklist

- [x] Sync payloads and conflict rules for `releaseId` and release rows (`release-upserted` SSE + `board-changed` on release delete; design doc updated).
- [x] Regression tests: shared release filter predicates + SSE merge helper (keyboard/CLI covered by existing app + storage tests; no separate E2E harness).
- [x] Large boards: document that embedded `releases[]` is acceptable for v1; lazy-load deferred.

### Exit criteria

- No known drift between web, CLI, and server on release assignment.

---

## Deferred (post-v1)

- FTS / search indexing for release names.
- Manual sort order for releases.
- Additional analytics dimensions.
