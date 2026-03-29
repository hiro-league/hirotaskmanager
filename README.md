# TaskManager

Local-first task board in the browser. Boards, lists, and tasks are stored as **JSON on disk** (readable and editable outside the app). No cloud account or database server.

## Features

- **Boards** — Multiple boards; sidebar catalog backed by `_index.json`
- **List columns** — Each list is a column; tasks grouped by **status bands** (stacked vertically)
- **Task types** — Boards define task types; filter the board by active type
- **Markdown** — Task bodies with edit + preview
- **Drag and drop** — Reorder lists and move/reorder tasks between status bands ([@dnd-kit](https://github.com/clauderic/dnd-kit))
- **Optimistic UI** — TanStack Query for API state and mutations

## Stack

Bun · Hono · React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui

## Requirements

Use **either** Bun **or** Node.js — you do not need both.

| Path | What to install |
|------|------------------|
| **Bun** | [Bun](https://bun.sh) — installs dependencies, runs `vite build`, and runs the server |
| **Node.js** | [Node.js](https://nodejs.org) (LTS or Current) with `npm` / `npx`. `npm start` runs the server via `npx bun` (downloads Bun if needed). |

## Install and run (production)

Work in the **repository root** (`taskmanager/`).

### Option A — Bun only

1. Install Bun: [bun.sh](https://bun.sh) (macOS, Linux, and Windows instructions are on that page).

2. Install dependencies and build the UI:

```bash
bun install
bun run build
```

3. Start the server. **Production** requires `NODE_ENV=production`.

| OS / shell | Command |
|------------|---------|
| **macOS, Linux**, Git Bash on Windows | `NODE_ENV=production bun src/server/index.ts` |
| **Windows — cmd.exe** | `set NODE_ENV=production&& bun src\server\index.ts` |
| **Windows — PowerShell** | `$env:NODE_ENV = "production"; bun src/server/index.ts` |

4. Open **http://localhost:3001** (default port; override with `PORT`).

### Option B — Node.js + npm

1. Install Node.js from [nodejs.org](https://nodejs.org).

2. In the project root:

```bash
npm install
npm run build
npm start
```

3. Open **http://localhost:3001**.

`npm start` sets `NODE_ENV=production` the Unix way. If it fails on **Windows cmd**, use:

| Shell | Command |
|-------|---------|
| **cmd.exe** | `set NODE_ENV=production&& npx --yes bun src\server\index.ts` |
| **PowerShell** | `$env:NODE_ENV = "production"; npx --yes bun src/server/index.ts` |

On **macOS / Linux**, if `npm start` does not set `NODE_ENV` correctly, run:

`NODE_ENV=production npx --yes bun src/server/index.ts`

### Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3001`) |
| `DATA_DIR` | Root directory for JSON data (see [Data directory](#data-directory)) |

Set `DATA_DIR` with the same shell rules as `NODE_ENV`. Examples:

| OS / shell | Example |
|------------|---------|
| macOS / Linux / Git Bash | `DATA_DIR=/path/to/data NODE_ENV=production bun src/server/index.ts` |
| Windows cmd | `set DATA_DIR=C:\path\to\data&& set NODE_ENV=production&& bun src\server\index.ts` |
| Windows PowerShell | `$env:DATA_DIR = "C:\path\to\data"; $env:NODE_ENV = "production"; bun src/server/index.ts` |

If you use the **Node** path and do not have `bun` on `PATH`, replace `bun src/server/index.ts` with `npx --yes bun src/server/index.ts` in the examples above.

## Data directory

Layout:

```
<DATA_DIR>/
  _index.json       # board catalog
  boards/
    <id>.json       # full board document (lists + tasks)
```

**How the app picks the directory**

1. If **`DATA_DIR`** is set → that path (relative paths are resolved from the current working directory)
2. Else if **`NODE_ENV=production`** → `~/.taskmanager/data` (Windows: `%USERPROFILE%\.taskmanager\data`)
3. Else (development) → `./data` under the current working directory (usually the repo root)

`data/` is in `.gitignore`; local boards are not committed unless you change that.

## Clone for development

```bash
git clone <repository-url>
cd taskmanager
```

**With Node.js** (uses `npm` inside the dev script):

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. API: **http://localhost:3001** (Vite proxies `/api`).

**With Bun:**

```bash
bun install
bun run dev
```

The `dev` script may still invoke **`npm`** for subprocesses. If `bun run dev` fails because `npm` is missing, use two terminals:

| Terminal | Command |
|----------|---------|
| 1 | `bun --watch src/server/index.ts` |
| 2 | `bunx vite` |

Other commands: `npm run typecheck` or `bun run typecheck`; `npm run build` or `bun run build`.

More detail: [docs/setup.md](docs/setup.md). Architecture: [docs/arch_design_guidelines.md](docs/arch_design_guidelines.md).

## Contributing

Issues and pull requests are welcome. For drag-and-drop behavior, see [docs/drag_drop.md](docs/drag_drop.md).
