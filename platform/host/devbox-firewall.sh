#!/usr/bin/env bash
# Container duerfen ins Internet, aber nicht auf den Host, ins interne Netz oder zueinander.
# Idempotent; laeuft bei jedem Docker-Start (devbox-firewall.service).
set -euo pipefail
NETS=172.30.0.0/16
PRIVATE=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,100.64.0.0/10,127.0.0.0/8

chain() { iptables -N "$1" 2>/dev/null || iptables -F "$1"; }
hook() { iptables -D "$1" -j "$2" 2>/dev/null || true; iptables -I "$1" 1 -j "$2"; }

# Zugriff aus den Containern auf Dienste des Hosts (auch ueber dessen oeffentliche IP).
chain DEVBOX-INPUT
iptables -A DEVBOX-INPUT -s "$NETS" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A DEVBOX-INPUT -s "$NETS" -j DROP
hook INPUT DEVBOX-INPUT

chain DEVBOX-FORWARD
# Verkehr innerhalb eines Netzes (User <-> Gateway) bleibt erlaubt; routen zwischen Netzen nicht.
iptables -A DEVBOX-FORWARD -m physdev --physdev-is-bridged -j RETURN
# Einzige Ausnahme: das MCP-Gateway darf die Web-API der Synology durch den Tunnel erreichen.
nas=$(sed -n 's/^BH_NAS_IP=//p' /srv/bh-platform/.env 2>/dev/null | tail -1)
gw_net=$(docker network inspect mcp-gateway-net -f '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true)
if [ -n "$nas" ] && [ -n "$gw_net" ]; then
  iptables -A DEVBOX-FORWARD -s "$gw_net" -d "$nas/32" -o wg-fritz -p tcp --dport 5001 -j ACCEPT
fi
beamer=$(sed -n 's/^BH_BEAMER_IP=//p' /srv/bh-platform/.env 2>/dev/null | tail -1)
if [ -n "$beamer" ] && [ -n "$gw_net" ]; then
  iptables -A DEVBOX-FORWARD -s "$gw_net" -d "$beamer/32" -o wg-fritz -p tcp -m multiport --dports 8002,9197 -j ACCEPT
fi
iptables -A DEVBOX-FORWARD -s "$NETS" -d "$PRIVATE" -j DROP
# Kein Mailversand direkt aus User-Containern (Spam-Schutz der IP).
iptables -A DEVBOX-FORWARD -s "$NETS" -p tcp -m multiport --dports 25,465,587 -j DROP
hook DOCKER-USER DEVBOX-FORWARD
