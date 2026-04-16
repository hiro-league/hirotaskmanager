# Web Interface Guidelines Review — `src/client/**`

Skill: [`web-design-guidelines`](../../.agents/skills/web-design-guidelines/SKILL.md)
Guidelines source: <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>
Date: 2026-04-16
Scope: Web client only (`src/client/**` + `index.html` + `src/client/index.css`).

> Abiding to the workspace `no-backward-compatibility` rule — all
> suggestions below can land as direct edits.

---

## TL;DR

Shared UI primitives (`Button`, `Input`, `Textarea`, `Dialog`,
`Popover`) are in solid shape — they all have proper `:focus-visible`
rings, `aria-invalid` styling, and sensible defaults. The issues cluster
into two areas:

1. **Auth flows hand-rolled their inputs** — four `<input>` tags in
   `AuthScreen.tsx` skip the shared `Input` primitive and therefore miss
   `focus-visible` styling, `autoComplete`, hit-target sizing, and the
   8-character minimum visual contrast. The same pattern repeats in
   `ListHeader`, `BandComposer`, and `Sidebar` rename inputs.
2. **Localization / typography polish** — dates use
   `toLocaleDateString(undefined, …)` (good!) but never
   `Intl.DateTimeFormat`; numbers render without `tabular-nums`;
   loading copy says `"Refreshing..."` (three dots) and the command
   palette says `"Search for a command to run..."` — neither uses the
   `…` ellipsis character the guidelines mandate.

Nothing critical is broken, and a11y fundamentals (ARIA labels, alt
attributes, aria-hidden icons, role="switch" on the theme toggle,
aria-live regions on dynamic content) are already in place.

---

## Recommendations, sorted by impact

| # | Priority | Finding | Location(s) | Fix |
|---|----------|---------|-------------|-----|
| 1 | **CRITICAL** | Auth inputs are hand-rolled and skip the shared `Input` primitive, so they lack `focus-visible` ring, `autoComplete`, `aria-invalid` styling, and mobile-friendly hit target. | `components/auth/AuthScreen.tsx:109-126, 194-200, 250-278` | Replace 6 raw `<input>` with `<Input>` + add `autoComplete="current-password"` / `"new-password"` / `"one-time-code"` (for recovery key) and `name="passphrase"` for password managers. |
| 2 | **HIGH** | Password inputs have no `autoComplete`, so password managers can't save / fill them — hurts login UX on every session. | `AuthScreen.tsx:110, 122, 195, 263, 274` | Add `autoComplete` (`current-password`, `new-password`, `new-password`). Recovery key: `autoComplete="off" spellCheck={false}`. |
| 3 | **HIGH** | "Use recovery key instead", "Back to login", "Cancel" buttons use bare `<button>` with no `focus-visible:ring-*` classes — they rely on the browser default outline, which the rest of the app has suppressed via `outline-none` on many controls. | `AuthScreen.tsx:59-66, 213-223, 286-306` | Use the `<Button>` primitive (`variant="outline"` / `"ghost"`) or add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`. |
| 4 | **HIGH** | `"Refreshing..."` and `"Search for a command to run..."` use `...` (three dots) — the guidelines require the single `…` character for typography and for loading states. | `components/layout/NotificationBell.tsx:181`, `components/ui/command.tsx:36`, `components/multi-select.tsx:1021` | Replace `...` with `…`. (Most other spots already do this — `"Search tasks…"`, `"Board name…"`.) |
| 5 | **HIGH** | Hand-rolled inline edit inputs across the board miss `focus-visible` styling and `autoComplete="off" spellCheck={false}` for name / title fields (titles are not natural-language prose). | `components/list/ListHeader.tsx:239-255` (list rename), `components/board/lanes/BandComposer.tsx:35-51` (add-card textarea), `components/layout/Sidebar.tsx:206,306` (board rename / new board) | Swap for `<Input>` / `<Textarea>` or add the focus classes + `autoComplete="off"` + `spellCheck={false}` where titles include tokens or IDs. |
| 6 | **HIGH** | `index.html` has no `<meta name="color-scheme">` — when the user prefers dark mode, native form controls (the auth password field, any `<select>`) and scrollbars render with the wrong theme until JS loads. | `index.html` (add `<meta name="color-scheme" content="light dark">`), `src/client/index.css` `:root` (add `color-scheme: light;`) and `.dark` (add `color-scheme: dark;`) | One line in each CSS scope. Also fixes the white flash around native inputs on Windows dark mode. |
| 7 | **MEDIUM** | `prefers-reduced-motion` is only honored in the celebration module. All other animations (`animate-pulse` skeletons, `transition-all` on `Button` / `Badge`, dialog zoom/fade) run unconditionally. | `components/ui/button.tsx:8`, `ui/badge.tsx:8`, `ui/dialog.tsx:40,62`, `App.tsx:18-20` (boot skeleton) | Add a global `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` in `index.css`. |
| 8 | **MEDIUM** | `transition-all` is used in `Button`, `Badge`, and `multi-select.tsx`. The guidelines specifically flag this — animations should list properties (e.g. `transition-colors,box-shadow`). | `components/ui/button.tsx:8`, `components/ui/badge.tsx:8`, `components/multi-select.tsx:50` | Replace with explicit list (e.g. `transition-[background-color,color,border-color,box-shadow]`). `AppHeader` already does this correctly. |
| 9 | **MEDIUM** | Dates and relative times are formatted with `toLocaleDateString(undefined, {...})` / `toLocaleString(undefined, {...})` — works, but the guidelines recommend `Intl.DateTimeFormat` (cached) for locale-aware output and better perf on hot paths like the board filter strip / task card tooltips. | `components/task/TaskEditor.tsx:55,505`, `components/trash/TrashPage.tsx:28`, `components/board/header/BoardTaskDateFilter.tsx:40`, `components/board/boardFilterSummaries.ts:29` | Hoist a module-level `const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })` and call `fmt.format(d)`. |
| 10 | **MEDIUM** | No `font-variant-numeric: tabular-nums` anywhere. The board stats chips (`total`, `open`, `closed` counts) change as users filter — they jitter without tabular nums. | `components/board/header/BoardStatsChips.tsx`, `components/task/TaskTitleCharsLeft.tsx` (chars-left counter), `components/board/header/BoardTaskDateFilter.tsx` | Add a `tabular-nums` utility class on the number spans. |
| 11 | **MEDIUM** | No `text-wrap: balance` / `text-pretty` on the page `<h1>`/`<h2>` headings (auth screen, "No board selected" state). Widows are possible on narrow widths. | `components/auth/AuthScreen.tsx:34`, `components/board/BoardView.tsx:313` | Add `text-balance` utility (Tailwind v4 supports it). |
| 12 | **MEDIUM** | No `autoComplete="off"` + `spellCheck={false}` on identifier-like inputs (task titles, list names, board names, release name, priority name, hex colors). Browsers underline them with the red "typo" squiggle and some aggressively offer unrelated autofill. | `components/list/ListHeader.tsx:239`, `board/dialogs/ReleasesEditorDialog.tsx:379,398`, `board/dialogs/TaskPrioritiesEditorDialog.tsx:271,322`, `task/TaskEditor.tsx:422`, `board/columns/BoardColumns.tsx:163`, `board/columns/BoardListStackedColumn.tsx:165` | Two props per input. |
| 13 | **MEDIUM** | Several touch / mobile hygiene items missing: no `touch-action: manipulation` on primary interactive surfaces (only `multi-select.tsx` sets it); no `overscroll-behavior: contain` on dialog / popover content (prevents background scroll chaining on iOS/Android); no `env(safe-area-inset-*)` padding for notched devices. The app bills itself as a task manager, and running it as a PWA is the natural fit. | `index.css` `*` or a `.app-surface` class, `components/ui/dialog.tsx`, `components/ui/popover.tsx` | Add `touch-action: manipulation` to buttons/links in CSS; add `overscroll-behavior: contain` to `DialogContent` and `PopoverContent`. |
| 14 | **MEDIUM** | The `autoFocus` prop is used unconditionally in several desktop+mobile components (auth screen, sidebar, list rename) — guidelines say "desktop only, single primary input; avoid on mobile". | `AuthScreen.tsx:111,196,252`, `Sidebar.tsx:206,306`, `SidebarBoardItem.tsx:48`, `ListHeader.tsx:240`, `TaskGroupEditorSortableRow.tsx:126` | Gate on a `useMedia("(pointer: fine)")` or remove on small viewports. The `TaskEditor.tsx:521` usage is already gated (`mode === "edit" && taskEditorActive`) — good reference. |
| 15 | **LOW** | `aria-live` is used on multi-select and board color menu, but not on task mutation toasts / notifications. | `components/layout/NotificationToasts.tsx` | Add `aria-live="polite"` (or `"assertive"` for errors) on the toast container. |
| 16 | **LOW** | Two buttons in `multi-select.tsx:893,959` use `role="button"` on a `<div>`. Guidelines flag this explicitly. | `components/multi-select.tsx:893,959` | Change to `<button type="button">`. |
| 17 | **LOW** | `index.html` has no `<link rel="preconnect">` / `<link rel="dns-prefetch">` for the API host (same origin today, so low impact), and no preloaded fonts — `@fontsource-variable/plus-jakarta-sans` + `@fontsource/lora` load via CSS, causing FOUT. | `index.html` | `<link rel="preload" href="/assets/...woff2" as="font" type="font/woff2" crossorigin>` for the two display weights used above the fold. |
| 18 | **LOW** | No skip-link ("Skip to main content") for keyboard users, and no `scroll-margin-top` on heading anchors. The app is sidebar + header + board, so a skip link from the sidebar to the canvas would help screen reader users. | `components/layout/AppShell.tsx` | Add a visually-hidden anchor that becomes visible on focus. |
| 19 | **LOW** | The theme toggle uses `role="switch"` with `aria-checked` — good — but nearby `title`/`aria-label` copy could be more specific. Minor. | `components/layout/AppHeader.tsx:112-120` | Optional: set `aria-label="Toggle between light and dark theme, current: dark"`. |
| 20 | **LOW** | `index.html` has the correct viewport meta, but no `<meta name="theme-color">` synced with dark / light — iOS Safari shows the wrong status bar color on the PWA install. | `index.html` | Two `<meta name="theme-color" …>` tags with `media="(prefers-color-scheme: …)"`. |

---

## What's already good (don't regress these)

- Every icon-only button has `aria-label` or `title` (30+ call sites).
- Decorative icons are consistently marked `aria-hidden` (Lucide
  icons, in particular, are all hidden from assistive tech).
- Logo images in `AuthScreen` and `AppHeader` use `alt=""` (correctly
  decorative) with explicit `width`/`height`.
- Virtualization is applied to task bands via `@tanstack/react-virtual`
  in `BandTaskList` and `StackedTaskList`.
- Focus rings on shared primitives (`Button`, `Input`, `Textarea`,
  `Badge`, `Dialog`) use `:focus-visible`, not `:focus`.
- The theme toggle is a true `role="switch"` with `aria-checked`.
- Forms use native `<form onSubmit={…}>` and submit buttons stay
  enabled until disable conditions are met (`AuthScreen` is a good
  example).
- The app avoids `user-scalable=no` on the viewport meta.
- The command palette uses `cmdk` which handles ARIA listbox semantics.
- `useBoardCanvasPanScroll` / `boardSurfaceWheel` explicitly handle
  `overscroll-behavior` concerns when panning the board.

---

## Compliance matrix

The guidelines define 14 sections. Each row is a rule in the skill
(using the guideline's own phrasing). "Pass" = no violation found;
"Partial" = mostly followed with 1–3 counter-examples listed above;
"Fail" = the rule is not followed at all; "N/A" = not applicable to
this codebase.

### Accessibility

| Rule | Status | Notes |
|------|--------|-------|
| Icon-only buttons have `aria-label` | **Pass** | Sampled ~30 icon buttons — all have `aria-label` or `title` + `aria-label`. |
| Form controls have `<label>` or `aria-label` | **Partial** | Shared `Input`/`Textarea` rely on caller; `AuthScreen`, `ReleasesEditorDialog`, `TaskPrioritiesEditorDialog` use `<label>` correctly. Some inline inputs (`ListHeader` rename, `Sidebar`) rely on visual context without a programmatic label. |
| Interactive elements have keyboard handlers | **Pass** | All custom interactions use `<button>` or keyboard-aware Radix primitives. |
| `<button>` for actions, `<a>` for navigation | **Partial** | `multi-select.tsx:893,959` uses `<div role="button">`. |
| Images have `alt` | **Pass** | `hirologo.png` uses `alt=""` (decorative) in both spots it appears. |
| Decorative icons `aria-hidden="true"` | **Pass** | Consistent across the client. |
| Async updates have `aria-live="polite"` | **Partial** | `BoardColorMenu`, `TaskTitleCharsLeft`, `multi-select` have it. `NotificationToasts` does not. |
| Semantic HTML before ARIA | **Pass** | Real `<header>`, `<form>`, `<label>`, `<button>` throughout. |
| Headings hierarchical, skip link | **Fail** | No skip link; heading levels are reasonable (only one `<h1>` per page). |
| `scroll-margin-top` on heading anchors | **N/A** | No anchored headings in-app. |

### Focus States

| Rule | Status | Notes |
|------|--------|-------|
| Visible focus ring on interactive elements | **Partial** | UI primitives and AppHeader pass. Auth screen buttons, `BandComposer` buttons, inline rename inputs rely on browser default. |
| Never `outline-none` without replacement | **Partial** | `multi-select.tsx:910,973` and a few dropdown items use `outline-none` with only `hover:bg-*` — no focus ring replacement. `Button`, `Input`, `Textarea`, `Dialog` all replace correctly. |
| `:focus-visible` over `:focus` | **Pass** | Dominant usage is `focus-visible:*`. |
| `:focus-within` for compound controls | **Pass** | `input-group.tsx` uses `has-[[data-slot=input-group-control]:focus-visible]:*`. |

### Forms

| Rule | Status | Notes |
|------|--------|-------|
| `autoComplete` + meaningful `name` | **Fail** | Only `BoardSearchDialog:156` sets `autoComplete="off"`. Auth inputs have neither. |
| Correct `type` / `inputmode` | **Partial** | `type="password"` / `"text"` / `"number"` used. No `inputmode` anywhere. |
| Don't block paste | **Pass** | No `onPaste` + `preventDefault` found. |
| Labels clickable (`htmlFor` or wrapping) | **Pass** | `AuthScreen` wraps inputs with `<label>`. Dialog forms use text-only labels though; worth tightening. |
| Disable spellcheck on codes / usernames | **Fail** | No `spellCheck={false}` anywhere. Recovery key input is especially impacted. |
| Checkbox/radio single hit target | **N/A** | Only native controls or Radix primitives used. |
| Submit stays enabled until request starts | **Pass** | `AuthScreen` disables on `login.isPending`, not earlier. |
| Errors inline next to fields | **Pass** | `AuthScreen` mismatch + error texts appear next to inputs. |
| Placeholders end with `…` | **Partial** | Most do (`Board name…`, `Enter list name…`, `Search tasks…`). Counter-examples: `multi-select.tsx:1021 Search options...`, `Priority name` / `Title` / `Name` / `#rrggbb` don't end with `…` (arguably fine since they show example patterns). |
| `autoComplete="off"` on non-auth fields | **Partial** | Only `BoardSearchDialog`. All rename / title inputs are missing it. |
| Warn before navigation with unsaved changes | **Fail** | No `beforeunload` listener anywhere. `TaskEditor` has rich unsaved-change UX in-app but doesn't guard browser navigation. |

### Animation

| Rule | Status | Notes |
|------|--------|-------|
| Honor `prefers-reduced-motion` | **Fail** | Only honored in `gamification/completionRewards.ts`. Skeleton pulses, dialog zoom, `transition-all` all run unconditionally. |
| Animate `transform`/`opacity` only | **Partial** | Dialog zoom-in-95 + fade is correct. Task card hover uses `transition-opacity` (good). Some `transition-colors` / `transition-[color,background-color,box-shadow]` — acceptable for compositor but not strictly transform/opacity. |
| Never `transition: all` | **Fail** | `Button`, `Badge`, `multi-select` use `transition-all`. |
| Correct `transform-origin` | **N/A** | Dialog uses Radix's data-attribute animations which handle origin. |
| SVG animation on `<g>` wrapper | **N/A** | No custom SVG animation. |
| Animations interruptible | **Pass** | No blocking animations; Radix primitives cancel on close. |

### Typography

| Rule | Status | Notes |
|------|--------|-------|
| `…` not `...` | **Partial** | Most of the app uses `…`. Three offenders: `NotificationBell:181`, `command.tsx:36`, `multi-select.tsx:1021`. Also internal comments / JSDoc. |
| Curly quotes | **Pass** | The codebase uses curly quotes in JSDoc and most user-facing strings. |
| Non-breaking spaces (`10 MB`, `⌘ K`) | **Fail** | No `\u00A0` / `&nbsp;` found in user-facing strings. `⌘K`, `100 %`, etc. are not nbsp-joined. |
| Loading states end with `…` | **Partial** | `Loading…` appears in some places; `Refreshing...` in `NotificationBell:181` breaks the rule. |
| `tabular-nums` for number columns | **Fail** | No usages. Stats chips and counters can jitter. |
| `text-wrap: balance` on headings | **Fail** | No usages. |

### Content Handling

| Rule | Status | Notes |
|------|--------|-------|
| Long content handled (`truncate`, `line-clamp-*`, `break-words`) | **Pass** | `AppHeader.tsx:55 truncate`, task card uses `line-clamp-3` via `previewBody`, sidebar uses `truncate`. |
| Flex children have `min-w-0` | **Pass** | `AppHeader`, sidebar items, `BoardSearchDialog`, `NotificationBell` all set `min-w-0` or `min-w-9`. |
| Handle empty states | **Pass** | BoardView shows "No board selected" / trash shows empty state / notification bell shows zero-count copy. |
| Anticipate short/avg/very long input | **Pass** | `clampTaskTitleInput` + `TaskTitleCharsLeft` explicitly handle this. |

### Images

| Rule | Status | Notes |
|------|--------|-------|
| Explicit `width`/`height` | **Pass** | Both `<img>` tags (`AppHeader`, `AuthScreen`) set `width` + `height`. |
| Below-fold `loading="lazy"` | **N/A** | Only two images and both are above the fold. |
| Above-fold critical images `priority`/`fetchpriority="high"` | **Partial** | Logo in `AppHeader` is above the fold and could be `fetchpriority="high"`. |

### Performance

| Rule | Status | Notes |
|------|--------|-------|
| Virtualize lists > 50 items | **Pass** | `BandTaskList`, `StackedTaskList` use `useVirtualizer`. Command palette uses `cmdk`'s built-in virtual-ish rendering. |
| No layout reads in render | **Partial** | Layout reads are all inside effects/callbacks (`useBoardHighlightState`, `useBandController`, `useStackedListTaskActions`, `BoardListColumn`), never during render — good. Some are on hot paths (wheel handlers in `boardSurfaceWheel.ts`) but properly batched. |
| Batch DOM reads/writes | **Pass** | `autoSizeInlineTitleTextarea` and `useBoardHighlightState` read-then-write rather than interleaving. |
| Prefer uncontrolled inputs | **Partial** | Most form inputs are controlled, but they're cheap (no markdown-editor-on-every-keystroke anti-pattern). `TaskMarkdownField` uses `@uiw/react-md-editor` which is expensive — but already virtualized visually. |
| `<link rel="preconnect">` for CDN | **N/A** | Single-origin app today. |
| Critical fonts: `font-display: swap` | **Partial** | `@fontsource-variable/plus-jakarta-sans` defaults to `swap` — good. No `<link rel="preload">` for either font. |

### Navigation & State

| Rule | Status | Notes |
|------|--------|-------|
| URL reflects state (filters, tabs) | **Partial** | Route path reflects selected board, but filter strip, active release, priority toggles, stats visibility live only in Zustand / `localStorage`. Sharable board-with-filters URL would require nuqs. |
| Links use `<a>`/`<Link>` | **Pass** | React Router `<Link>` is used; `<HomeRedirect>` and `<Navigate>` exist. No raw `onClick` navigation found. |
| Deep-link stateful UI | **Partial** | Same as the URL-reflects-state row. Board search open-state is not in the URL either. |
| Destructive actions need confirmation | **Pass** | Task delete, list delete, board delete all go through dedicated confirm dialogs (`BoardTaskDeleteConfirm`, `BoardListDeleteConfirm`, `SidebarConfirmDialog`). |

### Touch & Interaction

| Rule | Status | Notes |
|------|--------|-------|
| `touch-action: manipulation` | **Fail** | Only in `multi-select.tsx:1014`. Should be global on interactive surfaces. |
| `-webkit-tap-highlight-color` set | **Fail** | Not set anywhere. |
| `overscroll-behavior: contain` in modals | **Fail** | Not set on `DialogContent`, `PopoverContent`, or the notification popover. |
| Disable selection / `inert` during drag | **Partial** | `@dnd-kit/react` handles the dragged element, but `inert` on siblings is not applied. |
| `autoFocus` desktop-only | **Partial** | Used unconditionally (see Recommendation #14). |

### Safe Areas & Layout

| Rule | Status | Notes |
|------|--------|-------|
| `env(safe-area-inset-*)` for notches | **Fail** | Not used anywhere; problematic if installed as PWA on iOS. |
| Avoid unwanted scrollbars | **Pass** | `overflow-hidden` on the main board container, `min-h-0 flex-1` on inner flex panes. |
| Flex/grid over JS measurement | **Pass** | Layout is CSS-first; JS measurement is only for virtualization / drag targeting. |

### Dark Mode & Theming

| Rule | Status | Notes |
|------|--------|-------|
| `color-scheme: dark` on `<html>` dark | **Fail** | Not set in `index.css`. |
| Scrollbar matches page bg | **Fail** | No `scrollbar-color` / `scrollbar-gutter` set; depends on #above. |
| Native `<select>`: explicit bg/color | **N/A** | No native `<select>` in the app. |

### Locale & i18n

| Rule | Status | Notes |
|------|--------|-------|
| Dates via `Intl.DateTimeFormat` | **Partial** | Dates use `toLocaleDateString(undefined, …)` — works but isn't cached. |
| Numbers via `Intl.NumberFormat` | **Fail** | No usages. `@number-flow/react` is imported for animated counters but doesn't use `Intl`. |
| Detect language via `Accept-Language` | **N/A** | No i18n strings yet. |
| Brand names with `translate="no"` | **Fail** | `Hiro Task Manager` in `AppHeader.tsx:55` would be translated by Chrome if a Spanish/French user enabled translate. |

### Hydration Safety

| Rule | Status | Notes |
|------|--------|-------|
| `value` inputs have `onChange` | **Pass** | All controlled inputs have `onChange`. |
| Date/time hydration | **N/A** | SPA with no SSR — no hydration mismatch possible. |
| `suppressHydrationWarning` only when needed | **N/A** | Not used. |

### Hover & Interactive States

| Rule | Status | Notes |
|------|--------|-------|
| Buttons/links have `hover:` state | **Pass** | All buttons in `Button` variants define hover. |
| Hover/active/focus more prominent than rest | **Pass** | Variants escalate contrast correctly. |

### Content & Copy

| Rule | Status | Notes |
|------|--------|-------|
| Active voice | **Pass** | "Log in", "Create passphrase", "Reset passphrase" — all imperative. |
| Title Case for buttons | **Partial** | Mix: `"Log in"` is sentence case; `"Create passphrase"` is sentence case. "Use recovery key instead" is sentence case. Not a consistent style. |
| Numerals for counts | **Pass** | `${items.length} visible item${…}` etc. |
| Specific button labels | **Pass** | "Save API Key"-style labels (`"Create passphrase"`, `"Reset passphrase"`, `"Log in"`). No `"Continue"`/`"Submit"`. |
| Error messages include fix | **Partial** | `AuthScreen` shows raw server message; adding "Try again" / "Reset passphrase" affordance is already present as a separate button. |
| Second person, avoid first person | **Pass** | Copy is second-person throughout. |
| `&` over "and" where tight | **N/A** | No space-constrained copy spotted. |

### Anti-patterns (should be absent)

| Anti-pattern | Present? | Notes |
|--------------|----------|-------|
| `user-scalable=no` / `maximum-scale=1` | **Absent (Pass)** | `index.html:6` is clean. |
| `onPaste` + `preventDefault` | **Absent (Pass)** | |
| `transition: all` | **Present (Fail)** | `Button`, `Badge`, `multi-select`. |
| `outline-none` without focus-visible replacement | **Present (Partial)** | A handful of dropdown items. |
| Inline `onClick` for navigation without `<a>` | **Absent (Pass)** | Router `<Link>` used. |
| `<div>` / `<span>` with click handlers (should be `<button>`) | **Present (Fail)** | `multi-select.tsx:893,959`. |
| Images without dimensions | **Absent (Pass)** | |
| Large arrays `.map()` without virtualization | **Absent (Pass)** | Virtualized. |
| Form inputs without labels | **Partial** | See Forms matrix. |
| Icon buttons without `aria-label` | **Absent (Pass)** | |
| Hardcoded date / number formats | **Absent (Pass)** | Uses `toLocaleDateString`, albeit not `Intl` cached. |
| `autoFocus` without justification | **Partial** | See Recommendation #14. |

---

## Summary numbers

| Category | Rules | Pass | Partial | Fail | N/A |
|----------|-------|------|---------|------|-----|
| Accessibility | 10 | 5 | 3 | 1 | 1 |
| Focus States | 4 | 2 | 2 | 0 | 0 |
| Forms | 11 | 4 | 4 | 2 | 1 |
| Animation | 6 | 1 | 2 | 2 | 1 |
| Typography | 6 | 1 | 2 | 3 | 0 |
| Content Handling | 4 | 4 | 0 | 0 | 0 |
| Images | 3 | 1 | 1 | 0 | 1 |
| Performance | 6 | 3 | 2 | 0 | 1 |
| Navigation & State | 4 | 2 | 2 | 0 | 0 |
| Touch & Interaction | 5 | 0 | 2 | 3 | 0 |
| Safe Areas & Layout | 3 | 2 | 0 | 1 | 0 |
| Dark Mode & Theming | 3 | 0 | 0 | 2 | 1 |
| Locale & i18n | 4 | 0 | 1 | 2 | 1 |
| Hydration Safety | 3 | 1 | 0 | 0 | 2 |
| Hover & Interactive States | 2 | 2 | 0 | 0 | 0 |
| Content & Copy | 7 | 5 | 2 | 0 | 0 |
| Anti-patterns | 12 | 7 | 2 | 3 | 0 |
| **Total** | **93** | **40** | **25** | **19** | **9** |

- Applicable rules (excluding N/A): **84**
- **Pass rate: 48%** (40/84) — strict "no issues found anywhere"
- **Pass + Partial rate: 77%** (65/84) — rule is respected; 1–3 specific spots to fix

---

## Suggested order of execution

1. **Auth input polish** (recs #1–#3). One file (`AuthScreen.tsx`),
   immediately visible quality bump, password-manager-friendly.
2. **Global CSS hardening** (recs #6, #7, #8, #13). Add `color-scheme`,
   `prefers-reduced-motion`, `touch-action: manipulation`, and the
   `overscroll-behavior` block to `DialogContent`/`PopoverContent`.
   Small diff, site-wide effect.
3. **Typography sweep** (recs #4, #10, #11, #12). Replace `...` with
   `…`, add `tabular-nums` to number spans, `text-balance` to headings,
   `spellCheck={false}` / `autoComplete="off"` to identifier inputs.
4. **`Intl.DateTimeFormat` cache** (rec #9). Hoist module-level
   formatters, replace `toLocaleDateString(undefined, …)` call sites.
5. **Role/semantics cleanup** (rec #16) and a11y extras (rec #15, #18).
6. **PWA / mobile polish** (recs #13, #17, #20) once the app is shipped
   as an installable PWA.
