# Web Interface Guidelines Review — Round 2 (`src/client/**`)

Skill: [`web-design-guidelines`](../../.agents/skills/web-design-guidelines/SKILL.md)  
Guidelines source: <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>  
Date: 2026-04-17  
Scope: Web client only (`src/client/**` + `index.html` + `src/client/index.css`).

> Abiding to the workspace `no-backward-compatibility` rule — all
> suggestions below can land as direct edits.

---

## TL;DR

Round 1 (2026-04-16) called out auth inputs, ellipsis copy, `color-scheme`,
reduced motion, touch/overscroll hygiene, skip links, `Intl` dates, and
several typography tokens. **Most of that is now implemented**: auth uses
shared `Input`/`Button` with `autoComplete`, `index.html` carries
`color-scheme` + `theme-color`, `#root` applies safe-area padding,
`index.css` sets global `prefers-reduced-motion`, `touch-action:
manipulation` on primary controls, cached `Intl.DateTimeFormat` helpers
in `lib/intlDateFormat.ts`, `tabular-nums` / `text-balance` on key
surfaces, a skip link in `AppShell.tsx`, and dialog/popover surfaces use
`overscroll-contain`. User-visible `...` triple-dot strings in TSX were
not found in a quick sweep.

**What still stands out** against the fetched guidelines:

1. **`transition-all` remains** on `Button`, `Badge`, and `multi-select`
   — the guidelines still ask to list transitioned properties explicitly.
2. **Toast stack** (`NotificationToasts.tsx`) has no `aria-live` region
   for screen readers when new notifications arrive.
3. **No navigation guard** for unsaved task edits (`beforeunload` / router
   blocking) — still absent.
4. **`Intl.NumberFormat`** is not used for numeric UI (counts may rely on
   other mechanisms).
5. **Brand / shortcut copy**: no `translate="no"` on the app title;
   optional nbsp joins (`⌘ K`, unit suffixes) are still sparse.
6. **`-webkit-tap-highlight-color`** is not set intentionally (guideline
   calls it out; lower priority now that `touch-action` is global).
7. **`autoFocus`** is still unconditional on auth and several sidebar /
   list rename flows — guidelines prefer gating on desktop / primary
   field only.

Nothing here regresses the strong baseline (icons, semantic structure,
virtualized lists, Radix primitives). Round 2 is mostly **polish and
strict guideline compliance**, not broken fundamentals.

---

## Delta from 2026-04-16 review (resolved or materially improved)

| Round 1 theme | Current status |
|---------------|----------------|
| Hand-rolled auth inputs / bare buttons | `AuthScreen.tsx` uses `Input` + `Button`; `autoComplete` / `name` / recovery `spellCheck` addressed. |
| `"Refreshing..."` / command / multi-select placeholders | `NotificationBell` uses `Refreshing…`; `command.tsx` default description uses `…`; multi-select placeholder `Search options…`. |
| `color-scheme` + scrollbar / native controls | `index.html` meta + `:root` / `.dark` in `index.css`; scrollbar colors themed. |
| `prefers-reduced-motion` | Global `@media (prefers-reduced-motion: reduce)` in `index.css`. |
| `transition-all` sweep | **Open** — still present in `button.tsx`, `badge.tsx`, `multi-select.tsx`. |
| `Intl.DateTimeFormat` | `intlDateFormat.ts` + call sites (`TaskEditor`, filters, trash, etc.). |
| `tabular-nums` / `text-balance` | Present on stats, filters, auth/board headings, etc. |
| `autoComplete` / `spellCheck` on identifier fields | Broadly added (list/sidebar/composer/dialogs/task title); spot-check any new inputs. |
| Touch / overscroll / safe areas | `#root` safe-area padding; `touch-action` on `button, a, [role="button"]`; `overscroll-contain` on dialog/popover/multi-select panel. |
| `autoFocus` desktop-only | **Open** — still unconditional in several files (see recommendations). |
| Skip link | `AppShell.tsx` skip link + `#main-content` with `scroll-mt-*` + focus ring. |
| `theme-color` meta | Present with light/dark media in `index.html`. |
| `multi-select` `<div role="button">` | **Resolved** — no `role="button"` on non-button elements found in current `multi-select.tsx`. |
| `aria-live` on toasts | **Open** — `NotificationToasts` container still lacks `aria-live`. |

---

## Recommendations, sorted by impact

| # | Priority | Finding | Location(s) | Fix |
|---|----------|---------|-------------|-----|
| 1 | **HIGH** | `transition-all` — guidelines require listing properties (`background-color`, `color`, `border-color`, `box-shadow`, `transform`, etc.), not `all`. | `components/ui/button.tsx:8`, `components/ui/badge.tsx:8`, `components/multi-select.tsx:50` | Replace with explicit transitions (match `AppHeader` / `Sidebar` patterns using `transition-[…]`). |
| 2 | **MEDIUM** | Notification toasts are visual-only for assistive tech — no live region announces new toast content. | `components/layout/NotificationToasts.tsx:116-131` | Wrap the stack in a container with `aria-live="polite"` (and ensure assertive only for errors if you split streams). |
| 3 | **MEDIUM** | Unsaved task edits can be lost on full navigation — no `beforeunload` or router blocker. | `components/task/TaskEditor.tsx` (dirty state from `useTaskEditorForm` / store) | On `dirty`, register `beforeunload` + React Router `useBlocker` (v6.4+) or equivalent. |
| 4 | **MEDIUM** | Numeric counts and static numbers do not use `Intl.NumberFormat` — guideline prefers `Intl` for locale-aware grouping/separators. | Any raw `${count}` in chips, tables, filters | Use a small cached `Intl.NumberFormat(undefined)` helper (parallel to `intlDateFormat.ts`). |
| 5 | **LOW** | App title string can be mangled by browser translate. | `components/layout/AppHeader.tsx:55-57` | Add `translate="no"` (or wrap brand in a span with it). |
| 6 | **LOW** | `-webkit-tap-highlight-color` not set — guideline asks for intentional tap highlight (often transparent or theme-colored). | `src/client/index.css` `@layer base` | e.g. `html { -webkit-tap-highlight-color: color-mix(in oklab, var(--ring) 35%, transparent); }` or `transparent` if you prefer none. |
| 7 | **LOW** | `autoFocus` still unconditional on auth and sidebar/list flows — can confuse mobile + screen reader order. | `AuthScreen.tsx:112,201,256`, `Sidebar.tsx:200,300`, `ListHeader.tsx:242`, `SidebarBoardItem.tsx:44`, `TaskGroupEditorSortableRow.tsx:126` | Gate with `useMedia("(pointer: fine)")` / `(min-width: …)` or remove on small viewports; keep `TaskEditor` gated pattern as reference. |
| 8 | **LOW** | Optional: `<link rel="preload" as="font">` for primary woff2 — still no preload in `index.html` (FOUT tradeoff unchanged). | `index.html` | Preload only weights used above the fold; verify built asset URLs. |
| 9 | **LOW** | Non-breaking spaces in shortcuts and units (`⌘ K`, `10 MB`) — still mostly absent except isolated spots (e.g. `TaskCard.tsx` uses `\u00A0` in places). | Shortcut labels, header chrome | Join with `\u00A0` or `{"\u00A0"}` where the guideline’s typography rules apply. |
| 10 | **LOW** | Some `DropdownMenu.Item` rows use `outline-none` + `hover:bg-*` only — Radix highlights via `data-[highlighted]`; keyboard highlight may be weaker than hover if not mirrored. | `components/board/header/BoardHeader.tsx:310-327` (compare to items using `focus:bg-*` elsewhere) | Add `data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground` (or shared class in a primitive). |

---

## What's already good (carry forward; do not regress)

- Skip link + focusable `main` with scroll margin (`AppShell.tsx`).
- Theming: `color-scheme`, themed scrollbars, `theme-color` meta, dark
  class on `html`.
- Touch / layout: safe-area padding on `#root`, `touch-action:
  manipulation` on interactive controls, overscroll containment on modal
  surfaces.
- Auth: shared primitives, `autoComplete`, labeled forms, recovery key
  `spellCheck={false}`.
- Dates: cached `Intl.DateTimeFormat` via `intlDateFormat.ts` on main
  paths.
- Virtualized task lists, consistent `aria-hidden` on icons, icon-only
  controls with labels, destructive flows behind confirmations.
- `prefers-reduced-motion` honored globally in CSS.

---

## Compliance matrix

The guidelines define 14 sections. Each row uses the guideline’s own
phrasing. "Pass" = no violation found; "Partial" = mostly followed with
clear counter-examples; "Fail" = rule not met; "N/A" = not applicable.

### Accessibility

| Rule | Status | Notes |
|------|--------|-------|
| Icon-only buttons have `aria-label` | **Pass** | Sampled header, board, sidebar — labels present. |
| Form controls have `<label>` or `aria-label` | **Partial** | Auth/dialogs strong; inline renames rely on visual context in a few places. |
| Interactive elements have keyboard handlers | **Pass** | Radix + native buttons; `multi-select` uses combobox/listbox pattern. |
| `<button>` for actions, `<a>` for navigation | **Pass** | Router `<Link>` for routes; no stray `role="button"` divs found in multi-select. |
| Images have `alt` | **Pass** | Logos decorative `alt=""` with dimensions. |
| Decorative icons `aria-hidden="true"` | **Pass** | Consistent. |
| Async updates have `aria-live="polite"` | **Partial** | Multi-select, board color menu, task title counter — toasts still lack a live region. |
| Semantic HTML before ARIA | **Pass** | |
| Headings hierarchical; skip link | **Pass** | Skip link + single logical `h1` patterns preserved. |
| `scroll-margin-top` on heading anchors | **Partial** | `main` has `scroll-mt-*` for skip target; few in-content anchors. |

### Focus States

| Rule | Status | Notes |
|------|--------|-------|
| Visible focus ring on interactive elements | **Partial** | Primitives strong; verify Radix menu `data-[highlighted]` parity on custom-styled items. |
| Never `outline-none` without replacement | **Partial** | Most patterns use `focus-visible:ring-*`; dropdown rows called out above. |
| `:focus-visible` over `:focus` | **Pass** | Dominant pattern on custom chrome. |
| `:focus-within` for compound controls | **Pass** | `input-group` pattern. |

### Forms

| Rule | Status | Notes |
|------|--------|-------|
| `autoComplete` + meaningful `name` | **Partial** | Auth complete; continue auditing new fields. |
| Correct `type` / `inputmode` | **Partial** | No broad `inputmode` usage. |
| Don't block paste | **Pass** | |
| Labels clickable | **Pass** | Auth wraps labels correctly. |
| Disable spellcheck on codes / usernames | **Partial** | Many identifier fields set `spellCheck={false}`; keep for new inputs. |
| Checkbox/radio single hit target | **N/A** | |
| Submit stays enabled until request starts | **Pass** | |
| Errors inline next to fields | **Pass** | |
| Placeholders end with `…` | **Pass** | No `...` string literals found in TSX sweep. |
| `autoComplete="off"` on non-auth fields | **Partial** | Applied in several dialogs; not universal. |
| Warn before navigation with unsaved changes | **Fail** | No `beforeunload` / router guard. |

### Animation

| Rule | Status | Notes |
|------|--------|-------|
| Honor `prefers-reduced-motion` | **Pass** | Global CSS + celebration module. |
| Animate `transform`/`opacity` only | **Partial** | Dialog animations appropriate; some color transitions remain by design. |
| Never `transition: all` | **Fail** | `Button`, `Badge`, `multi-select` still use `transition-all`. |
| Correct `transform-origin` | **N/A** | Radix handles most surfaces. |
| SVG animation on `<g>` | **N/A** | |
| Animations interruptible | **Pass** | |

### Typography

| Rule | Status | Notes |
|------|--------|-------|
| `…` not `...` | **Pass** | TSX string sweep clean. |
| Curly quotes | **Pass** | |
| Non-breaking spaces (`10 MB`, `⌘ K`) | **Fail** | Rare / ad hoc. |
| Loading states end with `…` | **Pass** | e.g. `Refreshing…`. |
| `tabular-nums` for number columns | **Pass** | Stats, filters, counters. |
| `text-wrap: balance` / `text-pretty` on headings | **Pass** | Auth + board empty states. |

### Content Handling

| Rule | Status | Notes |
|------|--------|-------|
| Long content handled | **Pass** | |
| Flex children have `min-w-0` | **Pass** | |
| Handle empty states | **Pass** | |
| Anticipate short/avg/very long input | **Pass** | Task title limits + counters. |

### Images

| Rule | Status | Notes |
|------|--------|-------|
| Explicit `width`/`height` | **Pass** | |
| Below-fold `loading="lazy"` | **N/A** | |
| Above-fold `fetchpriority` | **Partial** | Optional preload / priority still available. |

### Performance

| Rule | Status | Notes |
|------|--------|-------|
| Virtualize lists > 50 items | **Pass** | |
| No layout reads in render | **Pass** | |
| Batch DOM reads/writes | **Pass** | |
| Prefer uncontrolled inputs | **Partial** | Controlled forms acceptable for this app. |
| `<link rel="preconnect">` for CDN | **N/A** | Single-origin. |
| Critical fonts / `font-display: swap` | **Partial** | Fontsource defaults; preload optional. |

### Navigation & State

| Rule | Status | Notes |
|------|--------|-------|
| URL reflects state | **Partial** | Board route; filters mostly client state. |
| Links use `<a>`/`<Link>` | **Pass** | |
| Deep-link stateful UI | **Partial** | |
| Destructive actions need confirmation | **Pass** | |

### Touch & Interaction

| Rule | Status | Notes |
|------|--------|-------|
| `touch-action: manipulation` | **Pass** | Base styles on `button`, `a[href]`, `[role="button"]`. |
| `-webkit-tap-highlight-color` | **Fail** | Not set. |
| `overscroll-behavior: contain` in modals | **Pass** | Dialog, popover, multi-select panel. |
| Disable selection / `inert` during drag | **Partial** | dnd-kit handles drag surface. |
| `autoFocus` desktop-only | **Partial** | Several unconditional `autoFocus` usages remain. |

### Safe Areas & Layout

| Rule | Status | Notes |
|------|--------|-------|
| `env(safe-area-inset-*)` | **Pass** | `#root` padding. |
| Avoid unwanted scrollbars | **Pass** | |
| Flex/grid over JS measurement | **Pass** | |

### Dark Mode & Theming

| Rule | Status | Notes |
|------|--------|-------|
| `color-scheme` on dark | **Pass** | `.dark { color-scheme: dark; }`. |
| Scrollbar matches page bg | **Pass** | Custom scrollbar colors. |
| Native `<select>` styling | **N/A** | |

### Locale & i18n

| Rule | Status | Notes |
|------|--------|-------|
| Dates via `Intl.DateTimeFormat` | **Pass** | Shared helpers. |
| Numbers via `Intl.NumberFormat` | **Fail** | Not introduced app-wide. |
| Detect language via `Accept-Language` | **N/A** | |
| Brand names with `translate="no"` | **Fail** | Title not marked. |

### Hydration Safety

| Rule | Status | Notes |
|------|--------|-------|
| `value` inputs have `onChange` | **Pass** | |
| Date/time hydration | **N/A** | SPA. |
| `suppressHydrationWarning` | **N/A** | |

### Hover & Interactive States

| Rule | Status | Notes |
|------|--------|-------|
| Buttons/links have `hover:` state | **Pass** | |
| Hover/active/focus prominent | **Pass** | |

### Content & Copy

| Rule | Status | Notes |
|------|--------|-------|
| Active voice | **Pass** | |
| Title Case | **Partial** | Mixed sentence case — product choice. |
| Numerals for counts | **Pass** | |
| Specific button labels | **Pass** | |
| Error messages include fix | **Partial** | |
| Second person | **Pass** | |
| `&` over "and" | **N/A** | |

### Anti-patterns (should be absent)

| Anti-pattern | Present? | Notes |
|--------------|----------|-------|
| `user-scalable=no` | **Absent (Pass)** | |
| `onPaste` + `preventDefault` | **Absent (Pass)** | |
| `transition: all` | **Present (Fail)** | `button`, `badge`, `multi-select`. |
| `outline-none` without focus-visible replacement | **Partial** | Few dropdown/custom spots. |
| Inline `onClick` for navigation without `<a>` | **Absent (Pass)** | |
| `<div>` / `<span>` with click handlers (non-button) | **Absent (Pass)** | Prior multi-select issue cleared. |
| Images without dimensions | **Absent (Pass)** | |
| Large arrays `.map()` without virtualization | **Absent (Pass)** | |
| Form inputs without labels | **Partial** | |
| Icon buttons without `aria-label` | **Absent (Pass)** | |
| Hardcoded date formats | **Absent (Pass)** | Uses `Intl` helpers. |
| `autoFocus` without justification | **Partial** | |

---

## Summary numbers

| Category | Rules | Pass | Partial | Fail | N/A |
|----------|-------|------|---------|------|-----|
| Accessibility | 10 | 7 | 2 | 0 | 1 |
| Focus States | 4 | 2 | 2 | 0 | 0 |
| Forms | 11 | 5 | 4 | 1 | 1 |
| Animation | 6 | 2 | 1 | 1 | 2 |
| Typography | 6 | 4 | 0 | 2 | 0 |
| Content Handling | 4 | 4 | 0 | 0 | 0 |
| Images | 3 | 1 | 1 | 0 | 1 |
| Performance | 6 | 3 | 2 | 0 | 1 |
| Navigation & State | 4 | 2 | 2 | 0 | 0 |
| Touch & Interaction | 5 | 2 | 2 | 1 | 0 |
| Safe Areas & Layout | 3 | 3 | 0 | 0 | 0 |
| Dark Mode & Theming | 3 | 2 | 0 | 0 | 1 |
| Locale & i18n | 4 | 1 | 0 | 2 | 1 |
| Hydration Safety | 3 | 1 | 0 | 0 | 2 |
| Hover & Interactive States | 2 | 2 | 0 | 0 | 0 |
| Content & Copy | 7 | 5 | 2 | 0 | 0 |
| Anti-patterns | 12 | 8 | 3 | 1 | 0 |
| **Total** | **93** | **54** | **21** | **8** | **10** |

- Applicable rules (excluding N/A): **83**
- **Pass rate: ~65%** (54/83) — strict “no issues anywhere”
- **Pass + Partial rate: ~90%** (75/83) — rule mostly respected; remaining gaps are listed above

---

## Suggested order of execution

1. **Replace `transition-all`** (rec #1) — small diff, satisfies an explicit
   guideline anti-pattern.
2. **`aria-live` on toast region** (rec #2) — quick win for notifications.
3. **Unsaved-changes guard** (rec #3) — behaviorally important for a task
   editor.
4. **`Intl.NumberFormat` helper** (rec #4) — align numbers with date
   handling.
5. **Polish**: `translate="no"` (rec #5), tap highlight (rec #6), `autoFocus`
   gating (rec #7), font preload if desired (rec #8), nbsp in shortcuts
   (rec #9), menu highlight classes (rec #10).
