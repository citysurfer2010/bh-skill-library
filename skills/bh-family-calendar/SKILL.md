---
name: bh-family-calendar
description: Zeigt einmalige Termine aus dem Family-Kalender und legt neue an, auf Wunsch mit Einladungen. Nutzen, wenn jemand wissen möchte, was ansteht, oder einen Familientermin eintragen will.
---

# Skill: BH Family Calendar

## Zweck

Einmalige Termine der nächsten 14 Tage über das zentrale MCP-Gateway. Das Startbild des Beamers zeigt die nächsten drei.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `familycal_upcoming` | Einmalige Termine der nächsten 14 Tage: Datum, Uhrzeit, Titel |
| `familycal_new_event` | Termin anlegen: `summary`, `date` oder `start`, optional `endDate`, `end`, `location`, `description`, `attendees` (E-Mails), `dryRun` |

## Regeln

- Arbeitet nur mit einem Kalender (`BH_FAMILY_CALENDAR_ID` in der `.env`).
- Einladungen verschickt Google sofort per E-Mail. Mit Gästen deshalb immer zuerst `dryRun` zeigen und den User bestätigen lassen.
- `familycal_new_event` darf nur Matti, die Beamer-App kann nur lesen.
- Nutzt die Google-Freigabe von Matti. Die Beamer-App bekommt so nur dieses eine Werkzeug, nicht den ganzen Google-Zugang.
