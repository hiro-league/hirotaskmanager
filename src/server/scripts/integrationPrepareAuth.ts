#!/usr/bin/env bun
/**
 * One-shot auth bootstrap for integration tests. Requires env:
 * - TASKMANAGER_AUTH_DIR — directory for auth.json (must exist or be creatable)
 *
 * Password is fixed for automation; this script is only for disposable temp dirs.
 */
import { setupPassphrase } from "../auth";

const pass =
  process.env.HIROTM_INTEGRATION_PASS?.trim() || "integration-test-passphrase";

await setupPassphrase(pass);
process.exit(0);
