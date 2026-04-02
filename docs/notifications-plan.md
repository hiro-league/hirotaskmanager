# Notifications plan

Add a lightweight notification center to the app header so users can see recent board, list, and task changes, including changes triggered through the `hirotm` CLI.

## Goals

- Show a notification bell in the top-right app header.
- Show an unread badge count on the bell.
- Let users click the bell to open a compact notification panel.
- Persist notifications so they survive page reloads and server restarts.
- Reflect CLI-driven create, update, and delete actions in the app without requiring manual refresh.
- Keep the CLI as an HTTP client over the local API. It should not write SQLite directly.

## Non-goals

- Multi-user notification delivery or per-user inboxes.
- Push notifications outside the local app window.
- Rich notification rules, mentions, or subscriptions.
- Full audit log coverage for every field-level change.

## Confirmed design decisions

- Notifications persist in SQLite on the server, not only in React state.
- Real-time delivery should use Server-Sent Events (SSE), not WebSockets.
- The UI should use a standard bell + badge + popover pattern in the header.
- The app should treat persisted notifications as the source of truth and SSE as the live delivery channel.
- For this local single-user app, a single read state per notification is enough; per-user read tracking can wait.
- This is better framed as a lightweight activity feed presented in a notifications UI.

## Why this design

- Persisting rows in SQLite preserves notifications when the UI is closed or disconnected.
- SSE is a good fit because this feature only needs server-to-client updates.
- The current app already uses HTTP routes plus React Query, so SSE can layer on top without changing the existing data flow.
- Because the CLI already talks to the local API, server-side notification creation will automatically cover both UI and CLI mutations.

## Proposed UX

- Add a bell button to `src/client/components/layout/AppHeader.tsx`.
- Render a badge when there are unread notifications.
- Open a popover or small panel on click.
- Show newest notifications first.
- Support mark-as-read and mark-all-as-read.
- Start with compact text entries such as:
  - `Board created: Marketing roadmap`
  - `List renamed: Backlog -> Ideas`
  - `Task deleted: Fix drag overlay`

## Proposed data model

Add a server-side table such as `notification_event` with fields along these lines:

- `id`
- `kind` such as `board.created`, `board.updated`, `list.deleted`, `task.updated`
- `boardId` nullable
- `listId` nullable
- `taskId` nullable
- `message`
- `source` such as `cli`, `ui`, or `system`
- `createdAt`
- `readAt` nullable

Notes:

- Store enough display text in the row so delete notifications remain readable after the entity is gone.
- Keep the initial schema simple; avoid premature normalization.

## Proposed API

Add read/write endpoints for the notification feed:

```http
GET /api/notifications
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
GET /api/events
```

Expected behavior:

- `GET /api/notifications` returns recent notifications in reverse chronological order.
- `PATCH /api/notifications/:id/read` marks one notification as read.
- `PATCH /api/notifications/read-all` clears the unread badge in one action.
- `GET /api/events` opens an SSE stream for live notification delivery.

## Event creation rules

Create a notification on successful server-side mutations for:

- board create, rename, delete
- list create, rename/update, delete
- task create, update, delete

Guidelines:

- Emit notifications from the server after the mutation succeeds.
- Prefer centralizing notification creation close to storage or route-level mutation handling so both CLI and UI writes are covered.
- Include `source = cli` when the server can identify the CLI as the caller; otherwise start with a generic source and add caller metadata later.

## Client integration

- Fetch the initial notification list through React Query.
- Open an `EventSource` connection to `/api/events` after app startup.
- On incoming notification events:
  - append the new notification to the cached list, or
  - invalidate the notifications query and refetch
- Update the unread badge from the cached notification state.

Recommended UI building blocks:

- `lucide-react` bell icon
- Tailwind badge styling
- Radix or shadcn `Popover` for the notification panel

## Current codebase touchpoints

- Header UI lives in `src/client/components/layout/AppHeader.tsx`.
- App-level provider composition lives in `src/client/App.tsx`.
- Board, list, and task write routes live in `src/server/routes/boards.ts`.
- Shared server exports live in `src/server/storage/index.ts`.
- The server entrypoint lives in `src/server/index.ts`.
- The CLI already uses the local HTTP API in `src/cli/index.ts`.

## Brief execution plan

1. Add a migration and storage module for persisted notification rows.
2. Add notification read APIs plus an SSE endpoint on the server.
3. Emit notification rows from successful board, list, and task mutations.
4. Add a small client API layer and React Query hooks for notifications.
5. Add a header bell with unread badge and popover panel.
6. Subscribe the client to SSE and merge or refetch on incoming events.
7. Verify that CLI-triggered mutations appear in the open app and also persist across reloads.

## Open question

The only product choice still worth confirming is whether reorder-only changes should generate notifications. My default recommendation is no, to avoid noisy updates.
