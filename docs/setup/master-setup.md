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