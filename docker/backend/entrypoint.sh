#!/bin/sh
set -eu
export FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-172.30.0.0/24}"
exec "$@"
