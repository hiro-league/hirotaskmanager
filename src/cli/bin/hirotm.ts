#!/usr/bin/env bun

import { applyCliRuntimeFromArgv } from "../bootstrap/runtime";
import { runHirotmCli } from "../bootstrap/program";

// Profile / client-name must run before Commander (same as legacy index.ts).
applyCliRuntimeFromArgv(process.argv.slice(2));

await runHirotmCli(process.argv);
