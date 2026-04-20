#!/usr/bin/env bun
/**
 * One-shot auth bootstrap for integration tests. Uses `resolveAuthDir()` from
 * profile `config.json` (set `HOME` to an isolated tree with that config).
 *
 * Password is fixed for automation; this script is only for disposable temp dirs.
 *
 * Mints a setup token in-process (no HTTP server involved) so we exercise the
 * same code path as the launcher (task #31338) and don't have a CI-only
 * bypass that would let bugs in the token gate go undetected.
 */
import { mintSetupToken, setupPassphrase } from "../auth";
import { resolveAuthDir } from "../../shared/runtimeConfig";

const pass =
  process.env.HIROTM_INTEGRATION_PASS?.trim() || "integration-test-passphrase";

const setupToken = await mintSetupToken(resolveAuthDir());
await setupPassphrase({ passphrase: pass, setupToken });
process.exit(0);
