# Development environment setup

This project is a **Bun** + **Hono** API and a **Vite** + **React** SPA. In development, the API listens on port **3001** and Vite serves the UI (default **5173**), proxying `/api` to the API. In production, a single Bun process serves both the API and the built SPA.

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

The API server runs on **Bun** (`src/server/index.ts`). Installing Bun globally is the smoothest experience; without it, `npm run dev` still works because `dev:server` uses `npx bun`.

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

Starts the API (watch mode, port 3001) and Vite dev server together:

```bash
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**). The Vite proxy forwards `/api` requests to the Bun API on port 3001.

**Run API only:**

```bash
npm run dev:server
```

**Run Vite only** (when the API is already running):

```bash
npm run dev:client
```

**Port conflict:** If port 3001 is taken, either free it or set `PORT=<other>` for the API and update `server.proxy` in `vite.config.ts` to match.

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

Override the port or data directory with environment variables:

```bash
PORT=8080 npm start
DATA_DIR=/path/to/data npm start
```

By default, production stores data in `~/.taskmanager/data`. In development, data lives in `./data` at the repo root.

---

## Cursor / VS Code: Run and Debug

Open **Run and Debug** (`Ctrl+Shift+D`), pick a configuration, then **F5** (start) / **Shift+F5** (stop). These mirror the npm scripts; no `tasks.json` is required.

| Configuration | What it runs |
|---------------|----------------|
| **Dev (API + Vite)** | `npm run dev` — API on 3001 + Vite (open **http://localhost:5173**) |
| **Build** | `npm run build` — writes `dist/`, then exits |
| **Start (production)** | Bun + `NODE_ENV=production` — serves API + SPA on **http://localhost:3001** (run **Build** first so `dist/` exists) |
| **Debug API (Bun only)** | Bun debugger + watch on the API only; run `npm run dev:client` in another terminal for full stack |

The workspace recommends the **[Bun](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)** extension (`oven.bun-vscode`) via `.vscode/extensions.json` for the last config.

### Debug frontend

With **Dev (API + Vite)** running, use the browser DevTools on **http://localhost:5173**, or use Cursor’s JS debugger with breakpoints in `src/client/` (source maps).

If the Bun debugger misbehaves on Windows, see [bun-windows-cursor-debug.md](./bun-windows-cursor-debug.md).

---

## Quick checklist

1. Install **Node.js** (and optionally **Bun**)
2. `npm install`
3. `npm run dev` — open Vite URL, confirm `/api/health` returns `{"ok":true}`
4. `npm run build && npm start` — verify production mode on **http://localhost:3001**
