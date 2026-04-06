# Auth Design

## Overview

This document describes the target design for adding passphrase-based web authentication and scoped CLI access to TaskManager.

The design assumes a single-user local app with two trust levels:

- `web` — the human user with a valid authenticated browser session
- `cli` — any local caller without a valid browser session, including `hirotm`, AI agents, and direct local HTTP callers

The main boundary is the browser session cookie. A caller that cannot present that cookie must never receive full web-user access.

## Related documents

- [Auth requirements](./auth-requirements.md) — what must be true when this work is done.
- [Auth plan](./auth-plan.md) — phased execution plan.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI contract and transport assumptions.

## Goals

- Require login before the web app can access the main product surface.
- Preserve a useful automation path for `hirotm` and AI agents without giving them full control.
- Keep the authorization model small enough to reason about.
- Support recovery-key-based passphrase reset.
- Keep development behavior close to production.

## Non-goals

- Multi-user auth.
- Username/password accounts.
- CLI API keys or dedicated CLI bearer tokens.
- Database encryption or hardening against direct file access in this phase.

## High-level model

### Principal types

TaskManager treats requests as one of these principals:

- `web` — request has a valid session cookie; full access
- `cli` — request does not have a valid session cookie; limited by CLI policy
- `system` — internal server-created records such as migrations or future automated system actions

### Trust model

- The browser session cookie is the only credential that grants full access.
- `hirotm` does not receive a separate auth token in v1.
- The CLI permission model is the enforcement boundary for agent access.
- Client identity headers remain useful for provenance and notifications, but are not security credentials.

### Why no CLI token

The primary threat model is AI coding agents running on the same machine. A file-based CLI token would be readable by those agents and would not add meaningful protection. The simpler and stronger design is:

- valid session cookie => `web`
- no valid session cookie => `cli`

That means an agent may call the API directly, but only with CLI-equivalent privileges.

## Authentication flow

### 1. Setup mode

If auth has not been initialized yet, the server runs in setup mode.

Allowed behavior in setup mode:

- `GET /api/health`
- setup endpoints needed to initialize auth
- the minimal app/setup UI needed to complete setup

Blocked behavior in setup mode:

- normal board/list/task routes
- login/logout routes that require initialized auth

### 2. Initial setup

Setup is interactive and initiated by the user.

Flow:

1. User provides a passphrase.
2. Server generates a recovery key.
3. Server shows the recovery key once in the terminal/console.
4. Server stores only hashed verification data for the passphrase and recovery key.
5. Server marks auth as initialized.

Important design rule:

- The plaintext recovery key is never persisted in normal app-readable storage after setup.

### 3. Login

Login is passphrase-based.

Flow:

1. Browser submits passphrase to `POST /api/auth/login`.
2. Server verifies the stored passphrase hash.
3. Server generates a random session token.
4. Server stores only the session token hash in auth state.
5. Server sets the raw session token in an HttpOnly cookie.

This keeps the raw session secret out of the project files and out of browser JavaScript.

### 4. Session behavior

- Sessions do not expire automatically in v1.
- `POST /api/auth/logout` clears the browser cookie and invalidates the active stored session token.
- Passphrase reset rotates session state so prior cookies stop working.

### 5. Recovery

Recovery is reset-only.

Flow:

1. User submits recovery key plus a new passphrase.
2. Server verifies the recovery key hash.
3. Server stores the new passphrase hash.
4. Server clears or rotates active session state.
5. User logs in again with the new passphrase.

The recovery key does not reveal the old passphrase and does not need to log the user in directly.

## Auth state storage

### Location

Auth state should live outside the repo working tree and outside `~/.hirotm/config`.

Recommended location:

- `~/.taskmanager/auth/auth.json`

This keeps auth state separate from application board data and separate from CLI config intended for agents.

The auth store should be created with user-only file permissions where the platform supports that behavior.

### Contents

The auth store only needs a small set of values:

```json
{
  "version": 1,
  "initializedAt": "2026-04-05T12:00:00.000Z",
  "passphraseHash": "...",
  "recoveryKeyHash": "...",
  "activeSessionTokenHash": "..."
}
```

Notes:

- hashes should use Bun's password hashing support rather than custom crypto
- plaintext passphrases are never stored
- plaintext recovery keys are never stored
- plaintext session tokens are never stored server-side

## Cookie design

Use a single session cookie for the authenticated browser.

Recommended properties:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` when served over HTTPS; omitted for normal localhost HTTP

Because the cookie is HttpOnly, it is not available to browser JavaScript and cannot be copied by routine client-side code.

## API design

### Auth endpoints

Recommended endpoints:

- `GET /api/auth/session`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/recover/reset-passphrase`

Suggested behavior:

- `GET /api/auth/session` returns whether auth is initialized and whether the caller currently has a valid web session
- `POST /api/auth/setup` only works before initialization
- `POST /api/auth/login` only works after initialization
- `POST /api/auth/logout` only works for an authenticated web session
- `POST /api/auth/recover/reset-passphrase` only works with a valid recovery key

### Request classification middleware

Add a server middleware/helper that computes auth context early for each request:

1. If auth is not initialized:
   - allow only setup-safe routes
   - reject normal app routes
2. If a valid session cookie is present:
   - principal = `web`
3. Otherwise:
   - principal = `cli`

This auth context should be attached to the request and used by downstream routes.

### Route policy

Route classes should be:

- public/setup-safe
- web-only
- shared app routes with CLI authorization checks

Examples:

- `GET /api/health` => public
- `POST /api/auth/setup` => setup-safe
- `POST /api/auth/recover/reset-passphrase` => dedicated recovery-safe route that requires the recovery key and does not participate in normal CLI authorization
- `GET /api/boards/:id` => shared route, checked against `web` full access or `cli` board policy
- `PATCH /api/boards/:id/cli-access` => web-only

## CLI authorization model

### Permission set

To keep the model small, use one global permission plus board-scoped permissions.

Global permission:

- `create_board`

Board-scoped permissions:

- `read`
- `create_tasks`
- `manage_cli_created_tasks`
- `manage_any_tasks`
- `create_lists`
- `manage_cli_created_lists`
- `manage_any_lists`
- `manage_structure`
- `delete_board`

Derived rules:

- `manage_any_tasks` implies `manage_cli_created_tasks`
- `manage_any_lists` implies `manage_cli_created_lists`
- `manage_structure` covers task groups and priorities

### Why board deletion is board-scoped

The earlier draft included global "delete own boards" and "delete all boards" permissions. This design intentionally collapses board deletion into a board-scoped `delete_board` flag.

Reasons:

- it keeps the permission model smaller
- it matches how users think about granting CLI access on a board-by-board basis
- it lets a CLI-created board bootstrap with full access, including deletion, without adding a second deletion axis

### Default for CLI-created boards

If `create_board` is enabled and the CLI creates a board:

- the new board's creator provenance is recorded as `cli`
- the new board receives a full board-scoped CLI policy by default

That means the CLI can immediately continue working within the board it just created, without requiring a separate web-side policy edit.

## Ownership and creator provenance

### Why provenance is required

Permissions like `manage_cli_created_tasks` and `manage_cli_created_lists` require persistent creator metadata.

### Required fields

Boards, lists, and tasks should all record:

- `createdByPrincipalType` — `web`, `cli`, or `system`
- `createdByLabel` — nullable display string such as `User` or `Cursor Agent`

Task creator/source display can use the same provenance fields directly.

### Ownership semantics

"CLI-created" does not mean "created by this exact client name" or "created by this exact process instance."

It means:

- `createdByPrincipalType === "cli"`

This is deliberate because exact client names and instance ids are advisory metadata and can be spoofed by any unauthenticated local caller.

## Persistence model

### Auth state

Keep auth state in the separate auth store, not in `taskmanager.db`.

### CLI policy

Store CLI policy in the main application database because it is not secret product data.

Recommended shape:

- singleton `cli_global_policy` table for global flags such as `create_board`
- `board_cli_policy` table keyed by `board_id` for board-scoped flags

This is easier to query and migrate than trying to overload the current coarse `board.cli_access` string.

## Client and UI behavior

### Web app

- On startup, the client checks `GET /api/auth/session`.
- If auth is uninitialized, route to setup UX.
- If initialized but unauthenticated, route to login UX.
- If authenticated, load the normal app shell.
- Logout clears client state and returns to login UX.

### CLI

- `hirotm` continues to call the same HTTP API on localhost.
- `hirotm` does not need to manage a secret auth token in v1.
- CLI commands that hit web-only routes should receive a clear authorization error.
- CLI identity headers should still be sent so notifications and provenance stay useful.

## SSE behavior

SSE endpoints must use the same auth context as normal routes.

Rules:

- authenticated browser session => full SSE access allowed
- unauthenticated caller => CLI-equivalent SSE access only
- board SSE should reject connections when the CLI principal lacks `read` for that board
- notification SSE should not leak notifications that the CLI principal should not see

## Development behavior

Auth should stay enabled in development.

Recommended approach:

- keep login/setup/session logic active under both `bun run dev` and production
- continue using the Vite proxy for normal `/api` calls
- for SSE in dev, prefer same-origin behavior when possible; if Bun SSE proxy behavior still requires direct API-origin EventSource usage, enable credentialed requests and matching CORS settings rather than bypassing auth

This keeps the dev loop close to production while still respecting current Bun/Vite SSE constraints.

## Migration notes

Expected migration work:

- add creator provenance columns to `board`, `list`, and `task`
- add CLI policy tables
- stop treating `X-TaskManager-Client` as a security boundary
- replace the current coarse `cli_access` model with the new policy model

## Future scope

These items are intentionally deferred:

- direct SQLite encryption or SQLCipher
- OS-keychain-backed unlocking of auth or database state
- stronger protection against direct file/database access by local processes
- multiple concurrent named web sessions or session management UI
