# BH Skill Library

Kanonische Skills und Server-Einrichtung der BH Platform. Dieses Repo ist oeffentlich lesbar:
**keine Schluessel, Tokens, Kundendaten oder internen Adressen einchecken.**

| Ordner | Inhalt |
|---|---|
| `skills/` | Skills fuer opencode (`<name>/SKILL.md`) |
| `platform/` | Einrichtung des Servers: User-Container, LLM-Gateway, Firewall |
| `scripts/` | Pruefungen fuer dieses Repo |

## Skills

| Skill | Zweck |
|---|---|
| `bh-auth` | Anmeldedienst mit Login-Seite und Benutzerverwaltung |
| `bh-mcp-gateway` | Zentrales MCP-Gateway, ueber das alle Werkzeuge laufen |
| `bh-github` | Git, GitHub und Pull Requests |
| `bh-google-workspace` | Gmail, Drive, Docs, Sheets, Slides, Kalender und Chat |
| `bh-webapp-skeleton` | Neue Web-App im BH-Standard anlegen |
| `bh-nas` | Eigene Daten auf der Synology lesen, je User mit eigenem Konto |
| `bh-styleguide` | Verbindlicher Style Guide: Farben, Ecken, Schrift, Komponenten |

Auf dem Server liegt das Repo unter `/opt/bh-skill-library`. Die Anleitungen (`SKILL.md`) sind schreibgeschuetzt
in jedem User-Container eingehaengt, die Werkzeuge laufen zentral hinter dem MCP-Gateway.

## Neuen Skill anlegen

Ordner `skills/<name>/` mit `SKILL.md`. Der Kopf braucht `name` (gleich dem Ordnernamen, Kleinbuchstaben
und Bindestriche) und `description`. Vor dem Commit: `scripts/validate.sh`.
