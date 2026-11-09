---
name: bh-netatmo
description: Liest Raumtemperaturen und Heizplan aus Netatmo und setzt Solltemperaturen. Nutzen, wenn jemand wissen möchte, wie warm es ist, oder die Heizung ändern will.
---

# Skill: BH Netatmo

## Zweck

Raumweise Temperaturen der Netatmo-Thermostate über das zentrale MCP-Gateway. Das Konto hat Thermostatventile und Relais, aber keine Wetterstation, also keine Außenwerte.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `netatmo_rooms` | Temperatur, Sollwert, Heizbetrieb, offenes Fenster, schwache Batterie je Raum |
| `netatmo_status` | Räume plus aktiver Heizplan und Sondermodus |
| `netatmo_set_room` | Solltemperatur eines Raums setzen (`room`, `temp`, `minutes`) oder zurück zum Plan (`backToPlan`) |

## Regeln

- `netatmo_set_room` steuert die echte Heizung, immer nur befristet. Heizpläne werden nicht verändert.
- Zugang liegt in der `.env` (`BH_NETATMO_USER`, `BH_NETATMO_PASSWORD`).
- Schonend: Werte 5 Minuten zwischengespeichert, die bestehende Sitzung wird weitergeführt statt neu anzumelden.
- Nach einer abgelehnten Anmeldung 30 Minuten Sperre, damit das Konto nicht gesperrt wird.
