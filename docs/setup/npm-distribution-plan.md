# npm distribution plan

This document is the implementation plan for turning TaskManager into a clean Bun-installed app with a simple user experience.

## Goal

End-user install should be:

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager
```

Optional no-install run:

```bash
bunx @hiroleague/taskmanager
```

The package should ship:

- the production web app
- the API server
- the `hirotm` CLI

The normal user flow should not require:

- cloning the repo
- running setup shell scripts
- setting environment variables
- manually building the app

## Final decisions

### Package and command names

- npm scope: `@hiroleague`
- package name: `@hiroleague/taskmanager`
- app command: `hirotaskmanager`
- automation/admin CLI command: `hirotm`

The scope is only for the package name. Users do not need to type the scope when calling installed binaries.

Examples:

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager
hirotm status
```

### Install model

Primary recommendation:

```bash
bun install -g @hiroleague/taskmanager
```

Why this is the primary path:

- it exposes `hirotaskmanager` and `hirotm` on PATH
- users can call the commands from anywhere
- it avoids typing `bunx` every time

Secondary path:

```bash
bunx @hiroleague/taskmanager
```

Why keep `bunx` at all:

- quick try-before-install flow
- easy support/testing path
- useful for users who do not want a global install yet

### Runtime model

Installed app should behave like production by default, but users should never have to set `NODE_ENV=production` manually.

Long-term elegant direction:

- stop using `NODE_ENV` as the main mode switch for installed vs dev behavior
- use explicit runtime entrypoints and explicit profile/config resolution instead

### Cleanup policy

The end state of this project should be clean code, not backward compatibility.

Rules for the final state:

- remove legacy install paths from primary docs once the packaged install is ready
- remove user-facing `NODE_ENV`, `PORT`, and `DATA_DIR` setup instructions from the normal install path
- remove old installed-app codepaths that rely on generic env switching once explicit bootstraps exist
- remove duplicated config locations once profile-based config lands
- remove compatibility shims after migrating existing local state if needed
- do not keep old launchers, old docs, or old config resolution paths indefinitely just to preserve pre-release behavior

Temporary migration code is acceptable only during the transition. By the final phase, there should be one clear installed-app path and one clear dev path.

### First-run configuration

Port and data directory should be handled by the launcher, not by shell env.

`hirotaskmanager` should run launcher setup automatically on first run when no saved launcher config exists.

`hirotaskmanager --setup` should rerun launcher setup later for users who want to change saved defaults.

First run of `hirotaskmanager` should:

1. load saved config if present
2. otherwise prompt once for:
   - port, default `3001`
   - data directory, default `%USERPROFILE%\.taskmanager\data` on Windows
3. save answers to a config file
4. start the server
5. open or print the local URL

Auth setup remains in the web app:

1. launcher starts the app
2. browser opens the app
3. app detects uninitialized auth
4. user chooses passphrase in the UI
5. recovery key is printed once by the server

### Dev/install coexistence

Installed app and local development should not fight over the same runtime profile.

Target separation:

- installed profile: `default`
- dev profile: `dev`
- installed port default: `3001`
- dev API default: `3002`
- dev web default: `5173`
- installed data: `%USERPROFILE%\.taskmanager\profiles\default\data`
- dev data: `%USERPROFILE%\.taskmanager\profiles\dev\data`
- installed auth: `%USERPROFILE%\.taskmanager\profiles\default\auth`
- dev auth: `%USERPROFILE%\.taskmanager\profiles\dev\auth`

This avoids:

- shared database confusion
- shared auth state confusion
- accidental port conflicts

## What the package must contain

The published npm tarball must include all runtime assets needed to run the app after install.

Required contents:

- server runtime files under `src/server` or a packaged runtime equivalent
- shared runtime files needed by the server
- migration files
- built frontend assets in `dist/`
- CLI entry files for `hirotaskmanager` and `hirotm`

Do not rely on end-user install hooks such as:

- `postinstall`
- `prepare`
- `prepublishOnly` on the user machine

Build in CI or before publish, then publish the finished package.

## Implementation plan

## Phase 1: publishable package metadata

Update `package.json` so the repo can be published.

Required changes:

- remove `"private": true`
- set `"name": "@hiroleague/taskmanager"`
- keep or bump `"version"`
- add `"license"`
- add `"repository"`
- add `"homepage"`
- add `"bugs"`
- add `"files"` to limit the published tarball to runtime assets
- expose both bins:
  - `"hirotaskmanager"`
  - `"hirotm"`

Target `bin` shape:

```json
{
  "bin": {
    "hirotaskmanager": "./src/cli/bin/hirotaskmanager.ts",
    "hirotm": "./src/cli/bin/hirotm.ts"
  }
}
```

Notes:

- `hirotm` stays the power-user and automation CLI
- `hirotaskmanager` is the main app launcher
- `src/cli/index.ts` and `src/cli/app.ts` re-export the bin files for older docs/scripts

## Phase 2: add a dedicated app launcher

Implemented under `src/cli/bootstrap/launcher.ts`; thin entry is `src/cli/bin/hirotaskmanager.ts`.

Suggested file (historical; logic now in bootstrap):

`src/cli/bootstrap/launcher.ts` (formerly `app.ts`)

Responsibilities:

1. resolve the active profile
2. load config from the profile
3. prompt for first-run config if missing
4. choose port and data dir defaults
5. start the server in installed-app mode
6. print the app URL
7. optionally open the browser

This command is for humans launching the app, not for board automation.

Suggested behavior:

- `hirotaskmanager`
  - start app using saved config or defaults
- `hirotaskmanager --setup`
  - rerun launcher setup
- `hirotaskmanager --port 4000`
  - override saved port for this run
- `hirotaskmanager --data-dir D:\TaskData`
  - override saved data dir for this run
- `hirotaskmanager --profile dev`
  - explicit non-default profile

## Phase 3: explicit profile/config model

Replace the current mix of cwd defaults, `NODE_ENV`, and home-dir fallback with a single profile-driven resolver.

Suggested home layout:

```text
%USERPROFILE%\.taskmanager\
  profiles\
    default\
      config.json
      auth\
        auth.json
      data\
        taskmanager.db
    dev\
      config.json
      auth\
        auth.json
      data\
        taskmanager.db
```

Config example:

```json
{
  "port": 3001,
  "data_dir": "C:\\Users\\<user>\\.taskmanager\\profiles\\default\\data",
  "auth_dir": "C:\\Users\\<user>\\.taskmanager\\profiles\\default\\auth",
  "open_browser": true
}
```

Resolution order should become:

1. explicit CLI flags
2. profile config file
3. hard defaults for that profile

Environment variables may remain as low-level overrides for development and debugging, but they should no longer be the normal documented path for users.

## Phase 4: remove `NODE_ENV` as the user-facing runtime switch

Current behavior uses `NODE_ENV=production` to control:

- static SPA serving
- production data-dir default
- dev-only CORS behavior

Long-term refactor target:

- `src/server/bootstrapInstalled.ts`
- `src/server/bootstrapDev.ts`

Or equivalent explicit bootstrap functions:

- `startInstalledServer()`
- `startDevServer()`

Installed bootstrap should:

- always serve the built SPA from `dist`
- always use installed-profile config resolution
- never require the user to set `NODE_ENV`

Dev bootstrap should:

- keep the current local development flow
- keep dev-only CORS/Vite assumptions
- use the `dev` profile by default

Important: this refactor is recommended, but it does not have to block the first publish. The first release can still set `NODE_ENV=production` internally in the launcher as an implementation detail.

## Phase 5: package `dist/` correctly

Production already serves `dist/`, so the published package must contain it.

Required work:

1. build the frontend before publish
2. ensure `dist/` is included in the tarball
3. ensure runtime path resolution still points to the packaged `dist/`

Validation:

- install the packed tarball locally
- run `hirotaskmanager`
- verify the app loads without rebuilding

If path resolution breaks after packaging, adjust server path resolution to use package-relative paths rather than repo-only assumptions.

## Phase 6: keep `hirotm` working in the packaged install

`hirotm` already has useful config and server-starting behavior.

Current useful behavior already present:

- `hirotm server start` starts the server in production mode internally
- config file lookup already exists
- port and data-dir resolution already exists

Required follow-up:

- align `hirotm` config resolution with the new profile model
- make sure `hirotm` and `hirotaskmanager` share the same default profile when appropriate
- keep `hirotm` pointed at the installed app server by default

End-state:

- `hirotaskmanager` is the human launcher
- `hirotm` is the machine-friendly CLI

## Phase 7: dev mode changes

Development on the same machine should not reuse the installed runtime profile.

Required changes:

- change dev API default port from `3001` to `3002`
- update Vite proxy target to `3002`
- run dev with the `dev` profile by default
- keep dev auth/config in the `dev` profile paths
- keep development SQLite in the repo `data/` folder by default

Benefits:

- installed app can remain running on `3001`
- local dev can run independently on `3002`
- auth setup and session state remain isolated
- database contents remain isolated

## Phase 8: first-run setup UX

Launcher setup should be short and safe.

Recommended prompt flow:

1. Welcome to TaskManager
2. Port? default `3001`
3. Data directory? default shown
4. Open browser automatically? default `yes`
5. Save config
6. Start app

Rules:

- pressing Enter accepts defaults
- setup should only appear on first run or `--setup`
- the launcher should create needed directories automatically
- auth passphrase setup remains in the browser UI after the server starts

## Phase 9: npm publishing setup

Manual account setup to do later:

1. create or log into npm account
2. create the `hiroleague` org or scope owner
3. confirm access to publish `@hiroleague/taskmanager`
4. generate an npm access token
5. store the token for local publish and later CI

First publish checklist:

1. update package metadata
2. build the app
3. verify tarball contents
4. publish publicly

Expected publish command:

```bash
npm publish --access public
```

Notes:

- use npm as the registry
- users can still install and run the package with Bun
- scoped public packages need `--access public`
- repository publish metadata now lives in `package.json` via `publishConfig`
- local preflight command: `npm run release:check`
- local publish command: `npm run release:publish`

## Phase 10: release automation

After the first manual publish works, automate it.

Recommended CI steps:

1. install dependencies
2. run typecheck
3. run tests
4. build frontend
5. verify package contents
6. publish on tagged release

Store `NPM_TOKEN` in GitHub Actions secrets.

Implemented automation:

- GitHub Actions workflow: `.github/workflows/release-npm.yml`
- manual dispatch runs release checks without publishing
- pushing a tag like `v0.0.1` runs checks, verifies the tag matches `package.json`, then publishes to npm with provenance

Required GitHub secret:

- `NPM_TOKEN`

Expected release flow:

1. bump `package.json` version
2. run `npm run release:check`
3. commit the release changes
4. create and push tag `v<package.json version>`
5. GitHub Actions publishes the package

## Phase 11: remove legacy paths and cleanup

After the new installed and dev flows are working, delete the obsolete paths instead of preserving them.

Cleanup target:

- remove legacy installed-app instructions that require manual env vars
- remove top-level install docs that present multiple equivalent decision trees
- remove repo-root helper scripts that only exist to compensate for missing packaging
- remove old config file fallbacks after profile migration is complete
- remove installed-app codepaths that still infer behavior from cwd or ad-hoc env branching
- remove duplicate bootstrap logic after explicit installed/dev bootstraps are live

If local migration is needed, do it once, then delete the migration shim in a follow-up once the new format is stable. This project has not shipped publicly yet, so cleanliness should win over backward compatibility.

## README target after implementation

After this plan is implemented, the top of `README.md` should become very short.

Desired install section:

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager
```

Then:

- open `http://localhost:3001`
- complete passphrase setup in the browser
- save the recovery key shown in the terminal

Advanced configuration such as custom port, profile, and data directory should move lower in the README or into a dedicated configuration section.

## Recommended implementation order

Do the work in this order:

1. package metadata and `files`
2. add `hirotaskmanager` launcher bin
3. keep first release using internal `NODE_ENV=production`
4. make first-run launcher config persist to home dir
5. ensure `dist/` is packaged and served correctly
6. test local tarball install
7. publish first version
8. refactor to explicit installed/dev bootstraps
9. add profile-based auth and data isolation
10. switch dev defaults to `dev` profile and port `3002`
11. remove legacy launch/config paths
12. simplify README and setup docs

This order gets a clean user install first, then improves internal elegance without blocking release.

## Acceptance checklist

The plan is complete when all of the following are true:

- `bun install -g @hiroleague/taskmanager` works
- `hirotaskmanager` works from any directory
- `hirotm` works from any directory
- first run does not require shell env variables
- first run does not require cloning the repo
- first run does not require building the app
- packaged install serves the web UI and API from one command
- installed app and dev environment can run on the same machine without sharing auth, DB, or port defaults
- README install section is one short path, not a decision tree
- no legacy launch/config/bootstrap path remains as a permanent compatibility layer

## Short answer to the main product questions

- prefer `bun install -g` as the main install path
- keep `bunx` as an optional quick-run path
- use the scope `@hiroleague` for the package, not for the command names
- keep `hirotm` as the short CLI command
- hide `NODE_ENV` from users immediately
- remove `NODE_ENV` as the core runtime switch later through explicit bootstraps
- make port and data-dir part of launcher setup, not the browser setup
- separate installed and dev profiles so both can coexist cleanly
