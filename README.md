# TaskManager

Local-first task board in the browser. Boards, lists, and tasks live in SQLite. The web app uses passphrase login, and local automation uses the `hirotm` CLI principal with explicit board permissions.

## Install

Preferred installed-user path:

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager
```

Optional quick-run path:

```bash
bunx @hiroleague/taskmanager
```

On first run:

1. `hirotaskmanager` runs launcher setup if needed
2. choose or accept the default port and data directory
3. open the app URL
4. set a passphrase in the browser
5. save the recovery key printed once in the terminal

Default installed profile paths:

- config: `%USERPROFILE%\.taskmanager\profiles\default\config.json`
- data: `%USERPROFILE%\.taskmanager\profiles\default\data\taskmanager.db`
- auth: `%USERPROFILE%\.taskmanager\profiles\default\auth\auth.json`

## CLI

TaskManager also ships `hirotm` for local automation and machine-friendly operations:

```bash
hirotm status
hirotm boards list
hirotm search "bug"
```

`hirotm` can also start the local server explicitly, including by profile:

```bash
hirotm start --profile default --background
```

Requests without a valid browser session are treated as the CLI principal. Configure CLI access from the web app after logging in. See [docs/auth-design.md](docs/auth-design.md).

## Development

Repository development uses a separate dev profile and port:

```bash
npm install
npm run dev
```

Current defaults:

- web: `http://localhost:5173`
- API: `http://localhost:3002`
- dev data: `data/taskmanager.db` in the repo
- dev auth: `%USERPROFILE%\.taskmanager\profiles\dev\auth\auth.json`

More detail: [docs/setup.md](docs/setup.md) and [docs/setup-paths.md](docs/setup-paths.md).

## Notes

- There is no dev-only auth bypass.
- Auth setup and passphrase reset remain part of the web auth flow, not the CLI.
- The packaged app serves the built SPA from `dist/` and fails fast if `dist/` is missing.

## Contributing

Issues and pull requests are welcome. For drag-and-drop behavior, see [docs/drag_drop.md](docs/drag_drop.md).
