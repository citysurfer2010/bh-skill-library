#!/usr/bin/env bash
# Stores the Beamer's certificate in .env. Call only through the tunnel.
set -euo pipefail
ENV=/srv/bh-platform/.env; ip=$(sed -n 's/^BH_BEAMER_IP=//p' "$ENV" | tail -1); [ -n "$ip" ] || { echo "BH_BEAMER_IP fehlt" >&2; exit 1; }
chain=$(timeout 15 openssl s_client -showcerts -connect "$ip:8002" </dev/null 2>/dev/null | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p')
[ -n "$chain" ] || { echo "Kein Zertifikat erhalten" >&2; exit 1; }
fp=$(openssl x509 -noout -fingerprint -sha256 <<<"$chain" | cut -d= -f2)
sed -i '/^BH_BEAMER_CA_B64=/d; /^BH_BEAMER_FP=/d' "$ENV"; printf 'BH_BEAMER_CA_B64=%s\nBH_BEAMER_FP=%s\n' "$(base64 -w0 <<<"$chain")" "$fp" >>"$ENV"; chmod 600 "$ENV"
echo "Zertifikat hinterlegt: ${fp:0:11}…"
