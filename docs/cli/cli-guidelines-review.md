# hirotm CLI — Guidelines Gap Review

Cross-references the `hirotm` CLI implementation (`src/cli/`) against two guideline sources:

- **Source A** — *Building CLI for Agents* (`hiro-docs/mintdocs/ai-coding-bible/building-cli-for-agents.mdx`)
- **Source B** — *Command Line Interface Guidelines* (`clig.dev`, downloaded as `clig.md`)

**Previous review**: `docs/hirotm-vs-building-cli-for-agents-review.md` covered Source A only. Several items from that review are now **Done** (exit codes, `CLI_ERR`, `--fields`, `--quiet`, compact JSON, NDJSON default, pagination). This document focuses on **remaining gaps** from Source A and **new gaps** from Source B.

**Initial development mode**: no backward compatibility or migration required unless noted.

**Mintlify docs:** When a gap below is closed and users can see new behavior (flags, subcommands, output), update the matching pages under `hiro-docs/mintdocs/` in the same change set. Treat those updates as **concise command reference** copy—what to type and what to expect—not implementation notes, library names, or internal field layouts unless users must know a name to filter output.

---

## What already aligns well

| Area | Source(s) | How hirotm matches |
|------|-----------|-------------------|
| Structured output (NDJSON default) | A §1, B Output | Default `--format ndjson`; one JSON line per row for list reads; compact JSON for mutations. |
| Stdout for data, stderr for errors | A §1, B Basics | `printJson` → stdout; `printError` → stderr; prompts/impact text → stderr. |
| Flat JSON shapes | A §1 | Write envelopes, list rows, and error payloads use flat top-level keys. |
| Consistent types | A §1 | Timestamps are ISO 8601 strings; numeric IDs are always numbers. |
| Exit-code contract (11 codes) | A §2, B Basics | `cli-http-errors.ts` maps HTTP status → exit code; `CLI_ERR` supplies stable `code` strings. |
| Structured error output | A §2,§7, B Errors | Stderr JSON includes `error`, `code`, optional `retryable`, `hint`, echoed input. |
| Noun → verb grammar | A §8, B Subcommands | `boards list`, `tasks add`, `releases show`, `boards configure groups`. Consistent verbs. |
| Composability: filters + projection | A §5, A CWD | `--group`, `--status`, `--priority`, `--release-id`, `--fields`, `--limit`, `--offset`, `--page-all`. |
| `--quiet` / pipe-friendly | A §5, B Output | Global `-q`/`--quiet`; one identifier per line; combinable with `--fields` (one key). |
| Confirmation bypass (`--yes`) | A §6, B Args | `--yes` / `-y` skips interactive prompts; non-TTY without `--yes` → exit 2 + `hint`. |
| Non-interactive detection | A §6, B Interactivity | `canPromptInteractively()` checks both stdin and stdout TTY; scripts get clear error + hint. |
| NO_COLOR support | B Output | `ansi.ts` disables ANSI when `NO_COLOR` is set. |
| TTY-gated color | B Output | Colors enabled only when stdout or stderr is a TTY. |
| Standard flag names | B Args | `-q`/`--quiet`, `-p`/`--port`, `-y`/`--yes`, `-b`/`--background`; long forms for all flags. |
| Pagination with totals | A CWD, B | Paginated envelope: `total`, `limit`, `offset`; `--page-all` for unbounded fetch. |
| Actionable errors with hints | A §7, B Errors | `hint` field suggests recovery; `retryable` separates transient from permanent. |
| Input validation | B Robustness | Port, limit, offset, fields, emoji all validated early with exit 2 + specific `code`. |

---

## Significant gaps — new findings

### Priority: High

#### 1. No `--version` flag

**Source:** B (Args — `--version` is a standard flag), B (Basics)

**Current state:** `createHirotmProgram()` does not call Commander's `.version()`. `package.json` has `"version": "0.0.1"` but it is not wired to the CLI. Running `hirotm --version` prints Commander's default help (unknown option).

**Impact:** Agents and humans cannot programmatically check CLI version. The `AGENTS.md` error table lists exit 8 for version mismatch, but there is no way to discover the running version.

**Recommendation:** Add `.version(pkg.version, "-V, --version")` to the program. Use `-V` to avoid collision with `-v` (commonly overloaded as verbose).

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx`, document `-V` / `--version` under Global options with example commands.

---

#### 2. No `--verbose` / `--debug` flag

**Source:** B (Args — `-d`/`--debug`), B (Output — verbose mode for developer info), A §7 (transient error details)

**Current state:** No global verbosity flag. Server start (foreground) inherits child stdio, but there is no way to get verbose output for HTTP requests, config resolution, or retry logic.

**Impact:** When debugging agent workflows, there is no way to see what URL was fetched, what profile resolved, or why a request timed out — users must read source code.

**Recommendation:** Add `--verbose` (or `--debug`) global flag. When set, print diagnostic info to stderr (request URL, resolved port/profile, response status, timing). Keep it out of stdout to preserve the data contract. Consider `DEBUG` env var as an alternative activator per clig.dev.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx`, add a Global options entry for the flag: what extra detail appears and that normal result output is unchanged.

---

#### 3. No examples in help text

**Source:** A §4 (realistic examples), B (Help — lead with examples)

**Current state:** Commander subcommands have `.description()` and option descriptions, but no `.addHelpText("after", ...)` with examples. Running `hirotm tasks list --help` shows flags but no copy-paste invocations.

**Impact:** Agents running `--help` to discover a command must infer correct flag combinations. Humans get no quick-start patterns. This is flagged in both guidelines as a top-tier help-text requirement.

**Recommendation:** Add 2–3 examples per high-traffic subcommand using Commander's `.addHelpText("after", ...)`:

```
Examples:
  hirotm tasks list --board my-board --limit 10
  hirotm tasks list --board my-board --status 2,3 --fields taskId,title
  hirotm tasks add --board my-board --list 1 --group 1 --title "Fix bug" --client-name "Cursor Agent"
```

Prioritize: `tasks list`, `tasks add`, `tasks update`, `query search`, `boards describe`, `server start`.

**Mintdocs (`hiro-docs/mintdocs/`):** Mirror the same examples on the matching command pages (`task-manager/cli/tasks.mdx`, `boards.mdx`, `search.mdx`, `server.mdx`, etc.) so the site matches `hirotm help …` copy-paste flows.

---

#### 4. No shell completion

**Source:** B (Help — subcommand discovery)

**Current state:** No completion scripts or Commander completion hooks. Tab-completing `hirotm boa<TAB>` does nothing in bash/zsh/fish.

**Impact:** Discoverability suffers for human users. Agents are unaffected (they use `--help`), but completion is a clig.dev recommendation for any CLI with subcommands.

**Recommendation:** Consider generating completion scripts via a `hirotm completion` subcommand (Commander supports this via plugins, or use `tabtab`/`omelette`). Low priority relative to agent-facing gaps but high value for humans.

**Mintdocs (`hiro-docs/mintdocs/`):** Add a short user section (new page or under `task-manager/cli/cli-commands.mdx`) for `hirotm completion`: how to install for bash/zsh/fish and verify tab completion—commands only, no implementation detail.

---

### Priority: Medium

#### 5. No `--dry-run` for destructive actions

**Source:** A §6, B (Args — `--dry-run`)

**Current state:** `delete`, `purge`, and `boards configure` require `--yes` but offer no preview. The agent cannot see what will happen before committing.

**Impact:** Agents must execute destructive actions to learn the result. A `--dry-run` on `boards configure groups` (structure replace) would be especially valuable since it can implicitly delete groups.

**Recommendation:** Add `--dry-run` to high-risk mutations (`boards configure groups/priorities`, `boards delete`, `tasks delete`, `purge` variants). Return structured JSON diff to stdout (what would be created/updated/deleted) with exit 0.

**Mintdocs (`hiro-docs/mintdocs/`):** On each affected command page (`task-manager/cli/boards.mdx`, `tasks.mdx`, `trash.mdx`, …), document `--dry-run` with example `hirotm …` lines and what “preview” output means for users.

---

#### 6. No `--no-color` flag

**Source:** B (Output — disable color methods)

**Current state:** Color is disabled via `NO_COLOR` env var and non-TTY detection. There is no `--no-color` CLI flag.

**Impact:** Users who want to disable color for a single invocation must set an env var. The clig.dev guidelines list four color-disable mechanisms: non-TTY, `NO_COLOR`, `TERM=dumb`, and `--no-color`. hirotm handles two of four.

**Recommendation:** Add `--no-color` global flag. Also check `TERM=dumb`. Both are low-effort since `ansi.ts` already has the enabled/disabled pattern — just add two more conditions.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx`, under Global options, document `--no-color` and when styling is off without that flag (`NO_COLOR`, `TERM=dumb`). Keep to one short subsection.

---

#### 7. No `TERM=dumb` handling

**Source:** B (Output — `TERM` variable with value `dumb`)

**Current state:** `ansi.ts` checks TTY and `NO_COLOR` but not `TERM=dumb`.

**Recommendation:** Add `process.env.TERM === "dumb"` to the disabled condition in `ansi.ts`.

**Mintdocs (`hiro-docs/mintdocs/`):** Same subsection as item 6 in `task-manager/cli/cli-commands.mdx`—one line that `TERM=dumb` turns off colors (users do not run a separate subcommand).

---

#### 8. Idempotent creates or `--if-not-exists`

**Source:** A §3

**Current state:** `boards add`, `lists add`, `tasks add`, `releases add` — if a resource with the same name/slug exists, behavior depends on the API (likely 409 → exit 5). No `--if-not-exists` or `ensure` variant.

**Impact:** Agent retries after transient failures may fail on duplicate creation. Exit 5 is correctly mapped, so agents can detect conflicts, but they must implement their own retry-with-check logic.

**Recommendation:** Either add `--if-not-exists` flags (returns existing resource on conflict instead of error) or document the exit 5 + `code: "conflict"` contract explicitly so agents build appropriate retry logic. The `--if-not-exists` approach is more agent-friendly.

**Mintdocs (`hiro-docs/mintdocs/`):** On `boards` / `lists` / `tasks` / `releases` add-docs (`task-manager/cli/boards.mdx`, `lists.mdx`, `tasks.mdx`, `releases.mdx`), document `--if-not-exists` or the conflict behavior in plain terms and example commands.

---

#### 9. Enrich errors with `suggestion` field consistently

**Source:** A §7 (suggest next steps), B (Errors — guide the user)

**Current state:** Some error paths include `hint` (e.g., server unreachable suggests the start command). Many paths (not-found, bad-request, forbidden) do not include suggestions.

**Impact:** When a board slug is wrong, the agent gets `code: "not_found"` but no suggestion to run `hirotm boards list` to find valid slugs. The agent must rely on AGENTS.md for recovery patterns.

**Recommendation:** Add `hint` or `suggestion` to the most common failure paths:
- not_found → `"Run 'hirotm boards list' or 'hirotm boards describe <slug>' to find valid identifiers"`
- forbidden → `"Check CLI access policy in the web app settings"`
- bad_request → echo the offending parameter name and value

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` (near Response format or errors), one short paragraph: failed runs may include a short hint suggesting what to run next—user outcome only, not a catalog of error codes.

---

#### 10. Concise help when run with no arguments

**Source:** B (Help — display concise help by default)

**Current state:** Running bare `hirotm` with no arguments shows Commander's full help output (all subcommands, all global flags). Running `hirotm boards` with no subcommand shows boards help.

**Impact:** Minor — Commander's default help is reasonable. However, clig.dev recommends that bare invocation show a concise summary with 1–2 examples and a pointer to `--help`, similar to how `jq` handles it.

**Recommendation:** Low effort: override Commander's default help for the root command to show a short intro + common examples + "Run hirotm --help for full usage." Keep full help on `--help`.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` or `cli-overview.mdx`, describe what `hirotm` alone prints versus `hirotm --help`—brief and example-led.

---

#### 11. Suggest corrections for typos

**Source:** B (Help — suggest what the user meant)

**Current state:** Commander shows "unknown command" for typos but does not suggest the closest match (e.g., `hirotm bords` → did you mean `boards`?).

**Impact:** Minor for agents (they use exact commands from AGENTS.md), moderate for humans.

**Recommendation:** Commander has a `.showSuggestionAfterError(true)` option — enable it on the root program. One-line change.

**Mintdocs (`hiro-docs/mintdocs/`):** Optional one sentence in `task-manager/cli/cli-commands.mdx`: typo’d subcommands may show a “did you mean …” line in the terminal.

---

#### 12. Web documentation link in help text

**Source:** B (Help — link to web docs), B (Documentation — provide web-based docs)

**Current state:** No URL in `hirotm --help` or subcommand help. AGENTS.md references docs but the CLI itself doesn't.

**Recommendation:** Add a link in the root help text footer: `"Docs: https://docs.hiroleague.com/task-manager/cli/cli-overview"` (or equivalent). Low effort via `.addHelpText("afterAll", ...)`.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` (“Learn more” / footer), use the same URL and label users see after `hirotm --help`.

---

#### 13. Count / cardinality command

**Source:** A (Context Window Discipline — expose cardinality up front)

**Current state (done):** Paginated list and search commands accept **`--count-only`**. The CLI requests **`limit=0`** once; ndjson stdout is **`{"count":N}`**, human mode prints **`count N`**, and **`--quiet`** prints the number alone. Server accepts **`limit=0`** (`parseListPagination`, `paginateInMemory`, and FTS search paging).

**Impact:** (Originally) agents could not estimate result size without pulling row payloads—addressed for the commands that support paging.

**Mintdocs (`hiro-docs/mintdocs/`):** Paging section in `cli-commands.mdx`; **`--count-only`** row + examples on boards, lists, tasks, releases, search, and trash pages.

---

#### 14. Pager support for long human output

**Source:** B (Output — use a pager for long text)

**Current state:** `--format human` prints tables directly to stdout with no paging. Large task lists or `boards describe` output can overflow the terminal.

**Impact:** Only affects human-readable mode; agents use NDJSON. Low priority.

**Recommendation:** When stdout is a TTY and `--format human`, consider piping through `$PAGER` or `less -FIRX` for list outputs exceeding a threshold (e.g., 50 rows). Check `PAGER` env var per clig.dev.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` under human output / paging, note when long tables may open in a pager and that `PAGER` can select the program—keep to user behavior, not defaults from this review.

---

#### 15. Secrets handling (`API_KEY` env var)

**Source:** B (Args — do not read secrets from flags; Env — do not read secrets from env vars)

**Current state:** `API_KEY` is read from environment variables (with config file fallback). The clig.dev guidelines explicitly warn against secrets in env vars due to leakage via `ps`, `docker inspect`, and `systemctl show`.

**Impact:** Low risk for a local-only tool, but worth noting for future auth implementations.

**Recommendation:** When authentication is fully implemented, prefer `--token-file <path>` or reading from a credentials file in the profile directory. Keep env var as a convenience fallback but document the risks. Do not add a `--token` flag that would leak into `ps` output.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/get-started/profiles.mdx` (or a small auth subsection), describe how users should pass API credentials: file path vs environment, in everyday language—no process-list or container internals.

---

### Priority: Low

#### 16. No `-` stdin/stdout for file arguments

**Source:** B (Args — support `-` for stdin/stdout)

**Current state:** `--body-stdin`, `--description-stdin`, `--stdin` are explicit flags. There is no `-` file convention (e.g., `--body-file -`).

**Impact:** The explicit `--stdin` flags are arguably clearer than `-` convention. This is a minor style gap.

**Recommendation:** Optional: accept `-` as a value for `--body-file` and `--description-file` as an alias for the `--stdin` variants. Low priority — current approach is fine for agents.

**Mintdocs (`hiro-docs/mintdocs/`):** On the command pages that expose those flags (`task-manager/cli/tasks.mdx`, `lists.mdx`, etc.), add one example line using `-` for standard input where supported.

---

#### 17. Progress indicators for long operations

**Source:** B (Robustness — show progress, responsive < 100ms)

**Current state:** `server start` shows health-check progress implicitly (prints status on success/failure). `--page-all` fetches all pages silently. No spinner or progress bar.

**Impact:** Minimal for agents. Humans running `--page-all` on large boards see no feedback until completion.

**Recommendation:** When `--format human` and stdout is TTY, show a spinner during `--page-all` multi-page fetches and `server start` health checks. Use stderr for progress so stdout stays clean. Libraries: `ora` or `cli-spinners` for Node.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` (Paging / `server` page), one short note that interactive human mode may show progress for long `hirotm` runs—no library names.

---

#### 18. XDG Base Directory compliance

**Source:** B (Configuration — follow XDG spec)

**Current state:** Config lives in `~/.taskmanager/profiles/<name>/`. This is a custom dotfile location, not XDG-compliant (`~/.config/taskmanager/`).

**Impact:** Adds another dotfile to `$HOME` instead of using `~/.config/`. Minor concern for a local development tool.

**Recommendation:** Consider supporting `$XDG_CONFIG_HOME/taskmanager/` with fallback to `~/.config/taskmanager/` on Linux/macOS. Windows already uses `%APPDATA%` conventions. Low priority for initial development.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/get-started/profiles.mdx`, state where profiles live on disk after the change—paths and env vars users set, per OS, without spec citations.

---

#### 19. Crash-only / recoverable design for `--page-all`

**Source:** B (Robustness — make it recoverable, crash-only)

**Current state:** `--page-all` fetches all pages in a loop. If interrupted mid-way, the agent gets partial output (NDJSON lines already emitted) but no resume mechanism.

**Impact:** For very large datasets, a network interruption mid-fetch loses progress. The NDJSON streaming design mitigates this (partial output is still valid), but there is no `--cursor` resume.

**Recommendation:** When cursor-based pagination is added (see existing review item 5), enable resume by documenting that agents can extract the last row's ID and resume with `--offset` or `--cursor`.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` (Paging list results), add user-facing steps for resuming a large fetch after interruption—`hirotm` flags and example commands only.

---

#### 20. Config precedence documentation

**Source:** B (Configuration — apply in order of precedence)

**Current state:** Precedence is: CLI flags → env vars → profile config file → defaults. This is correct but not documented in `--help` or AGENTS.md.

**Recommendation:** Add a brief precedence note to `AGENTS.md` or `hirotm --help` footer.

**Mintdocs (`hiro-docs/mintdocs/`):** In `task-manager/cli/cli-commands.mdx` or `get-started/profiles.mdx`, a short ordered list: command-line flags, then environment variables, then profile `config.json`, then defaults—same order users see in help if mirrored there.

---

## Summary table

| # | Gap | Source | Priority | Effort | Status |
|---|-----|--------|----------|--------|--------|
| 1 | `--version` flag | B | High | Trivial | Open |
| 2 | `--verbose` / `--debug` | B, A | High | Medium | Open |
| 3 | Examples in help text | A, B | High | Medium | Open |
| 4 | Shell completion | B | High | Medium | Open |
| 5 | `--dry-run` for destructive actions | A, B | Medium | High (API) | Open |
| 6 | `--no-color` flag | B | Medium | Trivial | Open |
| 7 | `TERM=dumb` handling | B | Medium | Trivial | Open |
| 8 | Idempotent creates / `--if-not-exists` | A | Medium | High (API) | Open |
| 9 | Consistent `suggestion`/`hint` in errors | A, B | Medium | Medium | Open |
| 10 | Concise bare-invocation help | B | Medium | Low | Open |
| 11 | Typo suggestions | B | Medium | Trivial | Open |
| 12 | Web docs link in help | B | Medium | Trivial | Open |
| 13 | Count / cardinality command | A | Medium | Medium (API) | Done (`--count-only`, `limit=0` API) |
| 14 | Pager for human output | B | Low | Medium | Open |
| 15 | Secrets via file, not env var | B | Low | Medium | Open |
| 16 | `-` for stdin file args | B | Low | Low | Open |
| 17 | Progress indicators | B | Low | Medium | Open |
| 18 | XDG Base Directory | B | Low | Medium | Open |
| 19 | Crash-only / resumable `--page-all` | B | Low | High (API) | Open |
| 20 | Config precedence docs | B | Low | Trivial | Open |

### Quick wins (trivial effort)

Items **1**, **6**, **7**, **11**, **12**, **20** can each be done in minutes with no API changes:

- `.version()` on Commander program → `cli-commands.mdx`: `-V` / `--version` (see item 1 Mintdocs).
- `--no-color` global flag + `TERM=dumb` check in `ansi.ts` → `cli-commands.mdx`: Global options (see items 6–7 Mintdocs).
- `.showSuggestionAfterError(true)` on Commander → optional line in `cli-commands.mdx` (item 11).
- `.addHelpText("afterAll", "Docs: ...")` on root program → same docs URL in `cli-commands.mdx` footer (item 12).
- Config precedence note in AGENTS.md → `cli-commands.mdx` or `profiles.mdx` ordered list (item 20).

---

## References

- Source A: `hiro-docs/mintdocs/ai-coding-bible/building-cli-for-agents.mdx`
- Source B: `clig.dev` / Command Line Interface Guidelines (`clig.md`)
- Previous review: `docs/hirotm-vs-building-cli-for-agents-review.md`
- Implementation: `src/cli/` (notably `bootstrap/program.ts`, `lib/output.ts`, `lib/ansi.ts`, `lib/command-helpers.ts`, `lib/cli-http-errors.ts`, `types/errors.ts`)
- Agent docs: `AGENTS.md`, `.cursor/skills/hirotm-cli/SKILL.md`
