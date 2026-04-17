# CLI model feedback

Running log of friction when agents use `hirotm`, so we can harden docs, CLI ergonomics, or skills without re-discovering issues.

---

## 2026-04-17 — `hirotm` usage during task body update (task 16295)

**Prompt / question (user):** inspect the `hirotm` commands from the prior turn, explain what was struggled with, and why so many commands were run.

**Commands run (in order):**

1. `hirotm server status --dev --profile dev` — OK (server up).
2. `hirotm tasks update --help --dev --profile dev` — failed: `unknown option '--dev'`.
3. `hirotm statuses list --dev --profile dev` — failed: `unknown option '--dev'`.
4. `hirotm tasks list --dev --profile dev --limit 5 --task-id 16295` — failed: `--board` required.
5. `hirotm --help` — inspect global options.
6. `hirotm --profile dev --port 3002 statuses list --format human` — OK (workflow statuses).
7. `hirotm --profile dev --port 3002 query search "16295" --limit 20 --format human` — no rows (FTS did not surface that task by numeric query alone).
8. `hirotm --profile dev --port 3002 boards list --format human` — OK.
9. `hirotm --profile dev --port 3002 boards list --fields slug` — OK (slug for `--board`).
10. `hirotm tasks --help --profile dev --port 3002` — subcommands.
11. `hirotm --profile dev --port 3002 tasks show 16295` — OK (global task id; no `--board`).
12. `hirotm tasks update --help --profile dev --port 3002` — OK (confirmed `--board` required for update).
13. `hirotm --profile dev --port 3002 tasks update --board hiro-task-manager-board --body-file … --client-name "Cursor Agent" 16295` — OK.

**Analysis (why so many steps):**

- **`--dev` is not global on every subcommand.** Passing `--dev` after `tasks update` or `statuses list` makes Commander treat it as that subcommand’s option; only commands that register `--dev` accept it. Recovery was to use `--profile dev --port 3002` with the dev server already listening on that port.
- **`tasks list` vs `tasks show` vs `tasks update`:** `show` uses global task id without `--board`; `list` and **`update` require `--board`**, which was not obvious until help / failures.
- **Discovery:** `query search "16295"` returned no hits; the task was found by **`tasks show 16295`** after board listing. Search behavior for numeric ids may deserve a doc note.
- **Skill vs reality:** AGENTS.md says `--dev --profile dev` everywhere; in practice that breaks on subcommands that do not register `--dev`. Align skill text with “global options before subcommand” or “omit `--dev` on HTTP subcommands when using `--profile` + `--port`.”

**Follow-ups (for later):**

- [ ] Clarify in `AGENTS.md` / Hiro Task Manager CLI skill when `--dev` applies and suggest `hirotm --profile dev --port <port>` for API commands if `unknown option '--dev'`.
- [ ] Optional: document “find task by id” as `tasks show <id>` first; search may not match raw numbers.
- [ ] Optional: consider making `--dev` inherited or global for consistency (product decision).
