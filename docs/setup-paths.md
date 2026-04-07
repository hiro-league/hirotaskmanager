# Setup paths

This document separates the two intended ways to use TaskManager:

- installed app path for end users
- local repo path for development

Important status note:

- the installed app path below is still the target path after packaging and publishing are complete
- the development path below reflects the current repository behavior

See `docs/npm-distribution-plan.md` for the implementation plan behind this split.

## Installed app path

This is the target end-user experience after packaging and publishing are complete.

### Prerequisite

Install Bun on the machine.

### Install

```bash
bun install -g @hiroleague/taskmanager
```

### First run

```bash
hirotaskmanager
```

Expected behavior on first run:

1. `hirotaskmanager` detects that no launcher config exists yet
2. it runs launcher setup automatically
3. it prompts for:
   - port, default `3001`
   - data directory, default under `%USERPROFILE%\.taskmanager\profiles\default\data`
   - whether to open the browser automatically
4. it saves the config
5. it starts the app
6. it opens or prints the local URL

### Web app setup

After the launcher starts the app:

1. open the local URL if it did not auto-open
2. choose a passphrase in the browser
3. copy the recovery key printed once in the terminal
4. log in to the app

### Daily use

Start the app:

```bash
hirotaskmanager
```

Rerun launcher setup later:

```bash
hirotaskmanager --setup
```

Use the CLI directly:

```bash
hirotm status
hirotm boards list
```

### Optional quick-run path

For testing without global install:

```bash
bunx @hiroleague/taskmanager
```

This is not the primary path because users would need to type `bunx` every time.

## Development path

This is the current repository workflow for building and testing the app locally.

### Prerequisites

Install:

- Node.js
- Bun

### Install dependencies

From the repo root:

```bash
npm install
```

Or:

```bash
bun install
```

### Run development

```bash
npm run dev
```

**CLI:** `node_modules/.bin` is not on `PATH`, so run **`npm link` once** from the repo root (after install) for a global `hirotm`, or use **`npx hirotm`** / **`npm run cli --`**. Re-run **`npm link`** only if the global command breaks (e.g. after `npm unlink` or changing clones).

**`hirotm` and dev:** the dev API is on **3002**; the CLI defaults to **3001**. Use **`hirotm --profile dev …`** or **`TASKMANAGER_PROFILE=dev`**.

**SQLite data in the repo:** the dev runtime now defaults to `data/taskmanager.db` under the repository root, so the normal `npm run dev` flow uses the tracked SQLite file without needing env vars.

Current behavior:

1. the API runs on port `3002`
2. the Vite app runs on port `5173`
3. open the Vite URL shown in the terminal
4. if auth is not initialized yet, complete setup in the browser
5. copy the recovery key from the API terminal
6. log in

### Run production locally

```bash
npm run build
npm start
```

This verifies the current production-style single-process app locally.

### Current storage behavior

Current defaults:

- dev profile: `dev`
- API port: `3002`
- web port: `5173`
- dev data: `data/taskmanager.db` in the repo
- dev auth: `%USERPROFILE%\.taskmanager\profiles\dev\auth`

Current outcome:

- installed app can run on `3001`
- development can run on `3002`
- installed and dev auth stay separate
- installed and dev databases stay separate

## Intended long-term cleanup

By the end of the distribution work, this project should keep only two clear paths:

1. installed app path for users
2. development path for contributors

The final cleanup should remove:

- user-facing env-var instructions from the normal install path
- duplicated install decision trees
- temporary compatibility shims
- old launcher/config/bootstrap paths that only exist to preserve pre-release behavior
