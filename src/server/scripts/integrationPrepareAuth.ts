#!/usr/bin/env bun
/**
 * One-shot auth bootstrap for integration tests. Uses `resolveAuthDir()` from
 * profile `config.json` (set `HOME` to an isolated tree with that config).
 *
 * Password is fixed for automation; this script is only for disposable temp dirs.
 */
import { setupPassphrase } from "../auth";

const pass =
  process.env.HIROTM_INTEGRATION_PASS?.trim() || "integration-test-passphrase";

await setupPassphrase(pass);
process.exit(0);
