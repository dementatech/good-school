#!/usr/bin/env bash
# Installs the timer that runs provision-domains.sh every minute. Run once, as
# root, on the server. Safe to re-run.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/provision-domains.sh"
chmod +x "$SCRIPT"

cat > /etc/systemd/system/gs-domains.service <<UNIT
[Unit]
Description=Good School: set up schools' custom domains
After=docker.service nginx.service

[Service]
Type=oneshot
ExecStart=$SCRIPT
UNIT

cat > /etc/systemd/system/gs-domains.timer <<UNIT
[Unit]
Description=Check for schools' custom domains every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now gs-domains.timer
systemctl list-timers gs-domains.timer --no-pager
