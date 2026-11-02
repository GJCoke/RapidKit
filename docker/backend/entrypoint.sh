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
if [ -n "${RUNTIME_STATE_DIR:-}" ]; then
  case "$RUNTIME_STATE_DIR" in
    /tmp/rapidkit-runtime) mkdir -p "$RUNTIME_STATE_DIR"; rm -f "$RUNTIME_STATE_DIR"/*.json "$RUNTIME_STATE_DIR"/*.tmp ;;
    *) echo 'RUNTIME_STATE_DIR must be /tmp/rapidkit-runtime inside this image' >&2; exit 1 ;;
  esac
fi
exec "$@"
