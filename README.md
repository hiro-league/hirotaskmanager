# TaskManager

Local-first task board in the browser. Boards, lists, and tasks are stored in **SQLite** (`taskmanager.db` under your [data directory](#data-directory)). No cloud account. The web UI is protected by **passphrase login**; local automation uses a scoped **CLI** principal (see [Authentication and CLI access](#authentication-and-cli-access)).

## Features

- **Boards** — Multiple boards; sidebar catalog in the SQLite-backed store
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

## Authentication and CLI access

- **First run:** The server runs in **setup** mode until auth is initialized. In the browser, choose a **passphrase**. The **recovery key** is printed **once in the terminal** where the server runs—save it outside the app; it is not kept in plaintext after setup.
- **Web:** After setup, open the app URL and **log in** with your passphrase. The server sets an **HttpOnly** session cookie. Use **logout** in the UI to clear the session.
- **Where auth lives:** `~/.taskmanager/auth/auth.json` (Windows: `%USERPROFILE%\.taskmanager\auth\auth.json`). This is **separate** from `DATA_DIR` and stores only hashed material.
- **CLI and local HTTP:** Requests **without** a valid browser session are the **CLI** principal (including `hirotm`). They are allowed only what **CLI access** grants per board; configure that in the **web app after logging in**. Details: [docs/auth-design.md](docs/auth-design.md).
- **Development:** There is **no auth bypass** in dev—the flow matches production. Complete setup once if needed, then log in at the Vite dev URL.

## Install and run (production)

Work in the **repository root** (`taskmanager/`).

### Interactive script (Bun — Git Bash, WSL, macOS, Linux)

If you use a Bash shell, the repo includes **`run-prod.sh`**, which:

- Checks that **Bun** is on your `PATH` (install from [bun.sh](https://bun.sh) if not)
- Optionally runs **`bun install`** and **`bun run build`**
- Prompts for **port** (default **8080**) and **data folder** under the repo (default **`hirodata`**, i.e. `<repo>/hirodata`)
- Sets `NODE_ENV=production`, `PORT`, and `DATA_DIR`, then runs **`bun src/server/index.ts`**

```bash
chmod +x run-prod.sh
./run-prod.sh
```

On Windows Git Bash you can also run `bash run-prod.sh` without `chmod`.

Open **http://localhost:8080** (or the port you entered). For manual commands without the script, see below.

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
| `DATA_DIR` | Root directory for app data; contains `taskmanager.db` (see [Data directory](#data-directory)) |

Set `DATA_DIR` with the same shell rules as `NODE_ENV`. Examples:

| OS / shell | Example |
|------------|---------|
| macOS / Linux / Git Bash | `DATA_DIR=/path/to/data NODE_ENV=production bun src/server/index.ts` |
| Windows cmd | `set DATA_DIR=C:\path\to\data&& set NODE_ENV=production&& bun src\server\index.ts` |
| Windows PowerShell | `$env:DATA_DIR = "C:\path\to\data"; $env:NODE_ENV = "production"; bun src/server/index.ts` |

If you use the **Node** path and do not have `bun` on `PATH`, replace `bun src/server/index.ts` with `npx --yes bun src/server/index.ts` in the examples above.

## Data directory

App database file:

```
<DATA_DIR>/
  taskmanager.db    # SQLite (boards, lists, tasks, FTS, CLI policy, …)
```

Schema and tables: [docs/sqlite_data_model.md](docs/sqlite_data_model.md).

**How the app picks `DATA_DIR`**

1. If **`DATA_DIR`** is set → that path (relative paths are resolved from the current working directory)
2. Else if **`NODE_ENV=production`** → `~/.taskmanager/data` (Windows: `%USERPROFILE%\.taskmanager\data`)
3. Else (development) → `./data` under the current working directory (usually the repo root)

**Auth state** (passphrase/session hashes) is **not** under `DATA_DIR`; it lives under `~/.taskmanager/auth/` (see [Authentication and CLI access](#authentication-and-cli-access)).

`data/` is in `.gitignore`; local databases are not committed unless you change that.

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

Open **http://localhost:5173**. API: **http://localhost:3001** (Vite proxies `/api`). On first launch, complete **setup** in the browser and watch the **API terminal** for the recovery key; then **log in** (same as production—see [Authentication and CLI access](#authentication-and-cli-access)).

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

More detail: [docs/setup.md](docs/setup.md). Auth requirements: [docs/auth-requirements.md](docs/auth-requirements.md). Architecture: [docs/arch_design_guidelines.md](docs/arch_design_guidelines.md).

## Contributing

Issues and pull requests are welcome. For drag-and-drop behavior, see [docs/drag_drop.md](docs/drag_drop.md).
