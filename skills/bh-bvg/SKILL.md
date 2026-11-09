---
name: bh-bvg
description: Sucht BVG-Haltestellen und zeigt die nächsten Abfahrten in Berlin. Nutzen, wenn jemand wissen möchte, wann Bus oder Bahn fährt.
---

# Skill: BH BVG

## Zweck

Haltestellen und Live-Abfahrten über das zentrale MCP-Gateway. Datenquelle ist die offene Schnittstelle `v6.bvg.transport.rest`, ohne Konto und ohne Schlüssel.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `bvg_stops` | Haltestelle per Name suchen (`query`) |
| `bvg_departures` | Nächste Abfahrten einer Haltestelle (`stop` = Kennung, `minutes`, `results`) |

## Regeln

- Häufig gebrauchte Haltestelle der Familie: Amtsgerichtsplatz (`900024104`).
- Die Schnittstelle ist ein freiwilliger Dienst: maßvoll abfragen, keine Dauerschleifen.
- Das Startbild des Beamers fragt die Abfahrten direkt ab, höchstens einmal pro Minute und nur, wenn der Start-Bildschirm sichtbar ist.
