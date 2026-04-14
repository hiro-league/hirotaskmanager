# npm: pack, local install, test

Repo root: `@hiroleague/taskmanager`. CLI bin: `hirotm`.

## Pack

```bash
npm pack
```

Writes `hiroleague-taskmanager-<version>.tgz` in the current directory. `prepack` runs `npm run build` first.

Optional gate before packing:

```bash
npm run release:check
```

## Install the tarball locally (project)

```bash
cd /path/to/empty-or-test-project
npm install /absolute/path/to/hiroleague-taskmanager-<version>.tgz
```

## Test (local dependency)

Prefer `npx` so you use this project’s install, not a global shim:

```bash
npx hirotm server status
```

Or:

```bash
./node_modules/.bin/hirotm server status
```

## Global install (no registry upload)

From the directory that contains the `.tgz`:

```bash
npm install -g ./hiroleague-taskmanager-<version>.tgz
```

Then `hirotm` is on PATH (if npm’s global bin is on PATH).

## Global install with Bun

```bash
bun install -g ./hiroleague-taskmanager-<version>.tgz
```

(or `bun install -g @hiroleague/taskmanager` from the registry, if published.)

**Uninstall** — use Bun, not npm; global installs are separate:

```bash
bun remove -g @hiroleague/taskmanager
```

List what Bun installed globally:

```bash
bun pm ls -g
```

If `where hirotm` (Windows) or `which -a hirotm` points at something like `~/.bun/bin/hirotm.exe`, removing it is `bun remove -g` with the package name from `bun pm ls -g`, not `npm uninstall -g`.

## Publish dry-run

```bash
npm publish --dry-run --access public
```

---

# Troubleshooting (order of use)

1. **See which `hirotm` runs** (first line wins):

   - Windows: `where hirotm`
   - Git Bash: `which -a hirotm`

2. **If bare `hirotm` fails but `npx hirotm` works** — PATH is using a broken or old global shim. Use `npx` in the test project, or fix/remove globals (below).

3. **List global packages:**

   ```bash
   npm list -g --depth=0
   ```

4. **Remove global installs** (use names that actually appear in step 3):

   ```bash
   npm uninstall -g taskmanager
   npm uninstall -g @hiroleague/taskmanager
   ```

   There is no package named `hirotm`; uninstall the **package** that provides the bin.

5. **Installed with Bun instead of npm** — npm global uninstall does nothing for Bun’s copy. Check `bun pm ls -g`, then `bun remove -g @hiroleague/taskmanager` (or the name shown there). **npm and Bun maintain separate global package trees**; uninstall with the same tool you used to install.

6. **Orphan shims** — after uninstall, `where hirotm` may still find `AppData\Roaming\npm\hirotm` / `hirotm.cmd`. If the package is gone but those files remain, delete `hirotm`, `hirotm.cmd`, and `hirotm.ps1` (if present) under that folder, then open a new terminal.

   If the path is `…\.bun\bin\hirotm.exe`, fix it with `bun remove -g …` (step 5), not by editing npm’s folder.

7. **Confirm what a project resolved:**

   ```bash
   npm ls @hiroleague/taskmanager
   npm explain @hiroleague/taskmanager
   ```

8. **Inspect tarball contents without writing a file:**

   ```bash
   npm pack --dry-run
   ```
