# Multi-writer sync design

**Related documents**

- [Multi-writer sync requirements](./multi-writer-sync-requirements.md) — core product and architecture requirements.
- [Multi-writer sync plan](./multi-writer-sync-plan.md) — phased execution plan.
- [hirotm CLI — Design Document](./ai-cli-design.md) — existing CLI and API assumptions.

This document describes the target technical design for making the TaskManager web app multi-writer aware without changing the core board rendering model.

## Design summary

- Keep the current full-board read model for initial board hydration.
- Change write paths so small mutations return granular entity results instead of the full `Board`.
- Add a server-side event channel so open browser sessions learn about external writes.
- Keep React Query as the client cache owner and patch cached board state surgically.
- Treat full-board refetch as a fallback for structural changes and recovery, not as the default response to every write.

## Current architecture

The current app already has a clean local architecture, but it is optimized for a mostly single-writer browser flow.

### Browser

- `src/client/api/queries.ts`
  - `useBoard(id)` loads the full board with `GET /api/boards/:id`
  - the board query is cached under `["boards", id]`
- `src/client/api/mutations/*.ts`
  - optimistic updates modify the cached `Board`
  - `onSuccess` replaces the cached board with the full server response
- `src/client/main.tsx`
  - default `staleTime` is `30_000`
  - there is no push channel and no periodic board refetch

### Server

- `src/server/routes/boards.ts`
  - board/list/task mutation endpoints all return the full `Board`
- `src/server/storage/tasks.ts`
- `src/server/storage/lists.ts`
- `src/server/storage/board.ts`
  - mutation storage helpers commonly end by calling `loadBoard(boardId)`
- `src/server/storage/board.ts`
  - `loadBoard(boardId)` reads board metadata, prefs, groups, priorities, lists, and all tasks

### CLI

- `src/cli/lib/writeCommands.ts`
  - write commands expect full-board mutation responses
  - CLI code finds the changed entity by inspecting the returned `Board`

## Target architecture

The day-one target design separates three concerns:

1. **Initial read model** — full `Board` load for page hydration.
2. **Mutation result model** — granular write responses.
3. **Change notification model** — server events so the browser can learn about writes from other clients.

## Read model

Keep this:

```txt
GET /api/boards/:id -> full Board
```

Reason:

- board rendering already expects one rich `Board`
- it is a good fit for initial page load
- it keeps component code stable

This means the render tree still consumes the same `Board` shape and does not need a fundamental rewrite.

## Write model

Change small write endpoints so they no longer return the full `Board`.

### Recommended response envelopes

```ts
interface MutationMeta {
  boardId: number;
  boardUpdatedAt: string;
}

interface EntityMutationResult<T> extends MutationMeta {
  entity: T;
}

interface DeleteMutationResult extends MutationMeta {
  deletedId: number;
}
```

Examples:

- `POST /api/boards/:id/tasks` -> `EntityMutationResult<Task>`
- `PATCH /api/boards/:id/tasks/:taskId` -> `EntityMutationResult<Task>`
- `DELETE /api/boards/:id/tasks/:taskId` -> `DeleteMutationResult`
- `POST /api/boards/:id/lists` -> `EntityMutationResult<List>`
- `PATCH /api/boards/:id/lists/:listId` -> `EntityMutationResult<List>`
- `DELETE /api/boards/:id/lists/:listId` -> `DeleteMutationResult`

### Structural writes

Some writes affect many records and are naturally harder to patch locally:

- list reorder
- task reorder within a band
- task move that forces broad reorder semantics
- board delete

For these, either of these approaches is acceptable:

- return a specific structural result and let the client refetch the board
- keep the route simple and perform a fallback board invalidation after the write

The key design point is that **single-entity writes should be granular by default**.

## Storage-layer design

The most important internal refactor is to stop making storage writes depend on `loadBoard(boardId)`.

### Current pattern

Mutation helpers in `src/server/storage/tasks.ts` and `src/server/storage/lists.ts` commonly:

1. validate inputs
2. write rows in SQLite
3. update `board.updated_at`
4. call `loadBoard(boardId)`
5. return the full `Board`

That makes every small write pay the cost of a full-board reload.

### Target pattern

Mutation helpers should:

1. validate inputs
2. write rows in SQLite
3. update `board.updated_at`
4. read back only what changed
5. return granular data plus `boardUpdatedAt`

Recommended helper additions:

- `readTaskById(boardId, taskId)`
- `readListById(boardId, listId)`
- optional `readBoardMetaById(boardId)` if board-only patches need a lightweight return type

This keeps `loadBoard(boardId)` available for:

- full board reads
- fallback recovery
- structural refresh paths

## Change notification model

Add a lightweight server-to-browser event channel.

### Recommended transport

Use **Server-Sent Events (SSE)**.

Reason:

- browser needs server-to-client notification only
- native browser `EventSource` is enough
- the current Bun + Hono stack can support it without a larger websocket architecture

### Recommended event bus

Add a small in-process pub/sub module on the server:

- subscribe clients by board id or global scope
- emit typed events after successful commits
- use lightweight payloads

Suggested event types:

- `board-changed`
- `task-created`
- `task-updated`
- `task-deleted`
- `list-created`
- `list-updated`
- `list-deleted`
- `board-index-changed`

Suggested payload shape:

```ts
interface BoardEventBase {
  boardId: number;
  boardUpdatedAt: string;
}
```

Extended payloads may include:

- `taskId`
- `listId`
- `deletedId`
- `kind`

### Why events matter

The browser can only patch its own optimistic writes today. Events let it learn about:

- CLI writes
- future MCP or automation writes
- writes from another browser tab or window

## Client data model

React Query remains the source of rendered client state.

### What stays the same

- `useBoard(id)` still returns a `Board`
- `BoardView.tsx` and child components still render from `Board`
- optimistic mutation logic can remain broadly the same

### What changes

- mutation `onSuccess` handlers stop replacing the entire board cache entry
- instead they patch the relevant list/task/board fields into cached `Board`

Examples:

- task update -> replace one task in `board.tasks`
- task create -> append new task to `board.tasks`
- task delete -> remove one task from `board.tasks`
- list update -> replace one list in `board.lists`
- board metadata patch -> update board-level fields without touching tasks

This preserves reference identity for unchanged entities and scales much better on large boards.

## Smart event handling

The browser event listener should support two levels of behavior.

### Level 1: simple invalidation

On any `board-changed` event:

- invalidate `["boards", boardId]`
- optionally invalidate related stats queries

This is the fastest way to make the app correct.

### Level 2: typed partial refresh

Once granular entity endpoints exist:

- `task-updated` -> fetch one task and patch it into cache
- `task-deleted` -> remove task locally
- `list-updated` -> fetch one list and patch it into cache
- structural events -> fall back to full board invalidation

This is the scalable end state.

## Rendering impact

The board rendering architecture does **not** need a major redesign.

That is an important part of this design.

### Unchanged

- `BoardView.tsx`
- board columns and stacked columns
- task card rendering
- list header rendering
- keyboard and drag/drop rendering model

### Why rendering can stay stable

All of those components consume a `Board` read model, not raw transport responses. As long as the React Query cache still contains a valid `Board`, the components do not care whether the cache was updated by:

- initial full-board fetch
- optimistic mutation
- granular mutation response
- SSE-driven partial fetch

## API surface changes

### Existing endpoints kept

- `GET /api/boards`
- `GET /api/boards/:id`
- existing mutation paths

### Existing endpoints changed

The write endpoints keep their URLs but change their success payloads from `Board` to granular mutation result envelopes for small writes.

### New endpoints recommended

- `GET /api/events`
- `GET /api/tasks/:taskId`
- `GET /api/boards/:id/lists/:listId`

These new targeted reads let the browser repair or update one entity after an event without reloading the whole board.

## CLI impact

The CLI does change, but only in its response parsing logic.

### What stays the same

- commands
- flags
- server usage
- API transport
- no direct SQLite access

### What changes

`src/cli/lib/writeCommands.ts` currently assumes the API returns a full `Board`. After the write model change, the CLI should read the changed entity directly from the mutation result envelope.

The CLI now reads `entity` from the mutation envelope; helpers that inferred the changed row from a full `Board` (`findNewestTask`, `findNewestList`, `findTaskById`) were removed from `write-result.ts`.

## Scalability model

This design is specifically meant to avoid "reload the whole board because one task title changed."

### Good fit for large boards

For a board with thousands of tasks:

- initial load may still fetch the full board
- a single task update should return one task
- the client should patch one task
- SSE should send one tiny event payload

### Fallback behavior

Full-board invalidation remains valid for:

- recovery from drift
- structural changes
- first implementation step before typed partial refresh is complete

That fallback is intentional, but it should not be the steady-state path for common single-entity writes.

## Compatibility and rollout strategy

The design supports phased adoption.

Recommended order:

1. Add SSE and simple invalidation first so correctness improves immediately.
2. Refactor storage functions internally to return granular results.
3. Change API contracts for small writes.
4. Update client mutation hooks and CLI parsing.
5. Upgrade SSE handling to typed partial refresh.

This allows the app to become correct early and scalable later without rewriting the board page.
