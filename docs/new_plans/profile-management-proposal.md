# Profile Management Proposal

## Status: Proposal

## Note (current product behavior)

Until `hirotm profile` exists, port and paths are set only via **`config.json`** (or **`hirotaskmanager --setup`**). The **`--port`** / **`--data-dir`** flags in this proposal are **future** subcommand options for `profile create` / `profile update`, not the removed global **`hirotm --port`**, **`server start --data-dir`**, or launcher **`--browser`** overrides.

## Problems

1. **Hardwired "default" profile** — first install creates a profile named `default`; running without args always uses `default`. No choice at creation time.
2. **No CLI commands for profiles** — no way to create, list, inspect, update, or delete profiles through `hirotm`.
3. **No dev-profile shorthand** — no easy way to create a profile that links `data_dir` to a repo-local `data/` folder.
4. **Port clashes are silent** — the user picks their own port with no conflict detection across profiles.
5. **JSON-editing only** — changing a profile after creation means hand-editing `~/.taskmanager/profiles/<name>/config.json`.

## Design Principles

- Profiles are already well-structured on disk (`~/.taskmanager/profiles/<name>/config.json`). The missing piece is a CLI surface on top of them.
- Follow the existing `hirotm <resource> <verb>` pattern (like `hirotm boards list`, `hirotm tasks create`).
- No backward compatibility required (initial development mode).
- No new environment variables.
- `config.json` schema (`RuntimeConfigFile`) stays unchanged.

## Proposed Command: `hirotm profile <verb>`

New file: `src/cli/commands/profile.ts` with `registerProfileCommands(program, ctx)`, registered in `program.ts` alongside boards, tasks, etc.

---

### 1. `hirotm profile list`

List all profiles on disk with their key settings and running status.

```
hirotm profile list [--format ndjson|human]
```

**ndjson output (one object per line):**

```json
{"name":"default","port":3001,"data_dir":"~/.taskmanager/profiles/default/data","running":true}
{"name":"dev","port":3002,"data_dir":"D:/projects/hirotaskmanager/data","running":false}
{"name":"staging","port":3005,"data_dir":"~/.taskmanager/profiles/staging/data","running":false}
```

**human output:**

```
NAME      PORT   DATA DIR                                    RUNNING
default   3001   ~/.taskmanager/profiles/default/data         yes
dev       3002   D:/projects/hirotaskmanager/data             no
staging   3005   ~/.taskmanager/profiles/staging/data         no
```

**Implementation:** Scan `~/.taskmanager/profiles/*/config.json`, read each, check `server.pid.json` to determine running state.

---

### 2. `hirotm profile create <name>`

Create a new named profile, interactively or with flags.

```
hirotm profile create <name> [--port <port>] [--data-dir <path>] [--open-browser] [--no-open-browser] [--dev]
```

**Behavior:**

- **Interactive (TTY, no flags):** prompt for port, data-dir, open-browser — same UX as the existing launcher setup flow.
- **Non-interactive or flags given:** use flags (or defaults) silently.
- **`--dev` flag:** changes the default port to 3002 and, if `--data-dir` is not given, defaults to `<cwd>/data` (the repo's data folder) instead of the profile-scoped one. Solves the "dev profile linked to repo" problem.
- **Port conflict detection:** before saving, scan all existing profiles' ports. If the chosen port is already claimed by another profile, warn and either prompt for a different one (interactive) or exit with an error (non-interactive).
- **Auto-increment default port:** if the default port (3001 for installed, 3002 for dev) is already taken by another profile, auto-pick the next free port.
- Writes `config.json` and creates `data/` + `auth/` directories.
- Errors if profile name already exists (use `profile update` instead).

**Examples:**

```bash
# Quick dev profile pointing at repo data
hirotm profile create dev --dev --data-dir ./data

# Interactive creation
hirotm profile create staging
# > Pick a port [3003]:
# > Data directory [~/.taskmanager/profiles/staging/data]:
# > Open browser on start? [Y/n]: n
# Profile "staging" created.
```

---

### 3. `hirotm profile show [name]`

Show the full resolved configuration for a profile.

```
hirotm profile show [name]    # defaults to current --profile or "default"
```

**Output:**

```json
{
  "name": "dev",
  "port": 3002,
  "data_dir": "D:/projects/hirotaskmanager/data",
  "auth_dir": "~/.taskmanager/profiles/dev/auth",
  "open_browser": false,
  "config_path": "~/.taskmanager/profiles/dev/config.json",
  "running": true,
  "pid": 12345,
  "url": "http://127.0.0.1:3002"
}
```

Full visibility without opening JSON files.

---

### 4. `hirotm profile update [name]`

Update one or more settings on an existing profile.

```
hirotm profile update <name> [--port <port>] [--data-dir <path>] [--open-browser] [--no-open-browser]
```

**Behavior:**

- Reads existing `config.json`, merges in the provided flags, writes back.
- Same port-conflict detection as `create`.
- If the server is running for this profile, warn that changes take effect on next restart.
- If no flags given and TTY is interactive: re-run the interactive prompts pre-filled with current values (like `--setup` today).

**Example:**

```bash
hirotm profile update default --port 4000
# Profile "default" updated. Restart the server for changes to take effect.
```

---

### 5. `hirotm profile delete <name>`

Remove a profile and its data from disk.

```
hirotm profile delete <name> [-y]
```

**Behavior:**

- Refuses to delete a profile whose server is currently running (exit with error + hint to stop first).
- Without `-y`: confirmation prompt — "Delete profile 'staging' and all its data? [y/N]".
- Removes the entire `~/.taskmanager/profiles/<name>/` directory.
- Cannot delete the last remaining profile (guard against orphaning the install).

---

### 6. `hirotm profile use <name>` *(optional / stretch)*

Set the default profile so `--profile` is not needed on every command.

```
hirotm profile use dev
```

**Implementation:** Writes `~/.taskmanager/active-profile` (plain text, just the name). `resolveProfileName()` reads this as the fallback before falling back to `"default"`.

This is optional — `--profile` already works — but removes friction for users who primarily work with one non-default profile.

---

## Port Conflict Detection (detail)

Two new helpers in `src/shared/runtimeConfig.ts`:

```typescript
/** Return profile names whose saved port matches candidatePort, excluding excludeProfile. */
function findPortConflicts(candidatePort: number, excludeProfile?: string): string[]

/** Starting from basePort, find the next port not claimed by any existing profile. */
function nextAvailablePort(basePort: number): number
```

Called from `profile create`, `profile update`, and optionally from `server start` (to warn before binding).

---

## Code Changes

| Area | Change |
|------|--------|
| `src/cli/commands/profile.ts` | **New file** — all `profile` subcommands |
| `src/cli/bootstrap/program.ts` | Add `registerProfileCommands(program, ctx)` |
| `src/shared/runtimeConfig.ts` | Add `listAllProfiles()` scan, `deleteProfile(name)`, port-conflict helpers |
| `src/shared/runtimeConfig.ts` | `resolveProfileName()` — optionally read `~/.taskmanager/active-profile` (for `profile use`) |
| `src/cli/bootstrap/launcher.ts` | After first-run setup, print a hint about `hirotm profile create` |
| `src/cli/lib/process.ts` | Reuse `readServerStatus` for `profile list`/`show` running status |

## What Does NOT Change

- The `hirotaskmanager` launcher still creates "default" on first run (happy path for new users).
- `--profile` and `--dev` global flags work exactly as today.
- `config.json` schema (`RuntimeConfigFile`) stays the same.
- No new environment variables.

---

## Example Workflows

### New user installs, wants a dev profile

```bash
npm install -g hiroleague-taskmanager
hirotaskmanager                                      # creates "default" on port 3001
hirotm profile create dev --dev --data-dir ./data    # auto-picks port 3002
hirotm server start --profile dev --dev              # starts dev server
```

### Inspect what profiles exist

```bash
hirotm profile list --format human
# NAME      PORT   DATA DIR                                    RUNNING
# default   3001   ~/.taskmanager/profiles/default/data         yes
# dev       3002   D:/projects/hirotaskmanager/data             no
```

### Change port on an existing profile

```bash
hirotm profile update default --port 4000
# Profile "default" updated. Restart the server for changes to take effect.
```

### Clean up a profile

```bash
hirotm server stop --profile staging
hirotm profile delete staging -y
# Profile "staging" deleted.
```

### Set a default active profile

```bash
hirotm profile use dev
# Active profile set to "dev". All commands will use this profile unless --profile is specified.
```
