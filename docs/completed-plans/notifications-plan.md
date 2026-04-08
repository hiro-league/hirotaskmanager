# Notifications plan

This document breaks the notifications work into phased execution. Product intent lives in the requirements doc; technical shape lives in the design doc.

**Related documents**

- [Notifications requirements](./notifications-requirements.md) — what must be true when this is done.
- [Notifications design](./notifications-design.md) — target architecture, data model, API shape, and client flow.
- [Multi-writer sync design](./multi-writer-sync-design.md) — existing event infrastructure that notifications should build on.
- [hirotm CLI — Design Document](./ai-cli-design.md) — current CLI contract and API assumptions.

## Suggested order

1. Phase 1 — Persisted notification foundation
2. Phase 2 — Notification panel and unread UX
3. Phase 3 — Live delivery, toasts, and source identity polish
4. Phase 4 — Notification behavior and presentation refinements

---

## Phase 1: Persisted notification foundation

**Goal:** Add the server-side notification model, storage, and read APIs so the app has a durable feed before polishing the full UI.

### Checklist

- [ ] Add a notification migration and storage module for persisted notification rows.
- [ ] Add a central retention constant/config value for keeping the newest 1000 notifications.
- [ ] Define shared notification types in `src/shared/`.
- [ ] Add server helpers to build notification records from successful board/list/task writes.
- [ ] Persist enough snapshot data so delete notifications remain understandable after entity deletion.
- [ ] Add `GET /api/notifications`.
- [ ] Add `PATCH /api/notifications/read-all`.
- [ ] Insert notification rows from successful board, list, and task writes, including reorder events.
- [ ] Capture source/client metadata from supported request headers when present.
- [ ] Keep existing board sync events untouched so board convergence behavior does not regress.

### Exit criteria

- Successful supported writes create persisted notification rows.
- Notifications survive app reloads and server restarts.
- The server can return a recent feed plus unread count.
- Delete notifications remain readable after the related entity is gone.

### Notes

- This phase establishes the source of truth.
- The feature does not need live SSE delivery yet to be useful.

---

## Phase 2: Notification panel and unread UX

**Goal:** Expose the persisted feed in the app shell with a header bell, unread count badge, and first-row panel controls.

### Checklist

- [ ] Add a client notification API layer and React Query hooks.
- [ ] Add a notification bell to `src/client/components/layout/AppHeader.tsx`.
- [ ] Show the unread count in the badge.
- [ ] Add a compact notification panel/popover in the header flow.
- [ ] Place the settings bar inside the panel as the first row.
- [ ] Add the `Boards: All / Current` toggle.
- [ ] Add the `Hide own writes` toggle.
- [ ] Render newest notifications first.
- [ ] Show contextual timestamps such as `now`, `a min ago`, `3:35 PM`, and `yesterday`.
- [ ] Show source/client, entity context, action styling, and deep links when targets still exist.
- [ ] Mark unread notifications as read when the panel is opened.
- [ ] Handle empty states and filtered empty states cleanly.

### Exit criteria

- Users can open the notification center from anywhere in the app shell.
- The badge count matches server unread state.
- The panel supports day-one filters and readable activity entries.
- Opening the panel clears unread state as designed.

### Notes

- This phase should be shippable even without live toast cards.
- The feed remains global by default even when the panel is filtered to the current board.

---

## Phase 3: Live delivery, toasts, and source identity polish

**Goal:** Make the notification experience feel live by adding notification-specific SSE, bottom-right cards, and stronger client identity handling.

### Checklist

- [ ] Add `GET /api/notifications/events` for notification-specific SSE.
- [ ] Publish `notification-created` events after notification rows are inserted.
- [ ] Subscribe from the app shell rather than only from board pages.
- [ ] Prepend live notification items into cached feed state and update unread count immediately.
- [ ] Add bottom-right toast/card notifications for newly arrived items.
- [ ] Suppress replay toasts for historical feed loads.
- [ ] Cap the visible toast stack and auto-dismiss cards after a short delay.
- [ ] Make toast clicks open the panel or navigate to the target entity.
- [ ] Extend client metadata handling to support a machine id, a human-friendly client name, and a client instance id.
- [ ] Update `hirotm` to always send its client identity metadata on writes.
- [ ] Document guidance for automation/agent clients to identify themselves with a stable display name such as `Cursor Agent`.
- [ ] Use client instance identity to avoid showing a client's own live toasts when appropriate.

### Exit criteria

- New notifications appear live without manual refresh.
- Bottom-right cards appear for newly arrived items.
- Client identity is rich enough to label notification sources cleanly and suppress same-instance live toast echoes where appropriate.
- CLI and other named clients appear with human-friendly source labels in the feed.

### Notes

- This phase improves the live feel of the feature, but depends on the persisted feed from Phase 1.
- Keeping notification SSE separate from board sync SSE reduces coupling and keeps the shell-level subscription clean.

---

## Phase 4: Notification behavior and presentation refinements

**Goal:** Align the shipped notification experience with the clarified product rules for source display, click behavior, time formatting, badge semantics, and notification conversion exclusions.

### Checklist

- [x] Update notification conversion rules so excluded actions are skipped before persistence.
- [x] Stop creating notifications for board preference updates.
- [x] Stop creating notifications for move events that do not produce meaningful destination changes.
- [x] Classify task updates into first-class notification actions for status, priority, and group changes.
- [x] Keep a generic task-update notification for other task edits.
- [x] Update row/toast presentation to show clearer source icons and colors for `cli`, `user`, and `system`.
- [x] Add a small entity-type icon before the notification message text while preserving the existing action icon.
- [x] Change same-day time formatting to 12-hour display and use abbreviated minute wording such as `a min ago` and `3 mins ago`.
- [x] Change the panel scope control copy to `Boards: All / Current`.
- [x] Define own-write filtering as hiding all web-app (`ui`) writes.
- [x] Update the unread badge so the red count represents external unread notifications (`cli` + `system`) rather than all unread items.
- [x] Keep toast behavior/presentation consistent with the panel so the two surfaces do not contradict each other.
- [x] Improve notification click behavior so board notifications navigate to the board, list notifications scroll/select the list, and task notifications scroll/select the task with edit-open fallback when hidden.

### Exit criteria

- Notification conversion behavior matches the documented exclusions rather than persisting unwanted rows and hiding them later.
- Source display is clearer and no longer relies on ambiguous terminal-style CLI presentation.
- Same-day times and relative-minute wording match the intended product copy.
- The red unread badge reflects external activity instead of the user's own web-app writes.
- Clicking a notification lands on the related board/list/task in a way that feels intentional and useful.
- Toasts and panel rows present the same source/time/entity semantics.

### Notes

- This phase is refinement work on top of the shipped phases, not a new notification subsystem.
- Treat the excluded actions above as core notification-conversion rules, not as a user-configurable "mute notifications" feature.

---

## Recommended ship sequence

### Milestone A

- Phase 1

Result:

- TaskManager gains durable notification history and server-side event creation.

### Milestone B

- Phase 2

Result:

- Users get a usable notification center with unread count and in-panel filters.

### Milestone C

- Phase 3

Result:

- Notifications feel live, source-aware, and polished through SSE and toast cards.

### Milestone D

- Phase 4

Result:

- Notifications behave consistently with the clarified product rules for source display, badge semantics, click targets, and conversion scope.

## Risks to watch

- Mixing notification SSE with board sync SSE and making both channels harder to reason about.
- Not storing enough snapshot data for delete events and later losing readable history.
- Mixing up product-level own-write filtering (`ui` writes) with lower-level per-instance toast suppression.
- Letting unread count drift from the persisted server state.
- Creating too much toast noise for frequent reorder or automation-driven writes.
- Letting presentation or badge semantics diverge between panel rows and bottom-right toast cards.
- Persisting noisy events that product already decided should never become notifications.

## Future items

These are intentionally outside the planned phases above:

- per-user inboxes and per-user read tracking
- advanced notification preferences or rule builders
- automatic collapsing or deduping of similar events
- failure/system notifications
- desktop or OS notification center integration
- richer toast policies such as quiet hours or severity-based rules
- advanced panel filtering beyond the day-one controls
