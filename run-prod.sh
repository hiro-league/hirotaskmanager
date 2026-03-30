#!/usr/bin/env bash
# Production server launcher: optional install/build, then Bun + env (PORT, DATA_DIR, NODE_ENV).
# Run from repo root: chmod +x run-prod.sh && ./run-prod.sh  (Git Bash / WSL / macOS / Linux)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is not installed or not on your PATH."
  echo "Install it from https://bun.sh (Windows: PowerShell: irm bun.sh/install.ps1 | iex)"
  echo "Then open a new terminal and run this script again."
  exit 1
fi

read -r -p "Run bun install (update dependencies)? [y/N] " install_ans
case "${install_ans:-n}" in
[yY]*) bun install ;;
esac

read -r -p "Run bun run build (rebuild production client)? [y/N] " build_ans
case "${build_ans:-n}" in
[yY]*) bun run build ;;
esac

read -r -p "Port [8080]: " port
port="${port:-8080}"

read -r -p "Data directory relative to repo root [hirodata]: " data_dir
data_dir="${data_dir:-hirodata}"

export NODE_ENV=production
export PORT="$port"
export DATA_DIR="${ROOT}/${data_dir}"

echo "Starting server: PORT=$PORT DATA_DIR=$DATA_DIR"
exec bun src/server/index.ts
