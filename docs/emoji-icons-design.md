# Emoji icons design

This document describes the proposed technical design for optional emoji icons across boards, lists, task groups, and tasks.

## Design summary

- Store emoji as separate optional metadata fields.
- Render emoji inline before the visible text.
- Use one picker pattern everywhere possible.
- Keep search, sort, and core identity behavior based on the original text fields.

## Data model

Recommended field shape:

```ts
emoji?: string | null;
```

Apply this to:

- `Board`
- `BoardIndexEntry`
- `List`
- `Task`
- `GroupDefinition`

Recommended rule: use the same field name everywhere to keep API and UI code uniform.

## Storage model

Add nullable `TEXT` columns:

- `board.emoji`
- `list.emoji`
- `task.emoji`
- `task_group.emoji`

Migration behavior:

- existing rows get `NULL`
- no backfill is required
- new rows may omit the field

## API model

Board detail and board index payloads should include `emoji` when present.

Existing create and patch surfaces should accept the optional field for:

- boards
- lists
- task groups
- tasks

Recommended wire behavior:

- omitted field: leave unchanged on patch
- `null` or empty normalized value: clear the stored emoji
- valid emoji string: store it

## Rendering model

Display rule:

- if `emoji` exists, render `emoji + space + text`
- if `emoji` is empty, render text only

This should be applied consistently in:

- board sidebar labels
- board title areas if board emoji is shown there
- list headers
- task group switchers, editors, and task card labels
- task cards and task editor title areas

Render emoji as normal text, not as an icon component.

## Picker UX

Use an emoji picker component inside the app's existing React/Radix dialog or popover patterns.

Current preferred package candidate:

- `emoji-picker-react`

Reason:

- active recent releases
- React-first API
- search and category browsing built in
- supports multiple visual styles while still returning emoji selections

Recommended UX pattern:

- current emoji preview button
- open picker
- choose emoji
- clear button beside or inside the picker flow

Recommended enhancement:

- add a small curated "work emoji" shortcut row above the full picker

## Validation

Server-side validation should:

- trim surrounding whitespace
- treat blank as empty
- enforce a short grapheme-count limit
- reject non-empty values that exceed that limit

Client-side validation should mirror the same rules for immediate feedback, but the server remains authoritative.

## Search and indexing

FTS should remain unchanged in phase 1.

Do not index:

- `board.emoji`
- `list.emoji`
- `task.emoji`
- `task_group.emoji`

Search should continue to match text fields only.

## Deferred design choices

- No Lucide support in the initial schema.
- No icon color field.
- No icon kind union type until a second icon system is actually needed.

If a later phase adds Lucide, prefer an explicit discriminated model such as:

```ts
type EntityIcon =
  | { kind: "emoji"; value: string }
  | { kind: "lucide"; value: string };
```
