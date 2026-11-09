---
name: bh-birthdays
description: Kennt die Geburtstage der Familie und findet schöne Ereignisse vom selben Datum. Nutzen, wenn jemand nach Geburtstagen fragt oder einen eintragen möchte.
---

# Skill: BH Birthdays

## Zweck

Geburtstage der Familie über das zentrale MCP-Gateway. Das Startbild des Beamers zeigt sie sieben Tage vorher und am Tag selbst als eigenen Screen. Auch der Buddy kann sie abfragen und pflegen.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `birthdays_upcoming` | Geburtstage der nächsten 7 Tage: Vorname, Abstand, neues Alter |
| `birthdays_list` | Alle Einträge mit vollem Datum |
| `birthdays_set` | Eintrag anlegen oder ändern (`name`, `date` als JJJJ-MM-TT) |
| `birthdays_remove` | Eintrag entfernen (`name`) |
| `birthdays_on_this_day` | Drei schöne Ereignisse und eine bekannte Person vom heutigen Datum |

## Regeln

- Geburtsdaten liegen nur auf dem Server in `/srv/mcp-gateway/family`, nie im öffentlichen Repo.
- Zum Beamer gehen nur Vorname, Alter und Abstand.
- `birthdays_on_this_day` nutzt Wikipedia, sendet nur Monat und Tag und ruft höchstens einmal am Tag ab.
- Die Auswahl filtert Tod, Krieg, Unglücke und Politik heraus. Es bleibt ein Wortfilter: Bei neuen Daten kurz prüfen.
