# Beamer: Bekannte Einschränkungen

## Priorität
- Kritisch: Datenverlust, Sicherheit, funktionaler Ausfall
- Wichtig: UX, Skalierung, Performance
- Später: nice-to-have

## Module

| Modul | Datei | Offene Punkte |
|-------|-------|---------------|
| _(noch keine Module)_ | | |

## Prozess

Neue Einschränkung erkannt: sofort hier eintragen, nicht merken. Bei Umsetzung mit Datum nach „Erledigt“ verschieben.
Details zu einem Modul: `docs/limitations/<modul>.md`.

## Beamer-App

- „Läuft gerade“ merkt sich nur die App; was jemand per Fernbedienung umschaltet, sieht sie nicht. Nach einem Neustart der App ist die Anzeige leer.
- Einschalten braucht am Beamer die Einstellungen „Einschalten über Mobilgerät“ und IP-Fernzugriff; nach einem Stromausfall nur per Fernbedienung erprobt.

- Bildschirm und Kamera teilen geht nur im selben Heimnetz (WebRTC ohne STUN/TURN). Am Handy gibt es nur die Kamera, Browser dort können keinen Bildschirm teilen.

- Die Radio-Pause merkt sich der Beamer nur, solange BH Home läuft.
- Am Geburtstag startet der Screen auf dem Reiter „Geburtstag“; Klausuren und Änderungen zeigt dort nur ein Punkt am Reiter „Heute“.

## Backlog

- Einmalige Termine aus dem Family-Kalender auf dem Startbild (Matti, 09.11.2026). Wartet auf den Google-Login; die App braucht dazu Lesezugriff auf den Kalender.

- Ruhebild mit Uhr und Wetter, wenn nichts läuft.
- BH Home mit der echten Fernbedienung bedienen (Senderwahl per Pfeiltasten).
- Szenen und Zeitpläne, z. B. „Abend“ = Kamin + Radio leise.
