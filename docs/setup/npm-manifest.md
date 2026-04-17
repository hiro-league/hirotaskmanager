# Local Install

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

# Publishing

## NPM Login

```bash
npm whoami
```

```bash
npm login
```

## Check the Package

Release Check
```bash
npm run release:check
```

Publish dry-run

```bash
npm publish --dry-run --access public
```

## PUBLISH!

```bash
npm run release:publish
```

OR

```bash
npm publish --access public
```

## GITHUB WORKFLOW

Add Here, Testing and Publishing workflow - CI/CD

# Removal of Package

```bash
 npm uninstall -g @hiroleague/taskmanager
```

```bash
npm uninstall -g taskmanager
```

```bash
bun remove -g @hiroleague/taskmanager
```

# Check Traces

```bash
npm list -g --depth=0
```

```bash
bun pm ls -g
```
find orphan shims

```bash
where.exe hirotm
```

```git bash
which -a hirotm
```


# Pack and Release