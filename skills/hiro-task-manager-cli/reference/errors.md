# Errors and Exit Codes

Use this page for how `hirotm` reports failures through exit codes and stderr payloads.

## Failure output

- With `--format ndjson`, failures are JSON on stderr.
- With `--format human`, failures are plain text on stderr.
- Prefer the machine-readable `code` field over parsing `error` text.

## Common stderr fields

- `error`: human-readable summary.
- `code`: stable machine-readable identifier.
- `retryable`: whether retry may succeed later.
- `hint`: recovery hint, such as how to start the server.
- `status`: HTTP status when the error came from the API.
- `url`: request URL when relevant.
- `serverCode`: original API code when the CLI normalized `code`.

## Exit codes

| Exit | Meaning | Typical action |
| --- | --- | --- |
| `0` | Success | Parse stdout and continue. |
| `1` | Generic failure or unmapped server/API error | Read `error` and `code`; retry only if appropriate. |
| `2` | Invalid CLI arguments | Fix flags or values; do not retry unchanged. |
| `3` | Not found | Refresh ids, slugs, or file paths. |
| `4` | Forbidden | Respect CLI policy; do not retry unchanged. |
| `5` | Conflict | Skip create, rename differently, or resolve state conflict. |
| `6` | Server unreachable | Start the server using the provided `hint`, then retry. |
| `7` | Timeout | Retry after a delay. |
| `8` | Version mismatch | Update the CLI or app. |
| `9` | Bad request or validation failure | Fix the request shape or values. |
| `10` | Unauthenticated | Configure auth when that flow exists. |

## Common `code` values

### API and permission codes

- `bad_request`
- `unauthenticated`
- `forbidden`
- `not_found`
- `conflict`
- `request_timeout`
- `version_mismatch`
- `rate_limited`
- `internal_error`
- `http_error`

### Local validation codes

- `missing_required`
- `invalid_value`
- `mutually_exclusive_options`
- `conflicting_input_sources`
- `conflicting_clear_with_input`
- `invalid_json`
- `invalid_input_shape`
- `no_update_fields`
- `release_not_found_by_name`
- `emoji_validation_failed`

### Connection and process codes

- `server_unreachable`
- `request_timeout`
- `server_start_timeout`
- `server_exited`
- `no_managed_server`
- `stale_pid`
- `signal_failed`

### Other useful codes

- `file_not_found`
- `response_inconsistent`
- `internal_error`
- `confirmation_required`
- `confirmation_declined`

## Recovery rule

If the CLI exits with `6`, run the exact `hint` command from stderr, then retry.
