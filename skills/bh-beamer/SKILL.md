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
| `beamer_open_app` | App starten: YouTube, Prime Video, Netflix, Disney+, Apple TV, Spotify, WOW, Internet |
| `beamer_show_text` | Text groß anzeigen: in der App BH Screen, sonst als Bild per Stream |
| `beamer_show_url` | Webseite im Vollbild öffnen (braucht die App BH Screen) |
| `beamer_play_media` | Video, Radio/Musik (`kind: audio`) oder Bild per DLNA abspielen, Adresse muss eine direkte Medienadresse sein |
| `beamer_play_youtube` | YouTube-Video abspielen (Link oder Video-Kennung), startet die YouTube-App mit dem Video |
| `beamer_play_radio` | Radiosender/Musik-Stream (https, mp3/aac) in der App BH Screen abspielen |
| `beamer_stop_radio` | Radio beenden |
| `beamer_share_start` / `beamer_share_answer` | Bildschirmfreigabe vermitteln (WebRTC-Angebot abgeben, Antwort des Beamers holen); Oberfläche in der App Beamer |
| `beamer_power` | Ein-/Ausschalten (`state: on\|off`), meldet Erfolg nur bei bestätigtem Zustand |
| `beamer_stop_media` | Wiedergabe beenden |
| `beamer_media_state` | Zustand der Wiedergabe |

## Erste Verbindung

Beim ersten Tastendruck erscheint am Beamer eine Abfrage. Der User erlaubt sie mit der Fernbedienung; das Token wird danach gespeichert.

## Regeln

- Nur auf ausdrücklichen Wunsch bedienen, der Beamer steht in einem bewohnten Raum.
- Inhalte auf dem Bildschirm sieht jeder im Raum: nichts Privates anzeigen, was der User nicht genannt hat.
- Der Link der Anzeigeseite ist geheim und bleibt in der `.env`, er wird nie ausgegeben.
- `KEY_POWER` schaltet aus. Einschalten aus dem Standby klappt darüber meist nicht.

## App „BH Screen“ (einmalig vom Mac installieren)

Quellcode in `app/`. Die App fragt alle 3 Sekunden den Server, was sie zeigen soll: Text oder eine Webseite im Vollbild.
Samsung stellt Zertifikate nur über Tizen Studio aus, deshalb läuft das Paketieren auf dem Mac:

1. Tizen Studio installieren, Certificate Manager → Samsung-Profil `BH` (Distributor Public, DUID des Beamers, Samsung-Konto).
2. Am Beamer: Apps → 1 2 3 4 5 → Developer mode, Host-IP = IP des Macs; Beamer neu starten.
3. `app/build.sh <BH_SCREEN_URL> <Beamer-IP>`; die Adresse steht in `/srv/mcp-gateway/nas.env` auf dem Server (`BH_SCREEN_URL`).

Danach erkennt der Skill die App und nutzt sie automatisch.

Hintergründe, Grenzen und der komplette Einrichtungsweg: `BUSINESS_LOGIC.md`.
