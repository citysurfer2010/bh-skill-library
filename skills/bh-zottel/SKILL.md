---
name: bh-zottel
description: Zottel ist der persönliche Assistent je User auf der BH Platform. Nutzen, wenn es um Zottel, seine Werkzeuge, Bestätigungskarten, das Gedächtnis oder den Live-Modus geht.
---

# Skill: Zottel

## Zweck

Jeder User hat unter `apps.familiebiskup.de/zottel/` seinen eigenen Zottel: eigene Gespräche, eigenes Gedächtnis, eigene verbundene Konten. Er nimmt Arbeit ab, bereitet vor, erinnert und schlägt Besseres vor.

## Aufbau

| Baustein | Aufgabe |
|---|---|
| `apps/zottel/lib/agent.js` | Gesprächsschleife: Antwort streamen, Werkzeuge, Karten, Fortsetzen |
| `apps/zottel/lib/agent-tools.js` | `find_tools` und `use_tool`: Werkzeuge werden bei Bedarf gesucht, der Prompt bleibt klein |
| `apps/zottel/lib/tool-policy.js` | Lesen läuft sofort, alles andere braucht eine Karte |
| `apps/zottel/lib/gateway.js` | Werkzeuge über das MCP-Gateway im Namen des angemeldeten Users |
| `apps/zottel/lib/store.js` | Alles in SQLite, je User getrennt |

## Regeln im Betrieb

- Änderungen nur nach Karte: „Ausführen“, „Immer erlauben“ oder „Ablehnen“.
- Modus „Nur schauen“ erlaubt nie Änderungen, auch nicht für freigegebene Werkzeuge.
- Das Gateway führt Werkzeuge nur als User aus, wenn das Konto `app/bh-apps` anfragt und `BH_ACT_AS_SECRET` stimmt.

## Ausrollen

Plattform-App: `bhapp deploy zottel /opt/bh-skill-library/apps/zottel "Dein persönlicher Assistent"`.
