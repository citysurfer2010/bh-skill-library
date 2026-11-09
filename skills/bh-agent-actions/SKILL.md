---
name: bh-agent-actions
description: Zentrale Aktionen und Rezepte der Biskup Home Plattform, die über Beamer, Handy und Terminal gleich funktionieren. Zuerst nutzen, wenn jemand etwas erledigt haben möchte, etwa Termin anlegen, Heizung ändern, Überblick für heute, Synology prüfen, Fotos zeigen.
---

# Skill: BH Agent Actions

## Zweck

Eine Aktion ist hier einmal definiert und gilt für jeden Zugang. Jede Datei in `actions/` ist ein Rezept: welche MCP-Werkzeuge in welcher Reihenfolge laufen und was vorher bestätigt werden muss.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `actions_find` | Passende Aktion zu einem Wunsch finden |
| `actions_list` | Alle Aktionen mit Status |
| `actions_lookup` | Rezept einer Aktion |

## Vorgehen

1. `actions_find` mit dem Wunsch aufrufen.
2. Rezept mit `actions_lookup` holen und befolgen, Rückfragen darin inklusive.
3. Bei Status `geplant` oder `teilweise` sagen, was noch fehlt.

## Neue Aktion

Markdown-Datei in `actions/` anlegen, oben `title`, `summary`, `tags`, `tools`, `status`. Ein Test prüft, dass die genannten Werkzeuge existieren.

Regeln und Grenzen: `BUSINESS_LOGIC.md`, `LIMITATIONS.md`.
