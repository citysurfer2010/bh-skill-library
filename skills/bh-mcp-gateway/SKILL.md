---
name: bh-mcp-gateway
description: Zentrales MCP-Gateway der BH Platform, ueber das alle Werkzeuge laufen. Nutzen, wenn ein Werkzeug fehlt, ein neuer MCP-Server angebunden werden soll oder Gateway-Fehler auftreten.
---

# Skill: BH MCP-Gateway

## Zweck

Alle Werkzeuge laufen zentral im Container `mcp-gateway`. opencode kennt nur diesen einen Endpunkt.
Zugangsdaten (Google, GitHub) liegen je User auf dem Gateway, nie im User-Container.

## Aufbau

| Baustein | Aufgabe |
|---|---|
| `server/gateway.mjs` | HTTP-Endpunkt `/mcp`, Anmeldung per User-Token |
| `server/lib/backend.mjs` | Je User und Server ein Prozess mit eigenem Home |
| `server/lib/registry.mjs` | Fuehrt Werkzeuge zusammen: `<server>_<werkzeug>` |
| `servers.json` | Liste der angebundenen Server |

## Neuen Server anbinden

1. Server als `skills/bh-<name>/server/` anlegen (stdio-MCP, keine Abhaengigkeit ausserhalb des Ordners).
2. Eintrag in `servers.json`, zugehoerigen Skill mit `SKILL.md` schreiben.
3. Auf dem Server `docker restart mcp-gateway`.

## Grenzen

- Werkzeuge sehen das Dateisystem des Gateways, nicht das des User-Containers. Dateien als Inhalt uebergeben.
- Der Werkzeug-Katalog gilt fuer alle User gleich; Rechte ergeben sich aus dem verbundenen Konto.

## Fehler

| Meldung | Ursache |
|---|---|
| `401` | Token ungueltig: Admin fuehrt `devbox rotate-llm-token <name>` aus |
| `Zeitueberschreitung` | Werkzeug brauchte ueber 120 Sekunden |
| Werkzeug fehlt | `docker logs mcp-gateway`, dort steht der Fehler des Servers |
