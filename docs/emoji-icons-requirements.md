# Emoji icons requirements

This document captures the confirmed product requirements for optional emoji icons on boards, lists, task groups, and tasks, plus a short list of deferred ideas.

## Scope

- Add an optional emoji icon to:
  - boards
  - lists
  - task groups
  - tasks
- When present, render the emoji immediately before the visible name/title so it reads as part of the label.
- When absent, render the existing text unchanged.

## Confirmed decisions

- Use emoji only in the initial implementation.
- Do not support Lucide or other SVG icon libraries in phase 1.
- Do not support custom icon color in phase 1.
- Keep the emoji stored separately from the main text field; do not bake it into `name`, `label`, or `title`.
- Keep the field optional and nullable.
- Do not include emoji data in FTS search matching for now.
- Use a picker-based UX so users can browse and search available emoji.

## Product requirements

- Users can add, change, and clear an emoji for each supported entity.
- The emoji is metadata only; it does not change sorting semantics.
- The emoji should render consistently in:
  - board sidebar entries
  - list headers
  - task group labels and selectors
  - task cards and task editor surfaces where the title is shown
- Existing data remains valid after migration; all emoji fields default to empty.
- New boards should continue to work without requiring emoji selection.

## Validation requirements

- Accept a short Unicode emoji string.
- Reject empty whitespace-only values as a stored icon.
- Enforce a small maximum grapheme length so users cannot store arbitrary long text in the emoji field.
- Preserve valid multi-code-point emoji such as skin-tone or joined sequences.

## Non-goals

- Lucide picker support.
- Mixed icon systems in one field.
- Per-icon color, stroke, or style controls.
- Emoji-aware search or filtering.
- Emoji-based sorting, grouping, or analytics.
- Custom uploaded icons.

## Future options

- Add a second icon kind for named SVG icons such as Lucide.
- Offer a combined picker with tabs for emoji and app icons.
- Add a curated "recommended for software work" emoji section.
- Allow recent or frequently used emoji per user or per device.
- Add optional icon color only if a later SVG icon system justifies it.
