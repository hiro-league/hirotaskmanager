# Uninstall — one-page manifest

> All commands work from **bash, cmd, and PowerShell** on Windows. They use
> `powershell` (built into Windows), not `pwsh` (PowerShell 7, optional).

## Pick your goal, run one command

| Goal | Command |
|---|---|
| Preview package cleanup (no changes) | `npm run clean:global:dry` |
| Uninstall packages + delete orphan `hirotm` / `hirotaskmanager` shims | `npm run clean:global` |
| See what's in `~/.taskmanager` (no deletion) | `npm run clean:profiles` |
| Delete **all** profiles | `npm run clean:profiles:all` |
| Delete all profiles **except `dev`** | `npm run clean:profiles:keep-dev` |
| Wipe entire `~/.taskmanager` (skills, config, profiles, logs) | `npm run clean:profiles:nuke` |
| Packages **and** profiles (keep `dev`) in one shot | `npm run clean:all` |

That's the whole API. If a row covers what you want, you don't need to read further.

## What each script actually touches

```
clean:global  (packages + shims)        →  npm globals, bun globals, orphan .cmd/.ps1/bare shims
clean:profiles* (~/.taskmanager only)   →  ~/.taskmanager/profiles/* (and the whole folder if :nuke)
clean:all                               →  both, in that order
```

`clean:global` **never** touches `~/.taskmanager`.
`clean:profiles*` **never** touches npm/bun packages.

## Safety

- `:nuke` always asks you to type the literal word `NUKE` to confirm — even with `-Force`.
- Profile cleanup runs a **pre-flight scan** that reads each target profile's
  `server.pid.json`, then **force-stops any running server** (`Stop-Process -Force`)
  before deleting the profile. You'll see exactly which PIDs were killed.
- `:dry` previews `clean:global` without changing anything.

## Need a custom keep-list?

Only this case needs the long form:

```bash
powershell -NoProfile -File scripts/uninstall/clean-profiles.ps1 -Profiles Named -Keep dev,work
```

## Direct script invocation (advanced)

If you want flags like `-DryRun`, `-Force`, or `-Keep`, call the scripts directly:

```bash
powershell -NoProfile -File scripts/uninstall/uninstall-packages.ps1 [-DryRun] [-Force]
powershell -NoProfile -File scripts/uninstall/clean-profiles.ps1     [-Profiles All|AllExceptDev|Named] [-Keep a,b] [-Nuke] [-DryRun] [-Force]
powershell -NoProfile -File scripts/uninstall/uninstall.ps1          [-AlsoProfiles ...] [-AlsoNuke] [-DryRun] [-Force]
```
