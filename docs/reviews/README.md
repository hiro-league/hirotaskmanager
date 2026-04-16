# UI Reviews — April 2026

Two companion reviews of the client app (`src/client/**`) against the two
skills shipped in `.agents/skills/`:

- [`composition-patterns-review.md`](./composition-patterns-review.md) —
  Vercel React Composition Patterns
  (compound components, state lifting, React 19 APIs).
- [`web-interface-guidelines-review.md`](./web-interface-guidelines-review.md) —
  Vercel Web Interface Guidelines (a11y, forms, focus, animation,
  typography, performance, i18n).

Both start with a prioritized recommendations table (most impactful first),
followed by a compliance matrix that shows which rules were checked and
pass / fail per rule, so you can read it as both "what to fix next" and
"what the skill actually audits."

Scope: only the web client (`src/client/**`). CLI and server are out of
scope for these skills.

> **Repo rule reminder.** We're abiding to the workspace's
> `no-backward-compatibility` rule — every recommendation in these docs
> can land as a direct edit (no wrappers, no compat shims) since the
> project is in initial development.
