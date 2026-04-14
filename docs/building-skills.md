# Hiro Skills Manifesto

## Goal
Build a single, high-signal Hiro skill package that helps AI agents operate Hiro Task Manager safely, correctly, and with minimal token waste.

## Core principle
The skill is not a copy of the docs.

The skill is a compact operational layer on top of the docs:
- it tells the agent **when** to use Hiro
- it tells the agent **how** to behave
- it tells the agent **what defaults to follow**
- it points to deeper references only when needed

## What the skill must achieve
The skill must make an AI agent able to:
- recognize that a user request should be solved through `hirotm`
- start with inspection before mutation
- use machine-readable output where appropriate
- identify itself on mutating operations
- avoid direct file/database manipulation
- respect destructive-action safety
- work from the correct workspace
- handle the local server lifecycle correctly

## What the skill must NOT become
The skill must not become:
- a full CLI manual
- a dump of all docs pages
- a huge command catalog with no prioritization
- a second documentation site
- a deeply nested web of linked files

## Design philosophy
### 1. One skill first
Start with one unified skill for the whole Hiro CLI.

Reason:
- Hiro is one coherent command surface
- the user wants simple install and maintenance
- premature splitting creates clutter and install friction

Split later only if a real boundary appears.

### 2. Progressive disclosure
Keep `SKILL.md` compact and strong.
Push details into `references/`.

The main file is the operational brain.
The reference files are supporting memory.

### 3. Strong defaults
The skill should enforce a few important defaults:
- use `hirotm`
- inspect before mutating
- prefer `--format ndjson` for agent/scripting workflows
- use `--client-name` on mutating commands
- do not touch Hiro storage directly
- treat delete/purge actions as sensitive

### 4. Agent-first, not human-manual-first
The skill should not explain everything a human beginner needs.
It should explain the minimum an agent needs to operate well.

### 5. Token discipline
Every line in `SKILL.md` must earn its place.

Keep:
- core rules
- common workflows
- command patterns
- short examples
- links to references

Move out:
- long explanations
- exhaustive examples
- niche edge cases
- detailed command matrices

### 6. Operational safety over completeness
It is more important that the agent behaves safely than that it knows every command.

If we must choose, optimize for:
- safe behavior
- predictable workflow
- low ambiguity
- good mutation hygiene

## Required file structure
We should start with:

- `skills/hiro-task-manager-cli/SKILL.md`
- `skills/hiro-task-manager-cli/references/cli-overview.md`
- `skills/hiro-task-manager-cli/references/command-patterns.md`
- `skills/hiro-task-manager-cli/references/safety-rules.md`
- `skills/hiro-task-manager-cli/references/examples.md`

Optional later:
- `scripts/`
- `assets/`

## Responsibilities of each file

### `SKILL.md`
The entry point.
It should contain:
- purpose
- when to use
- core rules
- standard workflow
- default command style
- a few common commands
- links to references

### `references/cli-overview.md`
The mental model.
It should explain:
- server
- boards
- lists
- tasks
- query/search
- statuses / releases / trash / profiles
Only enough for correct operation.

### `references/command-patterns.md`
The agent playbook.
It should show:
- inspect-first pattern
- search-before-create pattern
- mutate-with-client-name pattern
- ndjson usage pattern
- minimal safe command sequences

### `references/safety-rules.md`
The guardrails.
It should explain:
- never edit DB/files directly
- be careful with destructive operations
- restore vs purge
- respect policy/permission errors
- confirm intent before structural or irreversible changes

### `references/examples.md`
The worked examples.
It should contain:
- start server if needed
- inspect a board
- search for duplicates
- create a task
- move a task
- close/delete/restore safely

## Writing rules for all files
- Write for AI execution, not marketing
- Use short sections
- Use imperative phrasing where helpful
- Prefer patterns over encyclopedic explanation
- Prefer concrete command examples
- Avoid deep link chains between reference files
- Keep each reference file self-contained
- Keep terminology consistent with the CLI

## Quality bar
A good Hiro skill package should make the agent:
- faster
- safer
- less repetitive
- less likely to hallucinate Hiro behavior
- less likely to mutate the wrong thing
- more likely to use the CLI in a way the user can trust

## Rollout plan
### Phase 1
Ship one skill with 4 reference files.

### Phase 2
Test it with real prompts:
- “start Hiro”
- “list my boards”
- “find duplicate login bug tasks”
- “create a task”
- “move task to another list”
- “delete and restore task”

### Phase 3
Tighten wording based on failures:
- commands the agent forgets
- safety rules it ignores
- places where it creates duplicates
- cases where it mutates before inspecting

### Phase 4
Split only if needed.
Likely split candidates later:
- board configuration
- advanced automation / scripting
- admin/server operations

## Final rule
The Hiro skill should feel like a compact operating manual for a trustworthy agent, not a bloated copy of the docs.