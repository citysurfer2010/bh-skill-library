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
| `bvg_board` | Abfahrtstafel Amtsgerichtsplatz; morgens nur Richtung Westen |
| `bvg_alerts` | Ausfälle und Störungen: M49 am Amtsgerichtsplatz, Ringbahn Messe Nord, Stadtbahn ab Charlottenburg |
| `bvg_departures` | Nächste Abfahrten einer Haltestelle (`stop` = Kennung, `minutes`, `results`) |

## Regeln

- Häufig gebrauchte Haltestelle der Familie: Amtsgerichtsplatz (`900024104`).
- Schulweg: M49 Richtung Westen (Staaken/Heerstraße), morgens zeigt das Startbild nur diese Richtung.
- Die Schnittstelle ist ein freiwilliger Dienst: maßvoll abfragen, keine Dauerschleifen.
- Alle Anzeigen laufen über diese Werkzeuge: Die App Beamer holt die Tafel einmal pro Minute (5:30 bis 23 Uhr) und die Störungen alle 5 Minuten; auch der Buddy kann sie aufrufen.
