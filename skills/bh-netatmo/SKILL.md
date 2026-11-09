---
name: bh-netatmo
description: Liest Raumtemperaturen und Heizbetrieb aus Netatmo, nur lesend. Nutzen, wenn jemand wissen möchte, wie warm es zu Hause ist.
---

# Skill: BH Netatmo

## Zweck

Raumweise Temperaturen der Netatmo-Thermostate über das zentrale MCP-Gateway. Das Konto hat Thermostatventile und Relais, aber keine Wetterstation, also keine Außenwerte.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `netatmo_rooms` | Temperatur, Sollwert, Heizbetrieb, offenes Fenster, schwache Batterie je Raum |

## Regeln

- Nur lesend, das Heizen wird nicht gesteuert.
- Zugang liegt in der `.env` (`BH_NETATMO_USER`, `BH_NETATMO_PASSWORD`).
- Schonend: Werte 5 Minuten zwischengespeichert, Anmeldung höchstens alle 2,5 Stunden.
- Nach einer abgelehnten Anmeldung 30 Minuten Sperre, damit das Konto nicht gesperrt wird.
