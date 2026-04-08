# Notifications design

**Related documents**

- [Notifications requirements](./notifications-requirements.md) — core product and architecture requirements.
- [Notifications plan](./notifications-plan.md) — phased execution plan.
- [Multi-writer sync design](./multi-writer-sync-design.md) — existing sync/event foundation for open board convergence.
- [hirotm CLI — Design Document](./ai-cli-design.md) — existing CLI and HTTP/API assumptions.

This document describes the target technical design for adding a persisted notification center to TaskManager without replacing the existing multi-writer sync model.

## Design summary

- Keep multi-writer sync and notifications as related but separate concerns.
- Persist notification records in SQLite so the feed survives reloads and restarts.
- Add a dedicated notification SSE channel for live feed and toast updates.
- Generate notification rows on the server after successful supported mutations.
- Keep React Query as the client cache owner for the notifications feed and unread count.
- Render a global bell in the header, a panel with first-row controls, and bottom-right toast cards for newly arrived items.
- Treat notification conversion rules as part of server notification creation, not as a separate end-user feature.

## Current architecture

TaskManager already has part of the foundation needed for notifications, but that foundation is focused on board-state convergence rather than activity history.

### Browser

- `src/client/components/layout/AppHeader.tsx`
  - header mount point exists but has no notification bell yet
- `src/client/api/queries.ts`
  - already provides standard React Query fetch helpers and cache patterns
- `src/client/api/useBoardChangeStream.ts`
  - board pages already subscribe to server events for board/list/task convergence
- `src/client/App.tsx`
- `src/client/components/layout/AppShell.tsx`
  - app shell is the right place for a global notification provider and toast layer

### Server

- `src/server/events.ts`
  - already hosts a lightweight in-process SSE pub/sub system
- `src/server/index.ts`
  - already exposes `GET /api/events`
- `src/server/routes/boards.ts`
  - already publishes board/list/task change events after successful writes

### CLI

- `src/cli/lib/api-client.ts`
  - already sends `X-TaskManager-Client: hirotm`
- `src/shared/boardCliAccess.ts`
  - already defines the shared client header contract

## Target architecture

The day-one notification design separates three concerns:

1. **Board sync model** — existing board-scoped SSE for open page convergence.
2. **Notification history model** — persisted notification rows in SQLite.
3. **Notification delivery model** — global SSE updates for feed refresh and toast cards.

Notifications should build on the existing sync foundation, not replace it.

## Why notifications should be separate from board sync

Board sync answers "how does the page converge to current state?"

Notifications answer:

- what changed
- where it changed
- who or what changed it
- when it happened

That difference matters because:

- board sync can remain board-scoped while notifications are global by default
- board sync payloads are optimized for cache repair, not user-facing text
- notification history must survive deletes and reloads
- notification toasts should be driven by newly created feed items, not by generic board invalidation events

## Notification data model

Add a server-side table such as `notification_event`.

### Recommended fields

```ts
interface NotificationEventRow {
  id: number;
  createdAt: string;
  readAt: string | null;
  boardId: number | null;
  listId: number | null;
  taskId: number | null;
  entityType: "board" | "list" | "task";
  actionType: string;
  sourceType: "ui" | "cli" | "system" | "api";
  clientId: string | null;
  clientName: string | null;
  clientInstanceId: string | null;
  message: string;
  payloadJson: string;
}
```

### Design notes

- `message` stores stable, user-friendly text so historical entries remain readable after deletes or renames.
- `payloadJson` stores structured display context for icons, deep links, formatting, and future features.
- `clientInstanceId` remains useful for toast suppression and future diagnostics, but the day-one own-write filter is defined product-wise as hiding web-app (`ui`) writes.
- `entityType` and `actionType` should be explicit rather than inferred later from free-form message text.

### Snapshot fields inside `payloadJson`

Store enough context to render historical entries even if related rows are later deleted or renamed. For example:

- board name and emoji at the time of the event
- list name and emoji at the time of the event
- task title at the time of the event
- source label such as `Cursor Agent`
- action metadata such as before/after values where useful

The structured payload should be additive, not overly normalized.

## Source identification model

The current shared client header already identifies `hirotm`.

### Recommended request metadata

- `X-TaskManager-Client`
  - machine-readable client id such as `hirotm` or `web`
- `X-TaskManager-Client-Name`
  - human-friendly label such as `Web App`, `hirotm`, or `Cursor Agent`
- `X-TaskManager-Client-Instance`
  - unique client/session identifier used for toast suppression, diagnostics, and future per-instance behaviors

### Display source taxonomy

Persisted source storage can stay broader than the user-facing source taxonomy.

Recommendation:

- continue storing low-level request/source metadata such as `ui`, `cli`, `system`, and internal fallback values when useful
- present those values in the UI as a simpler display taxonomy centered on `user`, `cli`, and `system`
- avoid exposing transport-oriented fallback labels such as `api` as a first-class product concept unless that becomes intentional later

This keeps the data model flexible without forcing the UI to teach unnecessary source categories.

## Event creation rules

Create a notification after successful server-side mutations for:

- board create, rename/update, delete
- list create, rename/update, delete, reorder
- task create, update, move, reorder, delete

Guidelines:

- create notifications only after the server-side mutation commits successfully
- create notifications centrally from server write paths, not from browser-only code
- preserve enough snapshot data for deleted entities
- prefer one notification row per successful write in v1
- explicit exclusions are part of the conversion rules, not a separate muting subsystem
- do not persist notifications for board preference updates such as view-preference changes
- do not persist notifications for same-list/same-destination move noise that does not represent a meaningful location change

### Task-update classification

Avoid a single generic `task.updated` experience for all task edits.

Recommendation:

- emit first-class task notifications for status changes such as completed, in progress, and reopened
- emit first-class task notifications for priority changes, including before/after wording when available
- emit first-class task notifications for group changes, including before/after wording when available
- fall back to a generic task-updated notification for title/body/color/emoji and other uncategorized edits

This classification should be decided on the server while the mutation diff/context is still available.

## Formatting model

Use a two-layer formatting approach.

### Server-side formatter

Responsibility:

- convert mutation results plus request metadata into a canonical notification row
- build the stable `message`
- build `payloadJson` with snapshot fields and display metadata

Why:

- both browser and CLI writes should produce consistent notification records
- delete events must remain understandable even when entity rows are gone

### Client-side presentation helper

Responsibility:

- map notification data to Lucide icons
- choose color treatments
- compute deep-link targets
- format timestamps into contextual wording such as `now`, `a min ago`, `3:35 PM`, and `yesterday`

Why:

- the server should not depend on client icon components
- the browser needs control over theme-aware presentation and navigation behavior

## API surface

### Recommended endpoints

```http
GET /api/notifications
PATCH /api/notifications/read-all
GET /api/notifications/events
```

Optional later:

```http
PATCH /api/notifications/:id/read
```

### Feed query shape

`GET /api/notifications` should support:

- `scope=all|board`
- `boardId=<id>` when `scope=board`
- `includeOwn=true|false`
- `limit=<n>`
- `cursor=<opaque>`

### Recommended response envelope

```ts
interface NotificationsPage {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}
```

Notes:

- unread count should represent the product badge semantics rather than a naive count of every unread row
- for the current product direction, the red badge should track unread external notifications (`cli` + `system`) after conversion-rule exclusions are applied
- the first implementation can avoid complex pagination logic if a small bounded page is enough

## SSE delivery model

Do not reuse `GET /api/events` for notifications.

### Recommendation

- keep `GET /api/events` for board convergence
- add `GET /api/notifications/events` for global notification delivery

### Why separate channels are better

- notification events are global while board sync events are often board-scoped
- notification SSE is consumed by the app shell, not only board pages
- the payloads and failure handling differ

### Suggested SSE event types

- `notification-created`
- optional later: `notifications-read`

### Suggested live payload

```ts
interface NotificationCreatedEvent {
  kind: "notification-created";
  notification: NotificationItem;
  unreadCount: number;
}
```

The live payload should include the newly created notification row so the client can:

- prepend it to the cached feed immediately
- update the unread count badge immediately
- decide whether to show a toast card immediately
- keep panel and toast semantics aligned so they do not disagree about source/type meaning

## Server-side flow

For a supported successful write:

1. perform the mutation
2. build the notification input from mutation result plus request metadata
3. insert the `notification_event` row
4. prune stored history back to the retention limit
5. publish `notification-created` on the notification SSE channel
6. continue publishing board sync events on the existing board SSE channel where needed

This keeps notifications and board sync coordinated without coupling them into one channel.

## Retention model

The feed should keep only the newest 1000 notifications.

### Recommendation

- define one central app constant for notification retention
- prune after inserts on the server

Why:

- retention must not rely on client cleanup
- the server owns persisted history

## Client data model

React Query should remain the source of rendered notification state.

### Recommended queries

- `["notifications", "feed", scope, boardId, includeOwn]`
- `["notifications", "unread-count"]`

### Why separate unread count query may still help

Even if the feed response includes `unreadCount`, a dedicated key makes it easy to:

- update the badge independently
- avoid coupling badge rendering to one feed filter variant
- keep badge semantics distinct from the visible list when the badge intentionally tracks only external notifications

The implementation can still hydrate both from the same network response when practical.

## Client composition

### App shell

Mount notification ownership high in the tree:

- add a notification provider or controller near `src/client/App.tsx`
- keep the toast stack near `src/client/components/layout/AppShell.tsx`
- add the bell trigger to `src/client/components/layout/AppHeader.tsx`

### Panel

Use a popover/dropdown-style panel in the header with:

1. first-row settings bar
2. newest-first notification list
3. empty state when nothing matches the current filters

### First-row settings bar

Day-one controls:

- `Boards: All / Current`
- `Hide own writes`

These controls should live inside the panel as the first row, per requirements.

## Toast/card notification model

Bottom-right cards should be a live-only presentation of newly arrived notifications.

### Recommended behavior

- show cards only for SSE-arrived `notification-created` events
- do not replay historical rows as toasts on initial feed load
- cap the visible stack to a small number such as 3
- auto-dismiss after a short delay
- clicking a toast should open the panel or navigate to the target entity
- suppress or reduce toast noise when the notification panel is already open
- keep iconography, time formatting, and source/entity labeling consistent with the panel rows

### Why cards should be derived from persisted notifications

Toasts should not be a separate domain model. They should reuse the same notification item that is inserted into the feed.

## Unread/read model

Use one global read state per notification row in v1.

### Day-one behavior

- unread badge count follows the external-notification product rule (`cli` + `system`)
- opening the panel marks unread notifications as read

This remains intentionally simple for a local single-user app.

## Navigation model

When the related entity still exists, notifications should link to it.

Examples:

- board change -> navigate to that board
- task change -> navigate to that board, scroll to the task, and select it when practical
- list change -> navigate to that board, scroll to the list, and select it when practical

If the entity no longer exists:

- keep the historical entry visible
- omit or disable the deep link gracefully

### Hidden-target fallback

If a task notification targets a task that exists but is currently hidden by board UI state, the client may fall back to opening the task editor/view so the notification still lands somewhere useful.

## Presentation model

Keep the existing action-icon structure and make surgical presentation changes around it.

Recommended row composition:

- leading action icon remains the primary visual treatment for create/update/delete/move/reorder/completion
- add a small entity icon inline before the main message text to distinguish board/list/task at a glance
- keep source indication on the metadata line, but replace ambiguous source visuals with clearer source-specific icons and colors

Suggested source presentation:

- `cli` -> bot-style icon, red treatment
- `user`/`ui` -> user-style icon, blue treatment
- `system` -> neutral system/bell treatment unless stronger semantics are introduced later

## Recommended client utilities

Add small focused helpers rather than one large component file.

Suggested areas:

- notification API client
- notification query keys/hooks
- notification time formatter
- notification message/presentation mapper
- notification toast state/controller

## Scalability model

The notification system should remain lightweight even on large boards.

That means:

- store small rows, not full board payloads
- publish one notification item, not a full feed reload, on live events
- query feed pages by limit/cursor rather than loading unbounded history
- keep notification rendering separate from board render performance

## Future items

These items should stay out of the day-one design and implementation phases:

- per-user inboxes and read state
- advanced notification preferences and rules
- automatic collapsing or deduping of repeated events
- richer failure/system notifications
- desktop or OS notification center integration
- more advanced toast policy such as quiet hours or severity-based behavior
