---
name: bh-family-calendar
description: Zeigt einmalige Termine aus dem Family-Kalender, nur lesend. Nutzen, wenn jemand wissen möchte, was in der Familie demnächst ansteht.
---

# Skill: BH Family Calendar

## Zweck

Einmalige Termine der nächsten 14 Tage über das zentrale MCP-Gateway. Das Startbild des Beamers zeigt die nächsten drei.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `familycal_upcoming` | Einmalige Termine der nächsten 14 Tage: Datum, Uhrzeit, Titel |

## Regeln

- Liest genau einen Kalender (`BH_FAMILY_CALENDAR_ID` in der `.env`), nur lesend.
- Nutzt die Google-Freigabe von Matti. Die Beamer-App bekommt so nur dieses eine Werkzeug, nicht den ganzen Google-Zugang.
