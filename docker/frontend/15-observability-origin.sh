#!/bin/sh
set -eu
origin="${SENTRY_CONNECT_SRC:-}"
case "$origin" in
  *[!A-Za-z0-9:./-]*) echo 'SENTRY_CONNECT_SRC contains invalid characters' >&2; exit 1 ;;
esac
if [ -n "$origin" ] && ! printf '%s\n' "$origin" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$|^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'; then
  echo 'SENTRY_CONNECT_SRC must be one HTTPS origin (loopback HTTP is allowed for local verification)' >&2
  exit 1
fi
