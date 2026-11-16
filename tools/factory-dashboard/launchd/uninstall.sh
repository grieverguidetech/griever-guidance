#!/usr/bin/env bash
# Removes the factory dashboard LaunchAgent. Safe to run again.
set -euo pipefail

LABEL="com.grieversguidance.factory"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${DOMAIN}/${LABEL}" || true
fi
rm -f "${PLIST}"
echo "Removed ${LABEL}. The log stays at ${HOME}/Library/Logs/gg-factory.log."
