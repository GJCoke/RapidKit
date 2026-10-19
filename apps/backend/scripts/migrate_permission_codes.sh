#!/usr/bin/env bash

set -euo pipefail

rapidkit_backend_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${rapidkit_backend_dir}${PYTHONPATH:+:${PYTHONPATH}}"
cd -- "$rapidkit_backend_dir"

python -m src.migrate_permission_codes "$@"
