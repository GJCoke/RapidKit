#!/bin/sh
set -eu
export FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-172.30.0.0/24}"
case "${1##*/}" in
  uvicorn)
    if [ -n "${PROMETHEUS_MULTIPROC_DIR:-}" ]; then
      mkdir -p "$PROMETHEUS_MULTIPROC_DIR"
      rm -f "$PROMETHEUS_MULTIPROC_DIR"/*.db
    else
      unset PROMETHEUS_MULTIPROC_DIR
    fi
    ;;
  *) unset PROMETHEUS_MULTIPROC_DIR ;;
esac
exec "$@"
