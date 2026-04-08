# Board-scoped theme plan

This document proposes a board-only theming model that keeps the site-wide theme unchanged while allowing an individual board to derive its surfaces and actions from one or two seed colors.

The intent is to avoid maintaining many hand-authored board themes. Instead, a board theme should define a very small set of inputs, then derive the board's visual tokens from them for both light and dark mode.

## Goals

- Support board-only theming without changing the rest of the app theme.
- Keep the implementation token-driven and compatible with the existing shadcn CSS variable setup.
- Let a board theme be defined by one or two seed colors:
  - a surface hue
  - an action hue
- Preserve readable text and acceptable contrast in both light and dark mode.
- Start with a small proof of concept that touches the highest-visibility board surfaces first.
- Expand later to cover remaining board UI, status treatments, overlays, and portal-based menus.

## Non-goals

- Do not replace the global app theme system.
- Do not introduce a large catalog of prebuilt named board themes in phase 1.
- Do not attempt independent light/dark mode switching per board.
- Do not recolor the entire application shell, sidebar, or header as part of this work.

## Current codebase fit

The existing frontend already uses shadcn-compatible CSS variables in `src/client/index.css`, and the board already consumes several board-specific surface tokens:

- `--board-canvas`
- `--list-column`
- `--task-card`
- `--task-card-foreground`

Board UI also relies heavily on shared semantic tokens such as:

- `--primary`
- `--primary-foreground`
- `--accent`
- `--border`
- `--ring`
- `--muted`
- `--popover`
- `--card`

This makes board-scoped theming feasible by applying a wrapper class or data attribute around the board subtree and overriding only the tokens that should differ inside that subtree.

## Design principles

### 1. Drive the board from semantic seed colors

Each board theme should define, at most:

- `surface color`
- optional `action color`

If only one color is provided, the action color can fall back to the current global `primary` token or a derived variant of the surface hue.

Recommended mental model:

- the surface hue drives structural UI:
  - board canvas
  - list shells
  - list borders
  - list header backgrounds
  - subtle fills
- the action hue drives interactive UI:
  - primary buttons
  - active toggles
  - focus rings
  - drag highlight states
  - selected chips

### 2. Keep text mostly neutral unless contrast requires adjustment

Do not fully derive every text color from the seed hues.

Instead:

- keep core text tokens inherited where possible
- only override text tokens when needed for contrast on recolored surfaces
- continue using semantic foreground tokens instead of raw color classes

This reduces accessibility risk and helps the board feel integrated with the rest of the app.

### 3. Derive separate light and dark variants from the same seed(s)

The same board theme should work in both app modes:

- light mode:
  - surfaces should be lighter and lower-chroma
  - borders can be slightly darker and more saturated
  - action color should remain clearly interactive
- dark mode:
  - surfaces should be darker and slightly richer
  - borders and dividers need enough separation to stay visible
  - action color should be bright enough for rings, buttons, and active states

The board does not need its own independent dark-mode toggle in phase 1. It should simply derive board-local values that respond to the already-resolved global light/dark mode.

### 4. Prefer scoped semantic tokens over hardcoded color classes

The board will be easiest to theme if board-facing UI uses semantic tokens rather than explicit color utilities such as `bg-red-*`, `bg-amber-*`, or `dark:bg-emerald-*`.

Phase 1 can tolerate some hardcoded colors outside the main proof of concept. Phase 2 should convert remaining board-specific hardcoded colors to derived tokens where it materially improves visual consistency.

## Proposed theme model

### Theme inputs

Per board:

- `boardTheme.surface`
- `boardTheme.action`

Example:

- surface = red
- action = green

### Theme outputs

These should be derived per board wrapper for both light and dark mode:

- `--board-canvas`
- `--list-column`
- `--task-card`
- `--task-card-foreground`
- `--primary`
- `--primary-foreground`
- `--accent`
- `--accent-foreground`
- `--border`
- `--ring`

Potential later additions:

- `--popover`
- `--popover-foreground`
- `--card`
- `--card-foreground`
- `--input`
- board-local status tokens such as:
  - `--board-status-open`
  - `--board-status-progress`
  - `--board-status-closed`

### Suggested derivation rules

If the surface hue is the structural color:

- board canvas = weakest surface tint
- list shell = one step stronger than board canvas
- list header = one step stronger than list shell, or a translucent overlay on it
- task card = slightly separated from the list shell so cards still read clearly
- border = darker or higher-contrast version of the surface hue

If the action hue is the interactive color:

- primary = base interactive action
- primary foreground = contrast-safe text on primary
- ring = brighter or more saturated variant of action
- accent = very soft tinted hover/selection state

## Phase 1: proof of concept

Goal: prove that a board can adopt a strong board-local visual identity from one or two seed colors while the rest of the app stays unchanged.

### Scope

Implement board-scoped derived tokens for the most visible surfaces and interactions only:

- board wrapper theme scope
- board canvas
- list column shell
- task cards
- board-local primary buttons and active chips
- board-local borders and focus ring

### Files likely involved

- `src/client/index.css`
- `src/client/components/board/BoardView.tsx`
- `src/client/components/board/BoardColumns.tsx`
- `src/client/components/board/BoardListColumn.tsx`
- `src/client/components/board/BoardListStackedColumn.tsx`
- `src/client/components/board/ListStatusBand.tsx`
- `src/client/components/task/TaskCard.tsx`
- possibly `src/client/components/list/ListHeader.tsx`

### Phase 1 implementation outline

1. Introduce a board theme wrapper around the board subtree.
2. Define a tiny theme registry or seed-color mapping for one experimental board theme.
3. Derive board-local CSS variables from those seed colors for light and dark mode.
4. Override only the core board tokens inside the wrapper:
   - `--board-canvas`
   - `--list-column`
   - `--task-card`
   - `--task-card-foreground`
   - `--primary`
   - `--primary-foreground`
   - `--accent`
   - `--border`
   - `--ring`
5. Update the highest-visibility board surfaces to consume those tokens consistently.
6. Validate text readability and hover/focus states in both light and dark modes.

### Success criteria

- The selected board has an obvious local visual identity.
- The rest of the app shell remains unchanged.
- Light and dark mode both look coherent.
- Primary actions remain clear and readable.
- Task cards, columns, and header controls still have sufficient separation.

## Phase 2: broader rollout

Goal: extend the board theme system so nearly all board-adjacent UI participates cleanly in the scoped theme.

### Scope

- convert remaining board hardcoded colors to semantic board or shared tokens where appropriate
- theme dialogs, menus, and overlays triggered from the board
- improve status treatments so they harmonize with board-local colors
- optionally persist a board theme choice in board preferences

### Phase 2 focus areas

#### A. Remove remaining hardcoded board colors

Review places that currently use explicit color utilities instead of semantic variables, especially:

- lane status colors
- task status indicator dots
- direct `dark:*` overrides that bypass semantic board tokens

#### B. Theme board-originated overlays consistently

Some board UI is rendered inside the board subtree and should inherit the wrapper theme naturally. Portal-based UI may require explicit propagation of the board theme to the rendered content.

This includes checking:

- dropdown menus
- popovers
- drag overlays
- dialogs

#### C. Expand token coverage

If phase 1 feels too limited, extend the board wrapper to provide derived values for:

- `--popover`
- `--card`
- `--input`
- additional board-local semantic tokens for list headers, status rails, and drag states

#### D. Add data-model support if warranted

If the proof of concept succeeds, consider storing board theme preferences as part of board view preferences or another board-scoped model so the theme is durable and user-selectable.

## Risks and trade-offs

### 1. Too much color derivation can hurt readability

If all tokens are derived aggressively from one or two hues, surfaces can collapse together and text contrast can degrade, especially in dark mode.

Mitigation:

- keep foreground tokens neutral where possible
- keep task cards visually distinct from the list shell
- test both modes before broad rollout

### 2. Partial tokenization can produce an inconsistent board

If only some components use semantic tokens while others still use hardcoded classes, the board may look only partially themed.

Mitigation:

- keep phase 1 intentionally narrow
- make phase 2 explicitly responsible for cleaning up the remaining hardcoded board colors

### 3. Portals may not inherit the board wrapper theme

Components rendered outside the board subtree may continue using the global site theme unless theme context or CSS selectors are propagated deliberately.

Mitigation:

- identify portal-based board UI during phase 2
- pass theme-identifying attributes where needed

## Recommended rollout order

1. Build one red/green experimental board theme as the phase 1 proof of concept.
2. Use it on one board only and validate:
   - light mode
   - dark mode
   - hover states
   - focus rings
   - task readability
   - button readability
3. Expand token coverage only after the base surfaces and actions feel stable.
4. Convert remaining board-specific hardcoded colors in phase 2.

## Recommendation

Proceed with the two-color board-scoped theme approach.

Phase 1 should remain intentionally small and visual:

- prove that one surface hue plus one action hue can create a coherent board identity
- keep the global app theme untouched
- avoid overcommitting to a full theme system too early

Phase 2 should then harden the model:

- finish tokenizing the rest of the board UI
- address overlays and portal content
- decide whether board theme selection should become a persisted product feature
