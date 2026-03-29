# Development environment setup

This project is a **Bun** + **Hono** API and a **Vite** + **React** SPA. In development, the API listens on port **3001** and Vite serves the UI (default **5173**), proxying `/api` to the API.

## Prerequisites

### Node.js (recommended)

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

### Cursor / VS Code (optional)

For one-click **Run and Debug**, use the configs in [`.vscode/launch.json`](../.vscode/launch.json) and tasks in [`.vscode/tasks.json`](../.vscode/tasks.json).

The workspace recommends the **[Bun](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)** extension (`oven.bun-vscode`) via [`.vscode/extensions.json`](../.vscode/extensions.json). Install it when prompted, or install manually, so **Bun: Debug API server** works. Client debugging uses the built-in **JavaScript Debugger** (`pwa-chrome`).

On **Windows** or **Git Bash**, if full-stack debug fails with **`bun: command not found`**, follow [bun-windows-cursor-debug.md](./bun-windows-cursor-debug.md).

---

## Install dependencies

From the repository root (`taskmanager/`):

**Using npm:**

```bash
npm install
```

**Using Bun (faster):**

```bash
bun install
```

---

## Run the project (development)

Starts the API (watch) and Vite together:

```bash
npm run dev
```

Then open the URL Vite prints (usually **http://localhost:5173**). The home page calls **`GET /api/health`** through the proxy; you should see `{"ok":true}` when the API is up.

**Run API only** (port 3001):

```bash
npm run dev:server
```

**Run Vite only** (useful when the API is already running):

```bash
npm run dev:client
```

**Port in use:** If **3001** is taken, set `PORT` and update the `server.proxy./api.target` value in [`vite.config.ts`](../vite.config.ts) to match, or free the port.

---

## Build and preview (production assets)

**Typecheck (no emit):**

```bash
npm run typecheck
```

**Production build (outputs to `dist/`):**

```bash
npm run build
```

**Preview the built SPA** (static client only; API is not started):

```bash
npm run preview
```

A full production-style run (API + static files from one process) will be added when the server is wired to serve `dist/` in a later phase.

---

## Cursor / VS Code: tasks and debugging

### Tasks (`Terminal → Run Task…` or `Ctrl+Shift+B` for default build)

| Task | Purpose |
|------|--------|
| **install:deps (npm)** | `npm install` |
| **install:deps (bun)** | `bun install` |
| **dev (full stack)** | API + Vite (`npm run dev`) |
| **dev:server (API only)** | Hono on Bun, watch |
| **dev:client (Vite only)** | Frontend dev server |
| **dev:client (background)** | Vite in background (used before client debug) |
| **build (vite)** | `npm run build` — also the **default build** task |
| **typecheck** | `npm run typecheck` |
| **preview (vite)** | `npm run preview` |

### Launch configurations (`Run and Debug`)

Open **Run and Debug** (`Ctrl+Shift+D`), pick a configuration, then **F5** (start) / **Shift+F5** (stop).

| Configuration | What it does |
|---------------|----------------|
| **Bun: Debug API server** | Launches `src/server/index.ts` under the Bun debugger (`watchMode` ≈ `bun --watch`). Requires the **Bun** VS Code extension. Keep port **3001** free. |
| **Chrome: Debug client (Vite)** | Runs the **dev:client (background)** task (Vite), then opens **http://localhost:5173** with the JS debugger so you can break in React/TS under `src/client`. |
| **Full stack: Debug API + Chrome client** | **Compound:** starts API debug and client debug together (API on 3001, Vite on 5173). |

**Typical flows:**

- **Daily dev (no debugger):** **Terminal → Run Task… → dev (full stack)** (or `npm run dev` in a terminal).
- **Debug API only:** **Bun: Debug API server** (install the recommended Bun extension if breakpoints do not hit).
- **Debug React only:** **Chrome: Debug client (Vite)**.
- **Debug both:** **Full stack: Debug API + Chrome client**.

If the Bun debugger misbehaves, use the [web debugger](https://bun.sh/guides/runtime/web-debugger) or run `bun --inspect-wait src/server/index.ts` and attach manually.

---

## Quick checklist

1. Install **Node.js** (and optionally **Bun**).
2. `npm install` or `bun install`
3. `npm run dev` → open Vite URL → confirm `/api/health` works
4. Optional: use **`.vscode`** tasks and launches for build and debug
