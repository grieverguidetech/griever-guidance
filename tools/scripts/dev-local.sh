#!/usr/bin/env bash
# Runs the whole local stack: DynamoDB Local, the data function, the gateway, then web or mobile.
# Usage: pnpm dev:local web|mobile   (see docs/aws-local.md)
set -euo pipefail

TARGET="${1:-}"
GATEWAY_ENV_FILE="${GATEWAY_ENV_FILE:-apps/gateway/.env}"
DATA_PORT=3002
GATEWAY_PORT=3001
WAIT_SECONDS="${DEV_LOCAL_WAIT_SECONDS:-60}"

fail() {
  echo "dev:local: $1" >&2
  exit 1
}

listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

case "$TARGET" in
  web | mobile) ;;
  *) fail "Say which app to run: pnpm dev:local web  or  pnpm dev:local mobile." ;;
esac

cd "$(dirname "$0")/../.."

if [ ! -f "$GATEWAY_ENV_FILE" ]; then
  fail "Cannot find $GATEWAY_ENV_FILE. Copy apps/gateway/.env.example and fill in CLERK_ISSUER."
fi

# Read only the CLERK_ISSUER line. The value is never printed.
ISSUER="$(sed -n 's/^CLERK_ISSUER=//p' "$GATEWAY_ENV_FILE" | head -n 1 | tr -d '"'"'"'\r')"
if [ -z "$ISSUER" ]; then
  fail "CLERK_ISSUER is missing or empty in $GATEWAY_ENV_FILE."
fi
ISSUER="${ISSUER%/}"

if ! docker info > /dev/null 2>&1; then
  fail "Docker is not running. Start Docker, then run this again."
fi

for port in "$DATA_PORT" "$GATEWAY_PORT"; do
  if listening "$port"; then
    fail "Something already listens on port $port. Stop it first so no duplicate starts."
  fi
done

DATA_PGID=""
GATEWAY_PGID=""

stop_all() {
  trap - EXIT INT TERM
  local pgid
  for pgid in "$DATA_PGID" "$GATEWAY_PGID"; do
    if [ -n "$pgid" ]; then
      kill -TERM -- "-$pgid" 2> /dev/null || true
    fi
  done
  echo "dev:local: stopped the data function and the gateway."
}
trap stop_all EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "dev:local: starting DynamoDB Local and creating tables."
pnpm aws:up
pnpm aws:tables

# Job control gives each background pipeline its own process group, so one kill reaches all of it.
set -m

# Prefix each log line. awk flushes every line, so output stays in order.
label() {
  awk -v tag="$1" '{ print "[" tag "] " $0; fflush() }'
}

export DATA_AUTH_ISSUER="$ISSUER"
export DATA_AUTH_JWKS_URL="$ISSUER/.well-known/jwks.json"
pnpm dev:data 2>&1 | label data &
DATA_PGID="$(ps -o pgid= -p "$!" | tr -d ' ')"

env HOST=0.0.0.0 pnpm nx serve gateway 2>&1 | label gateway &
GATEWAY_PGID="$(ps -o pgid= -p "$!" | tr -d ' ')"
set +m

# A phone reaches the gateway only through the Mac LAN IP, so the gateway must bind 0.0.0.0.
# Prints only the IP and a match or no-match; never the env file values.
check_mobile_reach() {
  local ip env_file="apps/mobile/.env.local"
  ip="$(ipconfig getifaddr en0 2> /dev/null || true)"
  if [ -z "$ip" ]; then
    echo "dev:local: warning: no LAN IP on en0. A phone cannot reach the gateway."
    return 0
  fi
  echo "dev:local: gateway LAN URL: http://$ip:$GATEWAY_PORT"
  if ! (exec 3<>"/dev/tcp/$ip/$GATEWAY_PORT") 2> /dev/null; then
    echo "dev:local: warning: the gateway does not answer on $ip:$GATEWAY_PORT. It may bind loopback only."
  fi
  if [ ! -f "$env_file" ] || [ "$(grep -c "^EXPO_PUBLIC_API_URL=.*$ip" "$env_file")" -eq 0 ]; then
    echo "dev:local: warning: EXPO_PUBLIC_API_URL in $env_file does not point at $ip. Update it and restart Expo."
  fi
}

wait_for_port() {
  local port="$1" name="$2" waited=0
  while ! listening "$port"; do
    if [ "$waited" -ge "$WAIT_SECONDS" ]; then
      fail "The $name did not listen on port $port after $WAIT_SECONDS seconds. Read the [$name] log lines above."
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "dev:local: the $name listens on port $port."
}

wait_for_port "$DATA_PORT" "data function"
wait_for_port "$GATEWAY_PORT" "gateway"

if [ "$TARGET" = "mobile" ]; then
  check_mobile_reach
fi

echo "dev:local: starting $TARGET. Press Ctrl+C to stop everything."
if [ "$TARGET" = "mobile" ]; then
  pnpm nx start mobile
else
  pnpm nx serve web
fi
