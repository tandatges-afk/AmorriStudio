#!/usr/bin/env bash
# Read-only environment checks, never prints credentials.
set -Eeuo pipefail
printf 'DNS for app: '; getent ahostsv4 amorri.io.vn | awk 'NR==1{print $1}' || true
printf 'DNS for media: '; getent ahostsv4 media.amorri.io.vn | awk 'NR==1{print $1}' || true
printf 'Node: '; command -v node >/dev/null && node -v || echo MISSING
printf 'Npm: '; command -v npm >/dev/null && npm -v || echo MISSING
printf 'Docker: '; command -v docker >/dev/null && docker --version || echo MISSING
printf 'Nginx: '; command -v nginx >/dev/null && nginx -v 2>&1 || echo MISSING
printf 'SSH service: '; systemctl is-active ssh 2>/dev/null || true
printf 'Web listener: '; (curl -fsS --max-time 3 http://127.0.0.1:3304/api/health | head -c 240) || echo NOT_RUNNING
printf '\nMedia S3 listener: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 http://127.0.0.1:9000/ || true
printf 'Disk:\n'; df -h /var /opt 2>/dev/null || true
printf 'RAM:\n'; free -h | head -2
