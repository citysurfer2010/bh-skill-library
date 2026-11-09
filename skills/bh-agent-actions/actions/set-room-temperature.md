---
title: Raumtemperatur ändern
summary: Solltemperatur eines Raums befristet setzen oder zurück zum Heizplan.
tags: [heizung, temperatur, raum, wärmer, kälter, netatmo]
tools: [netatmo_rooms, netatmo_status, netatmo_set_room]
status: aktiv
---

## Rezept

1. Raum mit `netatmo_rooms` bestimmen.
2. `netatmo_set_room` mit `room` und `temp` (7 bis 30 Grad in halben Schritten). Die Änderung ist befristet.
3. Zurück zum Plan: `netatmo_set_room` mit `backToPlan`.

Steuert die echte Heizung: Nur auf ausdrücklichen Wunsch ausführen.
