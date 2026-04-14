# Statuses Commands

Use `hirotm statuses` to inspect the global workflow status table. These status ids are the values used by task commands for `--status`.

## Commands

### `statuses list`

Format:

```bash
hirotm statuses list [--fields <keys>]
```

List all workflow statuses in display order.

- `--fields <keys>`: project only selected fields.
- Supports global `--quiet` with `--format ndjson`.

## Field meaning

- `statusId`: value accepted by task commands for `--status`.
- `label`: human-readable status name.
- `sortOrder`: workflow display order.
- `isClosed`: whether the status counts as closed.
