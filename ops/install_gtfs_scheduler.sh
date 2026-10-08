#!/usr/bin/env bash
# Stage the VPS scheduler. Does not enable its timer or dispatch a workflow.
set -euo pipefail
umask 077
if [[ $EUID -ne 0 ]]; then
  echo 'Run this installer with sudo bash.' >&2
  exit 1
fi
if [[ -e /opt/sotofoto-gtfs/scheduler.py || -e /etc/systemd/system/sotofoto-gtfs.service || -e /etc/systemd/system/sotofoto-gtfs.timer ]]; then
  echo 'Existing Sotofoto installation found; refusing to overwrite it.' >&2
  exit 1
fi
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 60 \
  'https://raw.githubusercontent.com/anlexcz/sotofoto/7000c6e96cf2d7243bd55b36665f6d4cfbacff5f/ops/gtfs_scheduler.py' \
  -o "$STAGING_DIR/scheduler.py"
printf '%s  %s\n' '1ee724e503c689b75d38efedbb30fa3d8a129d696960583b5080713016e7a769' "$STAGING_DIR/scheduler.py" | sha256sum --check
python3 - "$STAGING_DIR/scheduler.py" <<'PY'
import ast,sys
from pathlib import Path
ast.parse(Path(sys.argv[1]).read_text())
PY
install -d -m 700 /etc/sotofoto-gtfs
if [[ ! -e /etc/sotofoto-gtfs/github-token ]]; then
  python3 - <<'PY'
import getpass,os
token=getpass.getpass('GitHub token (hidden input): ').strip()
if not token or '\n' in token or '\r' in token:
    raise SystemExit('Missing or malformed token; installation stopped.')
fd=os.open('/etc/sotofoto-gtfs/github-token',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
    f.write(token+'\n')
PY
fi
chown root:root /etc/sotofoto-gtfs/github-token
chmod 600 /etc/sotofoto-gtfs/github-token
# Verify authentication and production access before installing units.
python3 "$STAGING_DIR/scheduler.py" --check
cat > "$STAGING_DIR/sotofoto-gtfs.service" <<'UNIT'
[Unit]
Description=Sotofoto GTFS update via GitHub Actions
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/sotofoto-gtfs/scheduler.py
LoadCredential=github-token:/etc/sotofoto-gtfs/github-token
DynamicUser=yes
TimeoutStartSec=30min
MemoryMax=128M
TasksMax=16
Nice=10
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
UNIT
cat > "$STAGING_DIR/sotofoto-gtfs.timer" <<'UNIT'
[Unit]
Description=Sotofoto morning GTFS checks (Prague time)

[Timer]
OnCalendar=*-*-* 04,05,06:07:00 Europe/Prague
Persistent=true
AccuracySec=1s
RandomizedDelaySec=0
Unit=sotofoto-gtfs.service

[Install]
WantedBy=timers.target
UNIT
install -d -m 755 /opt/sotofoto-gtfs
install -m 644 "$STAGING_DIR/scheduler.py" /opt/sotofoto-gtfs/scheduler.py
systemd-analyze verify "$STAGING_DIR/sotofoto-gtfs.service" "$STAGING_DIR/sotofoto-gtfs.timer"
install -m 644 "$STAGING_DIR/sotofoto-gtfs.service" /etc/systemd/system/sotofoto-gtfs.service
install -m 644 "$STAGING_DIR/sotofoto-gtfs.timer" /etc/systemd/system/sotofoto-gtfs.timer
systemctl daemon-reload
echo 'Installed. Timer is NOT enabled; no workflow has been dispatched.'
echo 'Next: verify an actual update from the VPS, then enable the timer.'
systemd-analyze calendar '*-*-* 04,05,06:07:00 Europe/Prague'
