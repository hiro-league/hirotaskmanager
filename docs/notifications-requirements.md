# Notifications requirements

This document captures the core product and architecture requirements for adding a lightweight notification center to TaskManager so users can see recent board, list, and task changes across the app.

## Related documents

- [Notifications design](./notifications-design.md) — target technical design, data model, and API/client flow.
- [Notifications plan](./notifications-plan.md) — phased execution plan.
- [Multi-writer sync requirements](./multi-writer-sync-requirements.md) — sync foundation that keeps open pages converged after external writes.
- [hirotm CLI — Design Document](./ai-cli-design.md) — existing CLI and HTTP/API assumptions.

## Problem statement

TaskManager is gaining multiple ways to mutate data, including the web app and `hirotm`. Multi-writer sync solves state convergence for open pages, but it does not give users a clear, persistent activity feed for understanding what changed recently.

Today:

- users do not have a dedicated notifications center in the app shell
- there is no persisted notification feed that survives reloads and restarts
- there is no unread badge or lightweight inbox behavior in the header
- server-side writes can change board state without leaving behind a user-friendly activity record

As a result, users may see updated state after sync, but they still lack a simple way to answer "what changed?" and "where did it happen?"

## Scope

This effort covers:

- a global notification center in the app header
- persisted notifications for board, list, and task activity across all boards
- unread tracking for the local app
- live delivery of new notifications to the open app
- in-app toast/card notifications for newly arrived activity
- user-friendly notification formatting with icons, source metadata, and entity context
- explicit notification conversion rules for which successful writes should and should not become notifications
- deep links from notifications to the related board, list, or task when the target still exists
- retention limits for stored notification history
- simple notification-view settings inside the notification UI

This effort does not require:

- multi-user inboxes or per-user read state
- push notifications outside the local app window
- email, desktop, or mobile delivery
- configurable notification rules in v1
- failure/system alerts in v1
- collapsing or deduplicating repeated events in v1

## Product intent

- The notification center is an activity feed, not an attention-management inbox.
- The feed is global across all boards by default.
- The notification panel must support lightweight view controls for current board vs all boards in v1.
- The UI should allow hiding the user's own writes, where "own writes" means web-app (`ui`) writes.
- The own-write filter should be on by default.
- The notification panel should include a lightweight settings bar inside the panel as its first row.

## Core requirements

### Functional

- The app must show a notification bell in the header.
- The bell must display an unread badge count when unread notifications exist.
- The red unread badge should represent external unread notifications, meaning unread `cli` and `system` notifications after notification-conversion exclusions are applied.
- Clicking the bell must open a compact notification panel.
- The feed must show notifications across all boards.
- The system must persist notifications so they survive page reloads and server restarts.
- Successful board, list, and task writes must create notification events.
- Notification creation must follow explicit server-side conversion rules rather than treating every successful write as notification-worthy.
- The system must not create persisted notifications for board preference updates such as view-preference changes.
- The system must not create persisted notifications for list moves or task moves that do not result in meaningful destination changes.
- Reorder-only changes must be eligible to create notifications in v1.
- The notification feed must reflect writes triggered by the web app, `hirotm`, and future API clients that use the supported server mutation path.
- The app must support live delivery of newly created notifications while the app is open.
- The app must support in-app toast/card notifications for newly created notifications while the app is open.
- Opening the notification panel must mark current unread notifications as read.
- Read state may be global for the local app in v1.
- Notifications must remain visible after related entities are deleted.
- When the related entity still exists, the notification should support navigation to that entity.
- Board notifications should navigate to the related board.
- List notifications should navigate to the board and scroll/select the related list when it still exists.
- Task notifications should navigate to the board and scroll/select the related task when it still exists, with an edit-open fallback when the task is hidden by current board UI state.
- The initial view may show each event as a separate entry; collapsing/grouping repeated events is not required in v1.

### Content and presentation

- Each notification must show enough information to quickly understand the change.
- Each notification must include source metadata for display types such as `user`, `cli`, or `system`.
- Each notification should support a human-friendly source/client label such as `User`, `Cursor Agent`, or another explicit system/client label.
- Each notification must include entity context such as board, list, or task identity.
- Each notification must show a human-friendly timestamp using contextual wording such as `now`, `a min ago`, `3:35 PM`, or `yesterday`.
- The presentation should use visually helpful icons and styling to communicate the action.
- The design should support icons for source, entity, and action where useful.
- The row should keep the existing action icon treatment, add a small entity-type icon before the message text, and show source type with a distinct source icon treatment.
- Source presentation should distinguish `cli` and `user` clearly, including color treatment.
- Delete-oriented notifications should read as destructive actions visually.
- Completion-oriented task notifications should read as positive/completed actions visually.
- Add/create actions should have clear positive visual treatment.
- Message text should be simple, readable, and consistent across entity types.
- Task updates that represent important domain actions should have first-class messages, including task completion/status changes, priority changes, and group changes.
- Generic task-update messaging should remain available for edits that do not fit a first-class action.
- The formatting logic should be maintainable enough to support multiple entity/action combinations cleanly.

### View controls

- The notification UI must include a lightweight settings bar inside the panel as the first row.
- The settings bar should support switching between all boards and the current board.
- The settings bar should support showing or hiding the user's own writes.
- The default view should be all boards.
- The default own-write filter should hide the user's own writes.
- The board-scope control should read as a simple two-way toggle: `Boards: All / Current`.
- Additional filtering/configuration may be added later, but is not required in v1.

## Source identification requirements

- The notification system must support writer identification beyond a coarse source type.
- Supported clients should be able to send a human-friendly client name that can appear in notifications.
- The CLI should always send an explicit client identity value with write requests.
- Agent/automation workflows should follow documented guidance for sending a stable client identity such as `Cursor Agent`.
- Notification presentation should use the human-friendly client identity when it is available.
- The user-facing display taxonomy should focus on `user`, `cli`, and `system`; lower-level transport/client details should not leak into the notification UI unless they become a deliberate product concept.

### Non-functional

- The feature should build on the existing multi-writer sync foundation rather than replace it.
- The persisted notification store must remain the source of truth for the feed.
- The live event channel should complement persisted notifications rather than become the only source of truth.
- The design should be simple enough to ship incrementally on the current Bun + Hono + React Query architecture.
- The formatting and rendering approach should stay maintainable as more notification types are added.

## Canonical data ownership

- SQLite remains the persisted source of truth for notification history.
- The HTTP API remains the only supported mutation path for app data.
- Notification records are created by the server after successful supported writes.
- The browser feed is a derived read model for rendering and unread UX.
- `hirotm` is not a special case; it is one more API client whose writes should generate notifications through normal server-side handling.
- Client identity metadata should be captured through supported request/application channels rather than inferred from direct database access.

## Required user experience

- A user should be able to open the app and immediately see whether recent changes happened.
- A user should be able to open the notification panel and scan recent activity quickly.
- A user should be able to use the first-row settings bar to switch between all-board and current-board views.
- A user should be able to tell what changed, where it changed, and what client triggered it.
- A user should be able to see when the activity happened using fast, human-friendly time wording rather than raw timestamps.
- A user should be able to navigate from a notification to the affected entity when it still exists.
- A user should be able to click a task or list notification and land with the relevant task/list selected and visible.
- A user should still be able to understand delete notifications even after the target entity is gone.
- An open app session should receive new notifications without manual refresh.
- An open app session should be able to show bottom-right toast/card notifications for new activity.
- The unread badge should clear when the panel is opened and items are marked read.
- Toasts should follow the same presentation rules as panel notifications and should not contradict the panel's source/type semantics.

## Data and retention requirements

- The system must keep a bounded notification history.
- The initial retention limit should be the most recent 1000 notifications.
- Retention should be controlled by a central app-level constant or configuration location rather than scattered magic numbers.
- Stored notification data must preserve enough display context so historical entries remain understandable after deletes or renames.

## Compatibility requirements

- The feature must work for writes originating from both the browser and `hirotm`.
- The feature must not require direct SQLite access from the CLI.
- The feature should leave room for additional named clients and automations beyond `hirotm`.
- The feature should leave room for future per-user read tracking without requiring it now.
- The feature should leave room for future notification preferences without requiring them now.

## Non-goals

- Per-user notification inboxes.
- Delivery to external devices or operating-system notification centers.
- Advanced notification rule builders or subscriptions in v1.
- Automatic collapsing/deduping of similar events in v1.
- System-health or mutation-failure notifications in v1.

## Success criteria

- The header shows an unread count badge when new notification events exist.
- The unread badge reflects external unread notification events rather than all unread events indiscriminately.
- The notification panel gives a quick, readable summary of recent activity across all boards.
- The notification panel includes a first-row settings bar with all-boards/current-board and own-writes controls.
- Notifications persist across reloads and server restarts.
- Writes from both the web app and `hirotm` appear in the feed.
- Users can identify source/client, entity, action, time, and relevant context from each item.
- The app can show bottom-right toast/card notifications for newly arrived activity.
- Deleted entities still leave behind understandable notification entries.
- The documented conversion rules clearly state which successful writes are intentionally not persisted as notifications.
- The requirements are clear enough to drive a dedicated design doc and implementation plan.
