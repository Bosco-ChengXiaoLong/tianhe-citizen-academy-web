#!/bin/sh
set -eu
case "${JAVA_UPSTREAM:-}" in
  *[!A-Za-z0-9_.:-]*|'') echo 'JAVA_UPSTREAM must be host:port' >&2; exit 1 ;;
esac
printf '%s' "$JAVA_UPSTREAM" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]*:[0-9]{1,5}$' || exit 1
port=${JAVA_UPSTREAM##*:}
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || exit 1
