# Development environment setup

This project is a **Bun** + **Hono** API and a **Vite** + **React** SPA. In development, the API listens on port **3002** and Vite serves the UI (default **5173**), proxying `/api` to the API. In production, a single Bun process serves both the API and the built SPA.

Board data is **SQLite** (`taskmanager.db` under the active profile's `data/` directory); see [sqlite_data_model.md](./sqlite_data_model.md). **Authentication** uses a passphrase and session cookie; there is **no development bypass**—local dev matches production auth behavior. Overview: [auth-design.md](./auth-design.md).

## Prerequisites

### Node.js

Install a current **LTS or Current** release so you have `npm` and `npx` (used by the npm scripts).

- Download: [https://nodejs.org](https://nodejs.org)
- Verify:

```bash
node -v
npm -v
```

### Bun (recommended)

The API server runs on **Bun** (`src/server/bootstrapDev.ts` in development, `src/server/bootstrapInstalled.ts` for the installed/production path). Installing Bun globally is the smoothest experience; without it, `npm run dev` still works because `dev:server` uses `npx bun`.

**Windows (PowerShell):**

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

**macOS / Linux:**

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun -v
```

---

## Install dependencies

From the repository root (`taskmanager/`):

```bash
npm install
```

Or with Bun (faster):

```bash
bun install
```

---

## Development

Starts the API (watch mode, port 3002) and Vite dev server together:

```bash
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**). The Vite proxy forwards `/api` requests to the Bun API on port 3002.

**First-time auth:** If this install has not completed setup, the UI walks you through choosing a passphrase. The **recovery key** is printed **once** in the **API terminal** (the process running `dev:server` or `npm run dev`). Save it before continuing. Then **log in** at the Vite URL. The `hirotm` CLI and other callers without a browser session use **CLI** permissions—grant access per board from the web UI after login.

**Run API only:**

```bash
npm run dev:server
```

**Run Vite only** (when the API is already running):

```bash
npm run dev:client
```

**Port conflict:** If port 3002 is taken, either free it or update the dev profile config under `%USERPROFILE%\.taskmanager\profiles\dev\config.json` and keep `vite.config.ts` in sync.

---

## Build & production

**Typecheck:**

```bash
npm run typecheck
```

**Build the SPA** (outputs to `dist/`):

```bash
npm run build
```

**Run in production** (single process — API + SPA on port 3001):

```bash
npm start
```

By default, production uses the `default` profile under `~/.taskmanager/profiles/default/`. Development uses the `dev` profile for auth and config, and its SQLite data defaults to `data/taskmanager.db` in the repo. Override with `%USERPROFILE%\.taskmanager\profiles\dev\config.json` if needed.

---

## Cursor / VS Code: Run and Debug

Open **Run and Debug** (`Ctrl+Shift+D`), pick a configuration, then **F5** (start) / **Shift+F5** (stop). These mirror the npm scripts; no `tasks.json` is required.

| Configuration | What it runs |
|---------------|----------------|
| **Dev (API + Vite)** | `npm run dev` — API on 3002 + Vite (open **http://localhost:5173**) |
| **Build** | `npm run build` — writes `dist/`, then exits |
| **Start (production)** | Bun installed bootstrap — serves API + SPA on **http://localhost:3001** (run **Build** first so `dist/` exists) |
| **Debug API (Bun only)** | Bun debugger + watch on the API only; run `npm run dev:client` in another terminal for full stack |

The workspace recommends the **[Bun](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)** extension (`oven.bun-vscode`) via `.vscode/extensions.json` for the last config.

### Debug frontend

With **Dev (API + Vite)** running, use the browser DevTools on **http://localhost:5173**, or use Cursor’s JS debugger with breakpoints in `src/client/` (source maps).

If the Bun debugger misbehaves on Windows, see [bun-windows-cursor-debug.md](./bun-windows-cursor-debug.md).

---

## Quick checklist

1. Install **Node.js** (and optionally **Bun**)
2. `npm install`
3. `npm run dev` — open the Vite URL; if prompted, complete **setup** and copy the recovery key from the **API** terminal; then **log in**. Confirm `/api/health` returns `{"ok":true}` (e.g. in the browser or with `curl`).
4. `npm run build && npm start` — verify the installed bootstrap flow on **http://localhost:3001** (setup/login as above if this is a fresh auth state)
