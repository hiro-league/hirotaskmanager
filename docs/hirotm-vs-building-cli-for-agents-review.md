# hirotm CLI vs. “Building CLI for Agents” — review report

This report compares the TaskManager `hirotm` CLI (see `src/cli/`) to the guidelines in `hiro-docs/mintdocs/ai-coding-bible/building-cli-for-agents.mdx` (Mintlify page *Building CLI for Agents*). It lists **ordered recommendations** so that foundational items come first; later items often depend on API shape, exit-code policy, or output contracts established earlier.

**Initial development:** no backward compatibility requirement unless noted; breaking changes to exit codes or error JSON are acceptable if documented.

**Canonical exit-code and stderr JSON contract:** `docs/cli-error-handling.md` (implemented).

---

## What already aligns well

| Guideline area | How hirotm matches |
|----------------|-------------------|
| **Structured output** | Successful reads and writes generally emit JSON to stdout via `printJson` (`src/cli/lib/output.ts`). |
| **Errors on stderr** | Failures use `printError` → JSON on stderr with `process.exit` (`output.ts`). |
| **Stdout vs stderr** | Search table mode is intentional human output; JSON path keeps stdout as data. |
| **Noun → verb** | Commands follow `boards|tasks|lists|releases|query|server|trash` + action (`list`, `add`, `show`, …). |
| **Discoverability** | Commander subcommand trees; `AGENTS.md` documents common flows and dev profile usage. |
| **Composable filtering** | `tasks list` exposes list/group/priority/status/release/date filters; `query search` supports `--board`, `--limit`. |
| **Write payloads** | `write-result.ts` defines compact mutation envelopes (`ok`, `entity`, …) — good direction for agent-friendly shapes. |
| **Recovery hints** | `CliError` details for unreachable server include a copy-paste `hint` (`api-client.ts`). |
| **Usage vs other errors** | Exit code `2` appears for validation/usage-style issues (e.g. invalid port, missing options); `1` for many failures. |

---

## Recommendation order and dependency graph

```text
[A] Exit-code contract + HTTP/status mapping
        ↓
[B] Stable structured error `code` (+ optional `retryable`) in stderr JSON
        ↓
[C] Document exit codes and error shape (AGENTS.md + hirotm --help / docs)
        ↓
[D] Machine-oriented JSON (default compact; optional --pretty)  ← independent of A but helps [E]
        ↓
[E] Context-window discipline: pagination, totals, --fields, NDJSON
        (may need API support; design after [A][B] so failures stay consistent)
        ↓
[F] Composability: --quiet / one-value-per-line (depends on stable ids in list outputs)
        ↓
[G] Idempotent / agent-safe creates (--if-not-exists or ensure) — product + API
[H] Dry-run / non-interactive guarantees for destructive flows — product + API
```

Items **G** and **H** are parallel tracks that touch server behavior; they are listed after CLI output and error contracts so agents get predictable control flow first.

---

## Ordered recommendations

### 1. Define and apply a stable exit-code contract

- **Importance:** **High** (primary agent control flow after structured output).
- **Depends on:** Nothing (foundational).
- **Blocks:** Items 2–3, and clean use of 5–6.

**Current state:** Almost all failures use exit code `1`, including “not found” and HTTP errors. Validation issues often use `2` (`command-helpers`, `writeCommands`, `search`). There is no documented mapping for 3 (not found), 4 (permission), 5 (conflict), etc., as suggested in the bible.

**Recommendation:** Adopt a small fixed table (can match the bible’s example or a trimmed variant), map `fetchApi` / `fetchApiMutate` failures using `response.status` and parsed server `error` where possible, and use distinct codes for CLI usage errors (`2`) vs not found (`3`) vs forbidden (`4`) vs conflict (`5`). Keep `0` success only.

---

### 2. Add a machine-parseable `code` (and optional `retryable`) to error JSON

- **Importance:** **High**.
- **Depends on:** **1** (same taxonomy should drive both exit code and `code` string/enum).

**Current state:** stderr JSON is `{ error: string, ...details }`. Message text is human-readable; agents must infer failure kind from strings or HTTP `status` when present.

**Recommendation:** Standardize on something like `{ "error": "<message>", "code": "<stable_snake_or_enum>", "retryable": false, ... }`. Map known API errors to stable codes; fall back to `unknown` or `server_error` with `status`. Aligns with bible §7 (parseable error types, transient vs permanent).

---

### 3. Document exit codes and error JSON for agents

- **Importance:** **High** for adoption; **Medium** if only code changes.
- **Depends on:** **1** and **2** (document the real contract).

**Recommendation:** Extend `AGENTS.md` (and optionally a `hirotm --help` top-level note or `docs/` fragment) with the exit-code table and an example stderr object. Mention that stdout is JSON for data and stderr for errors.

---

### 4. Offer compact JSON (`--compact` or global `--json-pretty` default off for agents)

- **Importance:** **Medium** (context window discipline).
- **Depends on:** None logically; easiest to specify alongside **3** in docs.

**Current state:** **Compact JSON is the default** for `printJson` and `printError`. Optional global **`--pretty`** opts into indented output (`src/cli/lib/output.ts`, `bootstrap/program.ts`).

**Recommendation:** ~~Default could stay pretty for humans; add `--compact` (or env `HIROTM_COMPACT_JSON=1`) for agents and pipelines.~~ **Done** (inverted: default compact, `--pretty` for humans).

---

### 5. Bounded lists with totals, cursors, and explicit “fetch all”

- **Importance:** **High** for large boards; **Medium** if datasets stay small.
- **Depends on:** API support for pagination metadata on `GET .../tasks` (and possibly search). **1–2** should be done first so paginated calls fail predictably.

**Current state:** List reads use a **paginated JSON envelope** (`items`, `total`, `limit`, `offset`) for **`boards list`**, **`tasks list`**, **`releases list`**, **`trash list …`**, and **`query search`**. The CLI supports **`--limit`**, **`--offset`**, and **`--page-all`**. **Cursor** (`next_cursor`) / server-driven streaming is **not** implemented yet.

**Recommendation:** When the API can expose **cursor** (or equivalent) in addition to offset paging, add **`--cursor`** (or align with API), and document it in subcommand help and Mint (bible § Context window).

**Mint (Task Manager → CLI):** When cursor or response shape changes, update [hirotm CLI](/task-manager/cli/cli-commands) (**Paginated list responses**), plus [hirotm tasks](/task-manager/cli/tasks), [Search](/task-manager/cli/search), [hirotm boards](/task-manager/cli/boards), [hirotm trash](/task-manager/cli/trash), [hirotm releases](/task-manager/cli/releases), and [CLI overview](/task-manager/cli/cli-overview) as needed.

---

### 6. Field projection (`--fields`) and/or slimmer default list views

- **Importance:** **Medium**–**High** for full-board JSON (`GET /api/boards/:id`, used by the app) and large task payloads (body, etc.).
- **Depends on:** API or CLI-side projection; pairs with **5**.

**Current state:** **Done (CLI-side):** list-style reads support **`--fields`** with validated allowlists; paginated envelopes keep **`total` / `limit` / `offset`**. There is **no** `hirotm boards show`; use **`boards describe`** plus **`tasks list --board`** (and **`--page-all`** when needed). Optional future: server **`?fields=`** on **`GET /api/boards/:id`** to reduce bytes on the wire.

**Recommendation:** ~~Support `--fields id,title,listId`~~ **Shipped** in `hirotm` (`src/cli/lib/jsonFieldProjection.ts`). Optional follow-up: slimmer **default** list payloads (product decision) or API-level projection.

**Mint (Task Manager → CLI):** Section **Field projection** on `hiro-docs/mintdocs/task-manager/cli/cli-commands.mdx` (published as `/task-manager/cli/cli-commands#field-projection`), with cross-links from `cli-overview.mdx`, `boards.mdx`, `tasks.mdx`, `releases.mdx`, `search.mdx`, `trash.mdx`, and `statuses.mdx`.

---

### 7. NDJSON streaming for large result sets

- **Importance:** **Medium** (valuable when **5** delivers many rows).
- **Depends on:** **5** (streaming without pagination is weaker); optional server streaming.

**Recommendation:** e.g. `hirotm tasks list ... --ndjson` emitting one JSON object per line for incremental consumption (bible §1 and Context window).

**Mint (Task Manager → CLI):** Add **`--ndjson`** behavior and examples to [hirotm CLI](/task-manager/cli/cli-commands), [hirotm tasks](/task-manager/cli/tasks), and any other affected command pages; mention stdout contract vs JSON array in [CLI overview](/task-manager/cli/cli-overview).

---

### 8. `--quiet` / pipe-friendly single-column output

- **Importance:** **Medium**.
- **Depends on:** **5–6** optional but helpful; needs stable identifiers in list commands.

**Current state:** **Done:** global **`-q` / `--quiet`** on list-style reads; plain-text lines (default slug→id for boards, task id for tasks/search, etc.); **`--quiet` + `--fields`** allows at most one key; requires **`--format ndjson`**.

**Recommendation:** ~~For commands that return arrays of boards/tasks, support `--quiet` emitting one id or `slug` per line (bible §5).~~ **Shipped** (`program.ts`, `cliFormat.ts`, `output.ts`, list handlers).

**Mint (Task Manager → CLI):** [hirotm CLI](/task-manager/cli/cli-commands) (global options + pipe-friendly quiet); [CLI overview](/task-manager/cli/cli-overview).

---

### 9. Idempotent create patterns (`ensure`, `--if-not-exists`, or distinct conflict exit)

- **Importance:** **Medium** for retry-heavy agents.
- **Depends on:** Server semantics and possibly new endpoints; **1** so conflicts return code `5` if not idempotent.

**Current state:** Create operations rely on API behavior; duplicate slug/name handling should be checked against API — agents may see generic failure.

**Recommendation:** Where uniqueness matters, either idempotent commands or stable **5** exit + `code: "conflict"` in stderr JSON.

**Mint (Task Manager → CLI):** Update [Errors & exit codes](/task-manager/cli/error-codes), [hirotm CLI](/task-manager/cli/cli-commands), and mutation pages ([hirotm boards](/task-manager/cli/boards), [hirotm lists](/task-manager/cli/lists), [hirotm tasks](/task-manager/cli/tasks), [hirotm releases](/task-manager/cli/releases)) for new flags and conflict behavior.

---

### 10. Dry-run and non-interactive / confirmation bypass for destructive actions

- **Importance:** **Medium** for automation safety; **Low** if no prompts exist on mutation paths.
- **Depends on:** Product requirements; audit all CLI entrypoints.

**Current state:** Interactive prompts exist in `launcher.ts` for some flows; core `hirotm` mutations appear non-interactive. No `--dry-run` on delete/purge.

**Recommendation:** If any destructive path can prompt, enforce non-TTY behavior per bible §6. Add structured `--dry-run` only where the server can preview changes.

**Mint (Task Manager → CLI):** Document behavior in [CLI overview](/task-manager/cli/cli-overview), [hirotm CLI](/task-manager/cli/cli-commands), [Server](/task-manager/cli/server) if launcher-related, and each destructive subcommand page (boards/lists/tasks/releases **delete** / **purge**).

---

### 11. Enrich errors with `suggestion` and echoed inputs

- **Importance:** **Medium**.
- **Depends on:** **2** (structure); complements **1**.

**Current state:** Some paths add contextual `details` (e.g. `board`, `hint`). Not consistent.

**Recommendation:** For common failures (not found, bad board slug, missing API key), always echo the offending input and a short `suggestion` string (bible §7).

**Mint (Task Manager → CLI):** Extend [Errors & exit codes](/task-manager/cli/error-codes) with `suggestion` and echoed-field examples; add a short note in [CLI overview](/task-manager/cli/cli-overview) stderr contract.

---

### 12. Self-documenting `--help`: examples and explicit “JSON default”

- **Importance:** **Low**–**Medium**.
- **Depends on:** None; can be incremental.

**Current state:** Subcommands have descriptions and options; not all include examples. There is no global `--json` flag because JSON is the default for most commands — agents scanning for `--json` in the bible might miss that.

**Recommendation:** In top-level `hirotm --help` or `AGENTS.md`, state explicitly: “Read commands print JSON to stdout by default.” Add 1–2 copy-paste examples per high-traffic subcommand (`tasks list`, `query search`, writes with `--client-name`).

**Mint (Task Manager → CLI):** Strengthen [CLI overview](/task-manager/cli/cli-overview) and [hirotm CLI](/task-manager/cli/cli-commands) with an explicit **JSON default** callout; add copy-paste blocks to [hirotm tasks](/task-manager/cli/tasks), [Search](/task-manager/cli/search), and write-heavy pages as help text catches up.

---

### 13. Table output guardrails

- **Importance:** **Low**.
- **Depends on:** None.

**Current state:** Global **`--format human`** prints fixed-width tables for list reads and **`query search`**; default **`--format ndjson`** is for agents. There is no per-command **`query search --format`** or **`--view`**.

**Recommendation:** Keep Mint [hirotm CLI](/task-manager/cli/cli-commands) **Response format** as the single explanation; per-command pages point to it. **`--fields`** requires **`ndjson`** (documented on **`cli-commands`** and search page).

**Mint (Task Manager → CLI):** [Search](/task-manager/cli/search) and [hirotm CLI](/task-manager/cli/cli-commands) — done (global **`--format`**, no search-local format flag).

---

## Summary table

| Order | Topic | Importance | Depends on | Status |
|------|--------|------------|------------|--------|
| 1 | Exit-code contract + HTTP mapping | High | — | **Done** |
| 2 | Error JSON `code` / `retryable` | High | 1 | **Done** (`CLI_ERR` + all local throws) |
| 3 | Document codes + error shape | High | 1, 2 | **Done** (`AGENTS.md`, `cli-error-handling.md`, Mint `/task-manager/cli/error-codes`) |
| 4 | Compact JSON default | Medium | (docs 3) | **Done** (default compact; `--pretty`, `AGENTS.md`) |
| 5 | Pagination / total / explicit fetch-all | High / Medium | API; 1–2 first | Open |
| 6 | `--fields` / slimmer payloads | Medium–High | API or CLI; 5 | **Done** (CLI projection on list reads; full board via API only) |
| 7 | NDJSON streaming | Medium | 5 | Open |
| 8 | `--quiet` lines | Medium | 5–6 optional | **Done** (global `-q`/`--quiet`, `listTableSpecs` defaults) |
| 9 | Idempotent create / conflict exit | Medium | API; 1 | Open |
| 10 | Dry-run / non-interactive | Medium | audit + API | Open |
| 11 | `suggestion` + echoed inputs | Medium | 2 | Open |
| 12 | Help examples + “JSON default” note | Low–Medium | — | Open |
| 13 | Table vs JSON documentation | Low | — | Open |

---

## References

- Source guideline: `hiro-docs/mintdocs/ai-coding-bible/building-cli-for-agents.mdx`
- Task Manager **Mint** CLI docs (Task Manager tab): `hiro-docs/mintdocs/task-manager/cli/` (navigation in `mintdocs/docs.json` and `mintdocs/docs-main.json`)
- hirotm implementation: `src/cli/` (notably `bootstrap/program.ts`, `lib/output.ts`, `lib/api-client.ts`, `lib/command-helpers.ts`, commands under `commands/`)
- Agent-oriented repo notes: `AGENTS.md`, `.cursor/skills/hirotm-cli/SKILL.md`

## Mint doc updates for open recommendations

When closing items **5** and **7–13**, update the Task Manager CLI pages in **`hiro-docs/mintdocs/task-manager/cli/`** as described in each section’s **Mint (Task Manager → CLI)** bullet. Done items **1–4**, **6**, and **8** are already reflected in Mint where noted (item **3**: [Errors & exit codes](/task-manager/cli/error-codes); item **6**: [Field projection](/task-manager/cli/cli-commands#field-projection); item **8**: global **`--quiet`** on [hirotm CLI](/task-manager/cli/cli-commands)).
