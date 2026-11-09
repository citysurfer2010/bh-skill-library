# BH Skill Library

Kanonische Skills und Server-Einrichtung der BH Platform. Dieses Repo ist oeffentlich lesbar:
**keine Schluessel, Tokens, Kundendaten oder internen Adressen einchecken.**

| Ordner | Inhalt |
|---|---|
| `skills/` | Skills fuer opencode (`<name>/SKILL.md`) |
| `platform/` | Einrichtung des Servers: User-Container, LLM-Gateway, Firewall |
| `scripts/` | Pruefungen fuer dieses Repo |

## Aufbau

| Ordner | Inhalt |
|---|---|
| `apps/` | Anwendungen, die Nutzer öffnen |
| `services/` | Infrastruktur, von der alles andere abhängt: `bh-auth`, `bh-mcp-gateway` |
| `skills/` | Wissen und MCP-Werkzeuge, wird in die Container eingehängt |
| `platform/` | Server-Einrichtung, Image, Edge |

## Skills

| Skill | Zweck |
|---|---|
| `bh-auth` | Anmeldedienst mit Login-Seite und Benutzerverwaltung |
| `bh-mcp-gateway` | Zentrales MCP-Gateway, ueber das alle Werkzeuge laufen |
| `bh-opencode` | Gleicher Kontext, gleiche Regeln und Hooks für OpenCode bei jedem User |
| `bh-github` | Git, GitHub und Pull Requests |
| `bh-google-workspace` | Gmail, Drive, Docs, Sheets, Slides, Kalender und Chat |
| `bh-webapp-skeleton` | Neue Web-App im BH-Standard anlegen |
| `bh-icloud` | Kalender, Kontakte und Mail aus iCloud lesen, je User im Profil verbunden |
| `bh-nas` | Eigene Daten auf der Synology lesen, je User mit eigenem Konto (noch nicht nutzbar, siehe `LIMITATIONS.md`) |
| `bh-beamer` | Samsung-Beamer im Heimnetz bedienen |
| `bh-styleguide` | Verbindlicher Style Guide: Farben, Ecken, Schrift, Komponenten |

Auf dem Server liegt das Repo unter `/opt/bh-skill-library`. Die Anleitungen (`SKILL.md`) sind schreibgeschuetzt
in jedem User-Container eingehaengt, die Werkzeuge laufen zentral hinter dem MCP-Gateway.

## Neuen Skill anlegen

Ordner `skills/<name>/` mit `SKILL.md`. Der Kopf braucht `name` (gleich dem Ordnernamen, Kleinbuchstaben
und Bindestriche) und `description`. Vor dem Commit: `scripts/validate.sh`.
