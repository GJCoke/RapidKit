#!/usr/bin/env bash

set -e

# Resolve project root (two levels up from apps/backend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Create a folder to store logs.
LOG_DIR="logs"
if [[ ! -d "$LOG_DIR" ]]; then
  mkdir -p "$LOG_DIR"
fi

# FastAPI application entry point.
DEFAULT_MODULE_NAME=src.main
MODULE_NAME=${MODULE_NAME:-$DEFAULT_MODULE_NAME}
VARIABLE_NAME=${VARIABLE_NAME:-app}
export APP_MODULE=${APP_MODULE:-"$MODULE_NAME:$VARIABLE_NAME"}

HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8006}

# Build --reload-dir arguments dynamically.
# Always watch the backend src and plugins.
RELOAD_ARGS=(
  --reload-dir src
  --reload-dir plugins
)

# Auto-detect Python packages under packages/*/src
for pkg_src in "$PROJECT_ROOT"/packages/*/src; do
  # Skip non-Python packages (no .py files)
  if compgen -G "$pkg_src"/**/*.py > /dev/null 2>&1 || compgen -G "$pkg_src"/*.py > /dev/null 2>&1; then
    RELOAD_ARGS+=(--reload-dir "$pkg_src")
  fi
done

exec uvicorn --reload --proxy-headers --host "$HOST" --port "$PORT" "${RELOAD_ARGS[@]}" "$APP_MODULE"
