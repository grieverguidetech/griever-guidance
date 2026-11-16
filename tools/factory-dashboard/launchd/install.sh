#!/usr/bin/env bash
# Installs the factory dashboard LaunchAgent. Safe to run again.
# Usage: install.sh [repo-root]   (default: the main worktree of this repo)
set -euo pipefail

LABEL="com.grieversguidance.factory"
PORT="${FACTORY_PORT:-4317}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/${LABEL}.plist.template"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG="${HOME}/Library/Logs/gg-factory.log"
DOMAIN="gui/$(id -u)"

case "${PORT}" in
  ''|*[!0-9]*) echo "Bad port: ${PORT}" >&2; exit 1 ;;
esac
if [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
  echo "Bad port: ${PORT}" >&2
  exit 1
fi

if [ -n "${1:-}" ]; then
  REPO_ROOT="$1"
else
  # The first entry of the worktree list is always the main checkout.
  REPO_ROOT="$(git -C "${SCRIPT_DIR}" worktree list --porcelain | sed -n '1s/^worktree //p')"
fi
if [ ! -f "${REPO_ROOT}/package.json" ]; then
  echo "Not a repo root: ${REPO_ROOT}" >&2
  exit 1
fi

find_tool() {
  local path
  path="$(command -v "$1" || true)"
  if [ -z "${path}" ]; then
    echo "Cannot find '$1' on PATH." >&2
    exit 1
  fi
  printf '%s' "${path}"
}
NODE_BIN="$(find_tool node)"
PNPM_BIN="$(find_tool pnpm)"
GH_BIN="$(find_tool gh)"

# Unique directories of the three tools, then the system defaults.
TOOL_PATH=""
for bin in "${NODE_BIN}" "${PNPM_BIN}" "${GH_BIN}"; do
  dir="$(dirname "${bin}")"
  case ":${TOOL_PATH}:" in
    *":${dir}:"*) ;;
    *) TOOL_PATH="${TOOL_PATH:+${TOOL_PATH}:}${dir}" ;;
  esac
done
FULL_PATH="${TOOL_PATH}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"

# Fill the template. '|' is the sed delimiter; reject it in values.
for value in "${PNPM_BIN}" "${REPO_ROOT}" "${FULL_PATH}" "${LOG}"; do
  case "${value}" in
    *'|'*|*'&'*|*'<'*|*'>'*|*'\'*) echo "Unsupported character in path: ${value}" >&2; exit 1 ;;
  esac
done
sed \
  -e "s|__PNPM__|${PNPM_BIN}|g" \
  -e "s|__REPO_ROOT__|${REPO_ROOT}|g" \
  -e "s|__PATH__|${FULL_PATH}|g" \
  -e "s|__LOG__|${LOG}|g" \
  -e "s|__PORT__|${PORT}|g" \
  "${TEMPLATE}" > "${PLIST}"
plutil -lint "${PLIST}" >/dev/null

# Unload first if loaded, so a re-run picks up changes.
if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${DOMAIN}/${LABEL}" || true
fi
launchctl bootstrap "${DOMAIN}" "${PLIST}"

echo "Loaded ${LABEL} from ${REPO_ROOT}. Waiting for http://127.0.0.1:${PORT} ..."

# True when the agent has a running pid and that pid listens on the port.
agent_is_listening() {
  local pid
  pid="$(launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\)$/\1/p' | head -n 1)"
  if [ -z "${pid}" ]; then
    return 1
  fi
  # pnpm starts node through child processes, so walk up from each listener to the agent pid.
  local listener current depth
  for listener in $(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true); do
    current="${listener}"
    for depth in 1 2 3 4 5; do
      if [ "${current}" = "${pid}" ]; then
        return 0
      fi
      current="$(ps -o ppid= -p "${current}" 2>/dev/null | tr -d ' ' || true)"
      if [ -z "${current}" ] || [ "${current}" = "0" ]; then
        break
      fi
    done
  done
  return 1
}

for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}" && agent_is_listening; then
    echo "Factory dashboard is up: http://127.0.0.1:${PORT}"
    # Reading the pf anchor needs root. If this cannot run, print the URL as conditional.
    if pfctl -a "com.apple/gg-factory" -s nat 2>/dev/null | grep "port = 80" >/dev/null; then
      echo "Friendly URL: http://gg-tech-dashboard.localhost"
    else
      echo "Friendly URL, if you ran the port 80 step (pnpm factory:port80): http://gg-tech-dashboard.localhost"
    fi
    exit 0
  fi
  sleep 1
done
echo "The agent did not answer on port ${PORT} within 20s. Another program may use the port." >&2
echo "Check the log: ${LOG}" >&2
exit 1
