# Authentication and CLI Access Requirements

This document captures the core product and architecture requirements for adding authentication and scoped CLI access to TaskManager.

## Related documents

- [Auth design](./auth-design.md) — target architecture, data model, API shape, and request classification.
- [Auth plan](./auth-plan.md) — phased execution plan.
- [hirotm CLI — Design Document](./ai-cli-design.md) — existing CLI contract and localhost API assumptions.

## Problem statement

TaskManager currently trusts any caller that can reach the local HTTP API. The web app does not require login, and the CLI access model is currently too coarse for the intended AI-agent use case.

Today:

- the web app can be opened without a login step
- the API does not distinguish a trusted human web session from an untrusted local automation caller
- the current CLI access model is board-level and coarse rather than capability-based
- there is not enough creator provenance to support "CLI-created only" permissions cleanly
- recovery from forgotten auth is not defined

As a result, AI coding agents running on the same machine can currently access more of the product surface than intended.

## Scope

This effort covers:

- first-run setup that initializes app auth
- passphrase-based login for the web app
- recovery-key-based passphrase reset
- a persistent browser session for the human web user
- API request classification between full-access web sessions and CLI-equivalent callers
- a small, explicit CLI permission model
- web-only management of CLI access rules
- creator provenance needed for CLI-created entity permissions
- development behavior that keeps auth enabled and close to production semantics

This effort does not require:

- multi-user accounts
- usernames, invites, or role-based access control
- expiring sessions by default
- CLI tokens or API keys in v1
- direct database/file hardening beyond normal app-managed storage
- encryption or protection against direct SQLite file access

## Product intent

- TaskManager is still a single-user local app.
- The human using the web app is the trusted full-access actor.
- The browser must require login before exposing the app UI or full API behavior.
- Local automation, including AI coding agents, must be treated as a lower-trust CLI principal unless they have a valid web session cookie.
- CLI access should be useful but intentionally bounded by explicit permissions configured from the web app.
- Recovery must be possible without weakening the main auth boundary.

## Core requirements

### Functional

- On first run, TaskManager must enter setup mode until auth is initialized.
- Setup must prompt the user for a passphrase.
- Setup must generate a recovery key and display it once in the terminal/console.
- The plaintext recovery key must not be stored in a normal app-readable location after setup completes.
- The system must store only a verification form of the recovery key.
- The user must be told to save the recovery key outside the app on a separate trusted device or storage system.
- Once auth is initialized, TaskManager must not allow resetting auth without the recovery key.
- The web app must require login with the configured passphrase before showing the main app shell.
- Successful login must create a persistent browser session so the user does not need to re-enter the passphrase on every page load.
- Sessions must not expire automatically in v1.
- The app must provide logout, after which the user must log in again with the passphrase.
- Providing the correct recovery key must allow resetting the passphrase.
- Passphrase reset must invalidate active browser sessions.

### API auth and request classification

- The API must distinguish between a valid human web session and a request without that session.
- A request with a valid web session must be treated as the `web` principal and have full access.
- A request without a valid web session must be treated as the `cli` principal rather than as a trusted web user.
- The CLI and any direct local HTTP caller without a valid web session must be subject to the same CLI permission rules.
- Client headers such as `X-TaskManager-Client` and `X-TaskManager-Client-Name` may identify the caller for display/audit purposes, but they must not grant elevated access.
- Auth-management endpoints must be unavailable to the CLI principal.
- CLI-access-management endpoints must be unavailable to the CLI principal.
- SSE endpoints must enforce the same auth and CLI permission rules as normal HTTP endpoints.

### CLI permission model

- The web principal must always have full access.
- The CLI permission model must stay deliberately small and explicit.
- The only global CLI permission in v1 must be `create_board`.
- Board-scoped CLI permissions in v1 must be:
- `read`
- `create_tasks`
- `manage_cli_created_tasks`
- `manage_any_tasks`
- `create_lists`
- `manage_cli_created_lists`
- `manage_any_lists`
- `manage_structure`
- `delete_board`
- `manage_structure` must cover editing the board's task groups and task priorities.
- `manage_any_tasks` must imply `manage_cli_created_tasks`.
- `manage_any_lists` must imply `manage_cli_created_lists`.
- If the CLI is allowed to create a board, a newly CLI-created board must default to full board-scoped CLI permissions.
- CLI access rules must be configurable only from the web app.

### Creator provenance and ownership semantics

- The system must persist creator provenance for boards, lists, and tasks.
- The system must preserve at least the creator principal type (`web`, `cli`, or `system`) and a human-friendly creator label when available.
- CLI permission checks must not rely on exact client names or per-instance identifiers for ownership decisions.
- In the CLI permission model, "CLI-created" must mean "created by the CLI principal type," not "created by this exact agent name or process instance."
- The product must expose task creator/source information so users can tell whether a task came from the web app or the CLI.

### Development behavior

- Auth must remain enabled in normal development flows.
- Development behavior should stay as close to production as practical.
- The app must not rely on a dev-only auth bypass for day-to-day development.

### Non-functional

- The design must work on Windows, macOS, and Linux.
- The design must fit the current Bun + Hono + React + SQLite architecture.
- The CLI must continue to use the HTTP API rather than touching SQLite directly.
- The design must leave room for future database/file hardening without requiring it in v1.

## Canonical data ownership

- The browser session is the source of full-access human authentication.
- The HTTP API remains the only supported mutation path for app data.
- CLI access is an authorization layer on top of the normal API, not a separate data path.
- Auth secrets must be managed separately from normal board/list/task application data.
- Creator provenance must be captured by the server at write time rather than inferred later.

## Required user experience

- A first-time user should be guided through setup before using the app.
- A user should be shown a recovery key once and clearly warned to save it.
- A returning user should see a login screen before accessing the app.
- A logged-in user should stay logged in until they explicitly log out or reset the passphrase.
- A user should be able to manage CLI access only from the authenticated web UI.
- A user should be able to grant useful CLI permissions without granting full control.
- A user should be able to tell whether a task was created from the web app or by the CLI.

## Compatibility requirements

- The feature must work for the browser, `hirotm`, and direct local callers that behave like the CLI principal.
- The design must allow `hirotm start` to keep working without granting web-user privileges.
- The design must remain compatible with the current client identity headers used for notifications and provenance.

## Non-goals

- Multiple named human users.
- Sharing sessions across devices as a product feature.
- API keys for the CLI.
- Separate CLI authentication distinct from the CLI permission model.
- Direct SQLite encryption, SQLCipher adoption, or OS keychain-backed database unlocking in v1.

## Success criteria

- A new install requires setup before the app can be used.
- The web app requires passphrase login.
- The browser receives a persistent session after successful login.
- The recovery key can reset the passphrase and invalidate active sessions.
- A caller without a valid web session is limited to CLI-equivalent access.
- CLI access can be granted per board using the small permission set above.
- CLI-created boards bootstrap with full board-scoped CLI access.
- Task creator/source information is available for user understanding and for permission evaluation.
- Auth stays enabled during normal development instead of only in production-like builds.
