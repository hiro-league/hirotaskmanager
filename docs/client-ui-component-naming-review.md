# Client UI component naming — review

Review of naming conventions under `src/client/components/`. Captures current patterns, strengths, inconsistencies, and optional follow-up cleanups. No backward-compatibility constraints apply to file renames during initial development (see project rules); treat renames as normal refactors.

## Verdict

- **Consistency:** Strong overall (~85%). Core rules are applied predictably.
- **Clarity:** Good for most folders; two areas need extra mental mapping (`lanes/` vocabulary, `shortcuts/` scope).
- **Solidity:** Feature prefixes, suffix roles (`Dialog`, `Toggle`, `Context`), and hook/module split scale well.

## Implicit conventions (observed)

| Artifact | Casing | Extension | Examples |
|----------|--------|-----------|----------|
| React components | `PascalCase` | `.tsx` | `BoardView.tsx`, `TaskCard.tsx` |
| Hooks | `camelCase`, `use…` | `.ts` | `useBoardCanvasPanScroll.ts` |
| Non-React modules (utils, types, registries) | `camelCase` | `.ts` | `boardTheme.ts`, `boardShortcutRegistry.ts` |
| JSX helper modules (not a single component) | `camelCase` | `.tsx` | `taskMarkdownPreviewComponents.tsx` |
| Design-system / shadcn-style primitives | `kebab-case` | `.tsx` | `ui/button.tsx`, `ui/input-group.tsx` |

**Foldering:** Feature areas (`board/`, `task/`, `layout/`, …) with board split by concern: `header/`, `columns/`, `lanes/`, `dialogs/`, `dnd/`, `shortcuts/`.

**Prefixes:** Board-scoped symbols often use `Board…`; task-scoped `Task…`; layout `Sidebar…`, `App…` — aids discoverability.

## What works well

1. **Feature prefixes** make symbols self-locating in imports and search.
2. **Hooks** consistently use `use…` + camelCase + `.ts`.
3. **Suffix vocabulary** is meaningful: `…Dialog`, `…Toggle`, `…Switcher`, `…Context`, `…Confirm`, `…Bridge`.
4. **`ui/`** uses lowercase filenames, clearly separating app components from primitives.

## Inconsistencies and pain points

1. **`multi-select.tsx`** — Only top-level file under `components/`, and only app component using kebab-case. Matches `ui/` style; consider moving to `src/client/components/ui/multi-select.tsx` or renaming to `MultiSelect.tsx` in a feature folder.

2. **`board/dnd/`** — Mixed prefixes (`dndIds.ts` vs `boardDragOverlayShell.ts`). Hooks named `…React` (e.g. `useBoardTaskDndReact`) may leak implementation detail; evaluate whether the suffix is still useful.

3. **`board/lanes/`** — Overlapping terms: *lane*, *band*, *stacked* (`BandComposer`, `ListStatusBand`, `StackedTaskList`, `laneStatusTheme`). Pick one primary vocabulary for the folder or document how the three relate.

4. **`board/shortcuts/`** — Contains generic modal/dialog plumbing (`ConfirmDialog`, `bodyScrollLock`, `useModalFocusTrap`, …) alongside shortcut-specific code. Consider splitting into e.g. `board/modal/` or folding shared pieces into `board/dialogs/`.

5. **Confirm naming** — `ConfirmDialog` vs `BoardListDeleteConfirm` / `BoardTaskDeleteConfirm` (inconsistent `Confirm` vs `ConfirmDialog`).

6. **Type/model files** — `boardShortcutTypes.ts` vs `shortcutScopeTypes.ts` vs `dndReactModel.ts`; consider normalizing on e.g. `…Types.ts` where appropriate.

7. **`layout/boardCollapsedLabel.ts`** — Board-prefixed util inside `layout/`; if board-specific, consider `board/`; if layout-only, drop `board` from the name.

8. **Contexts** — `ShortcutScopeContext` lacks `Board` prefix while other board contexts use `Board…`; align either all board-scoped contexts with `Board` or treat shortcut scope as global and drop `Board` elsewhere for parity.

9. **Switcher vs Menu** — `ReleaseSwitcher` / `TaskGroupSwitcher` vs `BoardColorMenu` for similar selection UX; consider one suffix pattern.

## Optional cleanups (priority sketch)

1. Relocate or rename `multi-select.tsx` per §1.
2. Split or reorganize `shortcuts/` vs modal helpers per §4.
3. Align `lanes/` naming or add a short module-level comment at folder entry.
4. Normalize `dnd/` file prefixes and `…React` hook suffixes if still valuable.
5. Normalize type file suffixes and confirm-dialog naming per §5–6.

## References

- Related high-level guidance: `docs/arch_design_guidelines.md` (project layout and client structure).
