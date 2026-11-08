---
name: bh-beamer
description: Zeigt den Status des Samsung-Beamers im Heimnetz und drückt Tasten seiner Fernbedienung. Nutzen, wenn der User den Beamer bedienen möchte.
---

# Skill: BH Beamer

## Zweck

Bedient den Samsung The Premiere über das zentrale MCP-Gateway und den WireGuard-Tunnel. Nur für freigegebene User (`users` in `bh-mcp-gateway/servers.json`).

## Werkzeuge

| Tool | Zweck |
|---|---|
| `beamer_status` | Erreichbarkeit, Name, Modell, Zustand |
| `beamer_press` | Taste drücken: `KEY_POWER`, `KEY_VOLUP`, `KEY_VOLDOWN`, `KEY_MUTE`, `KEY_HOME`, `KEY_RETURN`, Pfeile, `KEY_ENTER`, `KEY_PLAY`, `KEY_PAUSE`, `KEY_SOURCE` |

## Erste Verbindung

Beim ersten Tastendruck erscheint am Beamer eine Abfrage. Der User erlaubt sie mit der Fernbedienung; das Token wird danach gespeichert.

## Regeln

- Nur auf ausdrücklichen Wunsch bedienen, der Beamer steht in einem bewohnten Raum.
- `KEY_POWER` schaltet aus. Einschalten aus dem Standby klappt darüber meist nicht.
