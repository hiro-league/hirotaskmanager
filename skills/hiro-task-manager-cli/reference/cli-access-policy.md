# CLI Access Policy

Use this page to map `hirotm` commands to the board CLI policy checks enforced by Task Manager.

## Core rule

- `readBoard` is the baseline requirement for board-scoped commands.
- Trash listings only return rows for boards the CLI can read.
- If `readBoard` is off, board-scoped reads and writes fail for that board.

## Policy flags

- `readBoard`: read board-scoped data.
- `createLists`: create new lists on a board.
- `createTasks`: create new tasks on a board.
- `manageCliCreatedLists`: manage lists created by the CLI.
- `manageAnyLists`: manage lists regardless of creator.
- `manageCliCreatedTasks`: manage tasks created by the CLI.
- `manageAnyTasks`: manage tasks regardless of creator.
- `manageStructure`: manage releases and board structure.
- `deleteBoard`: delete, restore, and purge boards.

## Command mapping

### Board reads

- `boards list`: `readBoard`
- `boards describe`: `readBoard`

### Board lifecycle

- `boards delete`: `readBoard` + `deleteBoard`
- `boards restore`: `readBoard` + `deleteBoard`
- `boards purge`: `readBoard` + `deleteBoard`

### List commands

- `lists add`: `readBoard` + `createLists`
- `lists delete`: `readBoard` + either `manageCliCreatedLists` for CLI-created lists or `manageAnyLists` for other lists
- `lists restore`: `readBoard` + either `manageCliCreatedLists` for CLI-created lists or `manageAnyLists` for other lists
- `lists purge`: `readBoard` + either `manageCliCreatedLists` for CLI-created lists or `manageAnyLists` for other lists

### Task commands

- `tasks add`: `readBoard` + `createTasks`
- `tasks delete`: `readBoard` + either `manageCliCreatedTasks` for CLI-created tasks or `manageAnyTasks` for other tasks
- `tasks restore`: `readBoard` + either `manageCliCreatedTasks` for CLI-created tasks or `manageAnyTasks` for other tasks
- `tasks purge`: `readBoard` + either `manageCliCreatedTasks` for CLI-created tasks or `manageAnyTasks` for other tasks

### Release commands

- `releases list`: `readBoard`
- `releases show`: `readBoard`
- `releases add`: `readBoard` + `manageStructure`
- `releases update`: `readBoard` + `manageStructure`
- `releases delete`: `readBoard` + `manageStructure`

### Search and trash

- `query search` without `--board`: returns hits only from boards the CLI can read
- `query search --board <id-or-slug>`: `readBoard` for that board
- `trash list boards`: `readBoard` for each returned board
- `trash list lists`: `readBoard` for each row's board
- `trash list tasks`: `readBoard` for each row's board

### Global commands

- `statuses list`: not board-scoped

## Practical note

Use `hirotm boards describe <id-or-slug>` to inspect the current `cliPolicy` values before attempting a write.
