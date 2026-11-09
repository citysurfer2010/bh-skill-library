#!/usr/bin/env bash
# Stores the Synology's certificate in .env. Call only through the tunnel.
set -euo pipefail
ENV=/srv/bh-platform/.env; nas=$(sed -n 's/^BH_NAS_IP=//p' "$ENV" | tail -1); [ -n "$nas" ] || { echo "BH_NAS_IP fehlt" >&2; exit 1; }
chain=$(timeout 15 openssl s_client -showcerts -connect "$nas:5001" </dev/null 2>/dev/null | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p')
[ -n "$chain" ] || { echo "Kein Zertifikat erhalten" >&2; exit 1; }
fp=$(openssl x509 -noout -fingerprint -sha256 <<<"$chain" | cut -d= -f2)
ca=$(base64 -w0 <<<"$chain")
sed -i '/^BH_NAS_CA_B64=/d; /^BH_NAS_FP=/d' "$ENV"; printf 'BH_NAS_CA_B64=%s\nBH_NAS_FP=%s\n' "$ca" "$fp" >>"$ENV"; chmod 600 "$ENV"
echo "Zertifikat hinterlegt: ${fp:0:11}…"
