#!/usr/bin/env bash
# Builds and starts the face analysis. Reachable only from the MCP gateway, without any route to the outside.
set -euo pipefail
LIB=/opt/bh-skill-library/skills/bh-faces
docker build -q -t bh-faces "$LIB/worker" >/dev/null
docker network inspect bh-faces-net >/dev/null 2>&1 || docker network create --internal bh-faces-net >/dev/null
docker rm -f bh-faces >/dev/null 2>&1 || true
docker run -d --name bh-faces --network bh-faces-net --restart unless-stopped --cpus 0.7 --memory 900m --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges bh-faces >/dev/null
docker network connect bh-faces-net mcp-gateway 2>/dev/null || true
echo "bh-faces laeuft"
