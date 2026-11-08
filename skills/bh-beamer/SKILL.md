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
| `beamer_show_text` | Text groß anzeigen: setzt die Anzeigeseite und öffnet sie im Browser des Beamers |
| `beamer_show_url` | Beliebige https-Seite im Browser des Beamers öffnen |
| `beamer_play_media` | Video oder Bild per DLNA abspielen, Adresse muss für den Beamer erreichbar sein |
| `beamer_stop_media` | Wiedergabe beenden |
| `beamer_media_state` | Zustand der Wiedergabe |

## Erste Verbindung

Beim ersten Tastendruck erscheint am Beamer eine Abfrage. Der User erlaubt sie mit der Fernbedienung; das Token wird danach gespeichert.

## Regeln

- Nur auf ausdrücklichen Wunsch bedienen, der Beamer steht in einem bewohnten Raum.
- Inhalte auf dem Bildschirm sieht jeder im Raum: nichts Privates anzeigen, was der User nicht genannt hat.
- Der Link der Anzeigeseite ist geheim und bleibt in der `.env`, er wird nie ausgegeben.
- `KEY_POWER` schaltet aus. Einschalten aus dem Standby klappt darüber meist nicht.
