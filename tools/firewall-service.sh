#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-help}"

usage() {
  printf '%s\n' \
    'Usage:' \
    '  ./tools/firewall-service.sh status' \
    '  ./tools/firewall-service.sh guide' \
    '  ./tools/firewall-service.sh help'
}

print_guide() {
  printf '%s\n' \
    'firewall guide:' \
    '  - open TCP 80 for HTTP access.' \
    '  - open TCP 443 for HTTPS access.' \
    '  - keep API port 3001 private; Nginx should proxy to http://127.0.0.1:3001.' \
    '  - if the server is behind a cloud security group, allow inbound 80/443 there too.' \
    '  - after changing firewall or security group rules, verify with:' \
    '      curl -I http://<server-ip-or-domain>/' \
    '      curl -I https://<domain>/' \
    '      curl -fsS http://127.0.0.1/api/health'
}

status_firewalld() {
  printf 'firewall tool: firewalld\n'
  printf 'firewalld state:\n'
  firewall-cmd --state 2>/dev/null || true
  printf 'firewalld services:\n'
  firewall-cmd --list-services 2>/dev/null || true
  printf 'firewalld ports:\n'
  firewall-cmd --list-ports 2>/dev/null || true
}

status_ufw() {
  printf 'firewall tool: ufw\n'
  ufw status 2>/dev/null || true
}

status_nft() {
  printf 'firewall tool: nftables\n'
  nft list ruleset 2>/dev/null || true
}

status_iptables() {
  printf 'firewall tool: iptables\n'
  iptables -S 2>/dev/null || true
}

status() {
  if command -v firewall-cmd >/dev/null 2>&1; then
    status_firewalld
  elif command -v ufw >/dev/null 2>&1; then
    status_ufw
  elif command -v nft >/dev/null 2>&1; then
    status_nft
  elif command -v iptables >/dev/null 2>&1; then
    status_iptables
  else
    printf 'firewall tool: not detected\n'
    printf 'manual check required: confirm TCP 80/443 are reachable and API 3001 is not exposed publicly\n'
  fi

  print_guide
}

case "$COMMAND" in
  help|-h|--help)
    usage
    ;;
  status)
    status
    ;;
  guide)
    print_guide
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    usage
    exit 1
    ;;
esac
