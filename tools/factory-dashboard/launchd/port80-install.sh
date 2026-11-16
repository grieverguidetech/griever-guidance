#!/usr/bin/env bash
# One-time setup: forward port 80 on this Mac's loopback to the dashboard (4317), so that
# http://gg-tech-dashboard.localhost works with no port. Run with sudo. Safe to run again.
# Changes: /etc/pf.anchors/<label>, the pf anchor com.apple/gg-factory, and a LaunchDaemon.
# It does not edit /etc/pf.conf (that file already has rdr-anchor "com.apple/*").
set -euo pipefail

LABEL="com.grieversguidance.factory"
ANCHOR="com.apple/gg-factory"
RULES="/etc/pf.anchors/${LABEL}"
DAEMON="/Library/LaunchDaemons/${LABEL}.pf.plist"
PORT="${FACTORY_PORT:-4317}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash $0" >&2
  exit 1
fi

cat > "${RULES}" <<RULES_EOF
rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${PORT}
rdr pass on lo0 inet6 proto tcp from any to ::1 port 80 -> ::1 port ${PORT}
RULES_EOF
chmod 644 "${RULES}"
pfctl -nf "${RULES}"

cat > "${DAEMON}" <<DAEMON_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}.pf</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>/sbin/pfctl -a ${ANCHOR} -f ${RULES}; /sbin/pfctl -E</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
DAEMON_EOF
chown root:wheel "${DAEMON}"
chmod 644 "${DAEMON}"
plutil -lint "${DAEMON}" >/dev/null

# Load now. Replace the daemon if it is already loaded.
if launchctl print "system/${LABEL}.pf" >/dev/null 2>&1; then
  launchctl bootout "system/${LABEL}.pf" || true
fi
pfctl -a "${ANCHOR}" -f "${RULES}"
pfctl -E || true
launchctl bootstrap system "${DAEMON}" || true

echo "Port 80 forward is on. Open http://gg-tech-dashboard.localhost"
