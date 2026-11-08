---
name: bh-webuntis
description: Liest die Stundenpläne der Kinder aus WebUntis, nur lesend, mit Ausfällen und Vertretungen. Nutzen, wenn jemand wissen möchte, wie der Schultag aussieht.
---

# Skill: BH WebUntis

## Zweck

Holt über das zentrale MCP-Gateway den Tagesplan aller Kinder des Eltern-Kontos. Das Startbild des Beamers zeigt ihn an.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `webuntis_day` | Plan eines Tages (`date` als JJJJ-MM-TT). Ohne Datum: der nächste relevante Schultag, ab 16 Uhr und am Wochenende der folgende |

## Zugang

`BH_WEBUNTIS_SERVER`, `BH_WEBUNTIS_SCHOOL`, `BH_WEBUNTIS_USER`, `BH_WEBUNTIS_PASSWORD` in `/srv/bh-platform/.env`. Nie im Code oder Chat.

## Regeln

- Nur lesen, nie etwas in WebUntis ändern.
- Selten abrufen: Die App Beamer fragt um 7:05 (dann steht der Vertretungsplan), 10:00, 13:00 und 16:05 Uhr.
- Die Programm-Schnittstelle `jsonrpc.svc` ist gesperrt (403). Der Skill nutzt die Anmeldung der Webseite auf ausdrücklichen Wunsch des Kontoinhabers. Sperrt WebUntis das, wird nicht drumherum gearbeitet.
- Lehrkräfte werden nicht ausgegeben: Für die Anzeige im Wohnzimmer reichen Fach und Änderung.
