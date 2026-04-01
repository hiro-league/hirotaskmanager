```md
# TaskApp CLI (Bun + TypeScript) — Minimal Recipe

## Goal
Expose a single command (`taskapp`) that:
- runs your app (`dev`, `start`, etc.)
- performs app actions (`tasks`, `boards`, etc.)
- works on Windows/macOS/Linux

---

## 1) Add a CLI entry

Create:
```

src/cli/index.ts

```

Top line (important):
```

#!/usr/bin/env bun

```

---

## 2) Install a CLI parser

Pick one:

```

bun add commander

# OR

bun add cac

```

---

## 3) Wire CLI to your app

Two types of commands:

### A) Runtime (wrap existing scripts)
- `taskapp dev` → runs your current `npm run dev`
- `taskapp start` → runs server (port 3001)
- `taskapp build`
- `taskapp typecheck`

### B) App actions (call your services directly)
- `taskapp boards:list`
- `taskapp tasks:create`
- `taskapp tasks:move`

**Important:**  
CLI must call your **service/domain layer**, NOT raw SQLite.

---

## 4) Add `bin` to package.json

```

{
"name": "taskapp",
"bin": {
"taskapp": "./src/cli/index.ts"
}
}

```

This makes `taskapp` available as a command.

---

## 5) Run locally

```

bun run src/cli/index.ts dev

```

Optional script:
```

"scripts": {
"cli": "bun run src/cli/index.ts"
}

```

---

## 6) Install globally

```

bun install -g .

```

Now usable as:

```

taskapp dev
taskapp start
taskapp boards:list --json
taskapp tasks:create ...

```

---

## 7) Output rules (for Cursor)

- All read commands support: `--json`
- Always return IDs + structured data
- No interactive prompts
- Clear errors + exit codes

---

## 8) Safety rules

- No raw SQL commands
- No direct DB file edits
- Destructive actions require confirmation flag
- Prefer snapshots/export before bulk changes

---

## 9) Cursor usage guideline (add as AGENTS.md)

```

* Use `taskapp ... --json` to inspect state
* Use CLI for all task/board operations
* Do NOT modify SQLite directly
* Do NOT write SQL unless explicitly required

```

---

## 10) Cross-platform notes

- Works on Windows / macOS / Linux
- Requires Bun installed
- Avoid OS-specific shell commands (use JS/Bun APIs)

---

## Final Result

```

# install once

bun install -g taskapp

# run app (API + frontend)

taskapp dev

# use CLI

taskapp boards:list --json
taskapp tasks:create ...

```

👉 One command. One package. Full control surface for Cursor.
```
