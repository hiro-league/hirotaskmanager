# Runtime Modes: Repo vs Installed

This page is for repo contributors.

## At a glance

| Stack | Command | What runs | Mode | Open in browser |
| --- | --- | --- | --- | --- |
| Repo | `npm run dev` | Repo API + repo SPA | `dev` | usually `http://localhost:5173` |
| Installed | `hirotaskmanager` | Installed API + installed SPA | `installed` | usually `http://127.0.0.1:3001` |

Bare `hirotm` is whatever your shell resolves first on `PATH` (global install, `npm link`, or another copy). Use `hirotaskmanager` for installed code, `npm run cli --` for repo code, or the full path to a specific `hirotm` binary.

All profiles use the same database pattern:

```text
~/.taskmanager/profiles/<name>/data/taskmanager.db
```

Override with `--data-dir` or `data_dir` in `config.json`.

Mode names:

- `dev`: enables Vite-friendly CORS, defaults to port `3002`, and does not require `dist/`.
- `installed`: defaults to port `3001` and expects `dist/`.

`--dev` sets the mode. `--profile` selects config, auth, and data directories. `--dev` is a mode, not a third stack.

## Repo stack

```bash
npm install
npm run dev
```

- Runs repo API in `dev` mode.
- Runs repo SPA through Vite.
- Uses the `dev` profile by default in the repo dev script.
- Open the Vite URL on port `5173`.

The API on port `3002` can also serve the built SPA if `dist/` exists. Otherwise it is API-only.

## Installed stack

```bash
hirotaskmanager
hirotaskmanager server start
hirotaskmanager server status
hirotaskmanager server stop
```

`hirotm server start` also uses **installed** runtime if that `hirotm` binary is the installed package; if it resolves to a linked repo copy, it runs repo server code instead.

- Runs installed API in `installed` mode.
- Serves installed SPA from `dist`.
- Uses the selected profile under `~/.taskmanager/profiles/<name>/`.
- `server status` reports the responding server's `runtime` and `source` (`repo` or `installed`).

## `--dev` and `--profile`

```bash
# Dev mode on the dev profile
hirotm server start --dev --profile dev

# Dev mode on another profile
hirotm server start --dev --profile staging

# Installed mode on the dev profile
hirotm server start --profile dev
```

## Do you need to create `~/.taskmanager/profiles/dev/` first?

No. If `config.json` is missing, defaults apply and directories are created as needed.
