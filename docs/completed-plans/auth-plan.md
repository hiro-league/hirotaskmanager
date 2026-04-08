# Auth Plan

This document breaks the auth and CLI-access work into two phases. Product intent lives in the requirements doc; technical shape lives in the design doc.

**Related documents**

- [Auth requirements](./auth-requirements.md) — what must be true when this is done.
- [Auth design](./auth-design.md) — target architecture, data model, API shape, and request classification.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI contract and transport assumptions.

## Suggested order

1. Phase 1 — Setup, login, recovery, and session foundation
2. Phase 2 — CLI authorization model and provenance rollout

---

## Phase 1: Setup, login, recovery, and session foundation

**Goal:** Put a real auth boundary in front of the web app and full API surface before changing the CLI permission model.

### Checklist

- [ ] Add an auth state store outside the repo working tree.
- [ ] Define auth helpers for passphrase hashing, recovery-key hashing, and session-token hashing.
- [ ] Add server startup logic that detects whether auth is initialized.
- [ ] Add setup mode behavior for uninitialized installs.
- [ ] Add `GET /api/auth/session`.
- [ ] Add `POST /api/auth/setup`.
- [ ] Add `POST /api/auth/login`.
- [ ] Add `POST /api/auth/logout`.
- [ ] Add `POST /api/auth/recover/reset-passphrase`.
- [ ] Add auth/request-classification middleware that resolves `web` vs `cli`.
- [ ] Add a persistent HttpOnly session cookie for successful login.
- [ ] Invalidate active sessions on logout and passphrase reset.
- [ ] Add setup UI and login UI in the client.
- [ ] Gate the normal app shell behind the authenticated session check.
- [ ] Keep auth enabled in standard dev flows instead of adding a dev-only bypass.

### Exit criteria

- A fresh install requires setup before the app can be used.
- The user can set a passphrase and is shown a recovery key once.
- The web app requires login and receives a persistent session after successful login.
- The recovery key can reset the passphrase and invalidate prior sessions.
- Full-access web behavior is no longer available without the browser session cookie.

### Notes

- This phase establishes the core trust boundary.
- The CLI may temporarily remain coarse during this phase, but it must no longer be able to act as an implicit full-access caller.

---

## Phase 2: CLI authorization model and provenance rollout

**Goal:** Replace the coarse CLI access model with the finalized permission set and persist creator provenance needed for CLI-created-only operations.

### Checklist

- [ ] Add creator provenance fields to `board`, `list`, and `task`.
- [ ] Backfill or default existing rows to a sensible creator principal type.
- [ ] Add a singleton global CLI policy store for `create_board`.
- [ ] Add board-scoped CLI policy storage for the finalized permissions.
- [ ] Replace the current coarse `cli_access` model in server reads/writes.
- [ ] Add server helpers that evaluate CLI policy consistently across routes.
- [ ] Treat `manage_any_tasks` as implying `manage_cli_created_tasks`.
- [ ] Treat `manage_any_lists` as implying `manage_cli_created_lists`.
- [ ] When the CLI creates a board, default that board to full board-scoped CLI access.
- [ ] Make CLI policy mutation web-only.
- [ ] Make auth-management routes web-only.
- [ ] Update board, list, task, search, notification, and SSE routes to enforce the new `web` vs `cli` model.
- [ ] Continue sending CLI identity headers for provenance/notifications, but stop treating them as security credentials.
- [ ] Surface creator/source information where needed, including task creator display.
- [ ] Update docs and CLI help so automation callers understand the new access model.

### Exit criteria

- Unauthenticated local callers are consistently treated as the CLI principal.
- CLI permissions are enforced using the finalized small permission set.
- CLI-created-only task/list operations work correctly through stored provenance.
- CLI-created boards bootstrap with full board-scoped CLI access.
- Web-only routes stay unreachable to the CLI principal.
- SSE no longer leaks data outside the caller's effective access level.

### Notes

- This phase is where the "useful but bounded automation" story becomes real.
- The CLI keeps using the same HTTP transport; only the server's trust and authorization model changes.

---

## Recommended ship sequence

### Milestone A

- Phase 1

Result:

- TaskManager gains a real authenticated web session boundary and recovery flow.

### Milestone B

- Phase 2

Result:

- TaskManager gains a clean CLI permission model with provenance-backed ownership rules.

## Risks to watch

- Accidentally leaving setup or login loopholes after auth is initialized.
- Treating client headers as security credentials after the session model ships.
- Forgetting to enforce auth/CLI rules on SSE endpoints.
- Using exact client names for ownership checks even though those names are spoofable.
- Letting development bypasses drift away from production semantics.
- Migrating from the current coarse `cli_access` model without a clear compatibility path.

## Future items

These are intentionally outside the planned phases above:

- direct SQLite encryption or SQLCipher adoption
- stronger protection against local file/database access
- OS-credential-store integration for app secrets
- richer session-management UI
- multi-user auth or role systems
