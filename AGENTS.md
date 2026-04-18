# TaskManager Agent Guide

Use the `hiro-task-manager-cli` skill to interact with the TaskManager API via `hirotm`.

## Profile override (this repo only)

When working in this repository, always pass `--profile dev` unless told otherwise:

```bash
hirotm server status --profile dev
hirotm server start --profile dev
hirotm boards list --profile dev
```

Outside this repo, end users typically run without `--profile` because the launcher writes a default-profile pointer at first-run setup.

## Things agents should NOT run

These commands are operator-only (interactive setup or sensitive credential handling). Ask the user to run them — never run them yourself:

- `hirotaskmanager` (with no args, or `--setup` / `--setup-server` / `--setup-client`) — interactive wizard.
- `hirotaskmanager server api-key generate | list | revoke` — mints/manages CLI credentials, prints raw secrets to stdout once.
- `hirotaskmanager profile use <name>` — changes the default profile system-wide.

If a command fails with `auth_cli_key_required` or `auth_invalid_cli_key`, stop and ask the user to issue or paste a CLI API key; do not attempt to bypass auth.
