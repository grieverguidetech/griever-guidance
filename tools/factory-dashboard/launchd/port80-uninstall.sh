#!/usr/bin/env bash
# Undo port80-install.sh. Run with sudo. Safe to run again.
set -euo pipefail

LABEL="com.grieversguidance.factory"
ANCHOR="com.apple/gg-factory"
RULES="/etc/pf.anchors/${LABEL}"
DAEMON="/Library/LaunchDaemons/${LABEL}.pf.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash $0" >&2
  exit 1
fi

if launchctl print "system/${LABEL}.pf" >/dev/null 2>&1; then
  launchctl bootout "system/${LABEL}.pf" || true
fi
pfctl -a "${ANCHOR}" -F all 2>/dev/null || true
rm -f "${DAEMON}" "${RULES}"

echo "Port 80 forward is removed."
