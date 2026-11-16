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
TOKEN_FILE="/var/run/gg-factory.pftoken"
PORT="${FACTORY_PORT:-4317}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash $0" >&2
  exit 1
fi

case "${PORT}" in
  ''|*[!0-9]*) echo "Bad port: ${PORT}" >&2; exit 1 ;;
esac
if [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
  echo "Bad port: ${PORT}" >&2
  exit 1
fi

# Write to a temp file, check the syntax, then move it into place.
TMP_RULES="$(mktemp /etc/pf.anchors/.gg-factory.XXXXXX)"
trap 'rm -f "${TMP_RULES}"' EXIT
cat > "${TMP_RULES}" <<RULES_EOF
rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${PORT}
rdr pass on lo0 inet6 proto tcp from any to ::1 port 80 -> ::1 port ${PORT}
RULES_EOF
pfctl -nf "${TMP_RULES}"
chmod 644 "${TMP_RULES}"
mv "${TMP_RULES}" "${RULES}"

# The boot daemon loads the anchor, enables pf, and saves the enable token for uninstall.
TMP_DAEMON="$(mktemp /Library/LaunchDaemons/.gg-factory.XXXXXX)"
trap 'rm -f "${TMP_RULES}" "${TMP_DAEMON}"' EXIT
cat > "${TMP_DAEMON}" <<DAEMON_EOF
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
    <string>/sbin/pfctl -a ${ANCHOR} -f ${RULES} &amp;&amp; /sbin/pfctl -E 2&gt;&amp;1 | /usr/bin/sed -n 's/^Token : //p' &gt; ${TOKEN_FILE}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
DAEMON_EOF
plutil -lint "${TMP_DAEMON}" >/dev/null
chown root:wheel "${TMP_DAEMON}"
chmod 644 "${TMP_DAEMON}"
mv "${TMP_DAEMON}" "${DAEMON}"

# Replace the daemon if it is already loaded, then load it now. The daemon runs the rules and
# saves a pf token. Release any older token first so tokens do not pile up on re-runs.
if launchctl print "system/${LABEL}.pf" >/dev/null 2>&1; then
  launchctl bootout "system/${LABEL}.pf" || true
fi
if [ -s "${TOKEN_FILE}" ]; then
  pfctl -X "$(cat "${TOKEN_FILE}")" >/dev/null 2>&1 || true
  rm -f "${TOKEN_FILE}"
fi
launchctl bootstrap system "${DAEMON}"

# The daemon runs at once (RunAtLoad). Wait up to 10s for it to finish, then check the result.
for _ in $(seq 1 10); do
  if [ -s "${TOKEN_FILE}" ]; then
    break
  fi
  sleep 1
done

if ! pfctl -a "${ANCHOR}" -s nat 2>/dev/null | grep "port = 80" >/dev/null; then
  echo "Failed: the anchor ${ANCHOR} has no port 80 rule." >&2
  exit 1
fi
if ! pfctl -s info 2>/dev/null | grep "Status: Enabled" >/dev/null; then
  echo "Failed: pf is not enabled." >&2
  exit 1
fi
if ! launchctl print "system/${LABEL}.pf" >/dev/null 2>&1; then
  echo "Failed: the daemon system/${LABEL}.pf is not loaded." >&2
  exit 1
fi

echo "Port 80 forward is on. Open http://gg-tech-dashboard.localhost"
