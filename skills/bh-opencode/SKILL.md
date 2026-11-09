---
name: bh-opencode
description: Einheitliche Konfiguration von OpenCode für jeden User auf der BH Platform, mit Kontext, Arbeitsregeln und Hooks. Nutzen, wenn es um Verhalten, Regeln, Hooks oder das automatische Pushen von OpenCode geht.
---

# Skill: BH OpenCode

## Zweck

Jeder User bekommt dasselbe OpenCode: gleicher Kontext, gleiche Regeln, gleiche Hooks. Alles liegt zentral in diesem Skill und gilt sofort für alle.

## Bausteine

| Datei | Aufgabe |
|---|---|
| `CONTEXT.md` | Was OpenCode über seine Umgebung wissen muss: Container, Rechte, GitHub, Werkzeuge, Server, Grenzen, Promoten |
| `RULES.md` | Arbeitsregeln: Git, Commits, Pull Requests, Sprache, Tests |
| `plugin/bh-guard.js` | Hooks: lädt beide Dateien, prüft Befehle, erinnert an Tests, pusht automatisch |

## So kommt es zum User

- `plugin/bh-guard.js` wird nach `~/.config/opencode/plugins/` verlinkt, beim Start des Containers und beim ersten Verbinden im Web-Terminal.
- Der Link zeigt auf den schreibgeschützten Skill-Ordner. Eine Änderung hier wirkt beim nächsten Start von OpenCode bei allen.
- Das Plugin hängt `CONTEXT.md` und `RULES.md` an die `instructions` an.

## Hooks

| Hook | Wirkung |
|---|---|
| `config` | Lädt Kontext und Regeln |
| `tool.execute.before` (Pre) | Sperrt `git push --force`, Pushes auf ein bestehendes `main`/`master`, `--no-verify`, `git reset --hard`, `git clean -f`, `git checkout .`, `git restore .`, das Lesen von Tokens und Commit-Nachrichten außerhalb des Formats |
| `tool.execute.after` (Post) | Erinnert einmal je App an `npm test` und die Version `JJ.M.N`, merkt sich berührte Repos |
| `event: session.idle` | Pusht fertige Commits des Branches automatisch, nie `main`/`master`, nie mit gefundenem Geheimnis |

Protokoll des automatischen Pushens: `~/.cache/bh-opencode/autopush.log`.

## Tests

```bash
node --test skills/bh-opencode/test/guard.test.js
```
