## 1. Dev Installation

More accurate:

```bash
npm install
npm run pack:install
```

or faster 

```bash
npm install
npm link
```

## 2. Production Installation

## 3. Publishing

### NPM Login

```bash
npm whoami
```

```bash
npm login
```

### Check the Package

#### Release Check
```bash
npm run release:check
```

#### Publish dry-run

```bash
npm publish --dry-run --access public
```

### PUBLISH!

```bash
npm run release:publish
```

OR

```bash
npm publish --access public
```


## 4. Building Dev Env

## 5. Testing Commands


server, shared, CLI, and other suites; excludes **`src/client/**`** and **`e2e/**`** (those use Vitest and Playwright).

```bash
bun test
npm run test
```
client (React) unit and component tests, one shot.

```bash
vitest run
npm run test:client
```

same client suite in watch mode.

```bash
vitest
npm run test:client:watch
```

browser E2E under **`e2e/`** (ensure dev ports are free; see Playwright config).

```bash
playwright test
npm run test:e2e
```

Playwright with the interactive UI runner.

```bash
playwright test --ui
npm run test:e2e:ui
```

Playwright with a visible browser.

```bash
playwright test --headed
npm run test:e2e:headed
```

Optional, slower integration (not in default **`test`** / **`release:check`**):

CLI subprocess tests against a real local API + SQLite stack (see **`docs/testing-and-perf/cli-testing.md`**).

```bash
bun run scripts/run-cli-real-stack-test.ts
npm run test:cli:real-stack
```

More context: **`docs/testing-and-perf/client-testing.md`**.

## 6. Skills Setup

### Add Skills

```bash
npx skills add hiro-league/hirotaskmanager
```

### Remove Skills

```bash
npx skills remove hiro-league/hirotaskmanager
```


## 7. Package Cleanup

### Uninstall Packages and leftover executable shims
```bash
npm run clean:global
```

### List profiles

```bash
npm run clean:profiles
```

### Delete all profiles except 'dev':

```bash
pwsh -File scripts/uninstall/clean-profiles.ps1 -Profiles AllExceptDev
```

### Delete all Profiles or whole .taskmanager

```bash
npm run clean:profiles:all
npm run clean:profiles:nuke
```

More at [Script Documentation](../../scripts/uninstall/README.md)



## 8. GITHUB WORKFLOW

Add Here, Testing and Publishing workflow - CI/CD