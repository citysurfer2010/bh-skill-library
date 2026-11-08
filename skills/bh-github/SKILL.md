---
name: bh-github
description: Arbeiten mit Git und GitHub, Pull Requests erstellen, pruefen und mergen. Nutzen beim Klonen, Branchen, Committen, Pushen und fuer alles rund um Pull Requests, Reviews und CI-Status.
---

# Skill: BH GitHub

## Zweck

Git-Ablauf mit `git` und `gh` im Container, Pull-Request-Werkzeuge ueber das zentrale MCP-Gateway.

## GitHub verknuepfen (schaltet den Skill frei)

Einmalig je User, im eigenen Terminal oder durch den Agenten:

```bash
bh-github-connect
```

Der Befehl zeigt einen Link und einen Code. Nach der Bestaetigung im Browser sind `git`, `gh` und die
Gateway-Werkzeuge mit dem eigenen GitHub-Konto verbunden.

**Als Agent**, sobald ein Werkzeug `GitHub noch nicht verknuepft` meldet oder der User GitHub verbinden moechte:

1. `bh-github-connect` ausfuehren und dem User **Link und Code woertlich** zeigen.
2. Warten, bis der User die Bestaetigung meldet.
3. `bh-github-connect --status` ausfuehren und die urspruengliche Aufgabe fortsetzen.

Nie nach Tokens fragen und keine Tokens in Dateien, Remotes oder Befehlszeilen schreiben.

## Werkzeuge (Gateway)

| Tool | Zweck |
|---|---|
| `github_auth_status` | Verbundenes GitHub-Konto |
| `github_pr_create` | Pull Request erstellen, auch als Entwurf |
| `github_pr_list` | Pull Requests auflisten |
| `github_pr_status` | Zustand, Merge-Faehigkeit und Checks |
| `github_pr_review_radar` | Alle Reviews und Kommentare eines PRs |
| `github_pr_merge` | Mergen (squash, merge, rebase) |
| `github_pr_close` | Schliessen ohne Merge |

## Ablauf fuer eine Aenderung

1. Stand holen: `git fetch origin && git status -sb`
2. Branch: `git switch -c <art>/<kurzbeschreibung> origin/main` (`feat`, `fix`, `chore`, `docs`)
3. Aendern und Tests ausfuehren.
4. Gezielt aufnehmen: `git add <pfade>`, dann `git diff --cached --stat` lesen.
5. `git commit -m "feat: was und warum"`, dann `git push -u origin HEAD`
6. `github_pr_create` mit `draft: true`
7. `github_pr_status` bis die Checks gruen sind

## Pflicht-Regeln

1. **Review-Radar vor jeder Aktion an einem PR:** `github_pr_review_radar` fuer alle verketteten PRs und nach
   jedem eigenen Push erneut. Ein leerer Feature-PR heisst nicht, dass es kein Review gibt.
2. **Commit-Hygiene:** kleine, zusammenhaengende Commits; jede Message nennt das Warum. Grosse Aenderungen in
   getrennte PRs.
3. **Keine Erklaer-Kommentare im Code:** Kommentare nur fuer Einschraenkungen, Begruendungen in Commit und PR.
4. **Bestehenden Code erweitern** statt eigene Module oder Test-Harnische danebenzubauen.
5. **Der Besitzer entscheidet:** Ein `CHANGES_REQUESTED` schlaegt den eigenen Weg. Nie eigene PRs schliessen
   oder ersetzen, ohne offene Reviews gelesen zu haben.
6. Nie direkt auf `main` pushen, nie `git push --force` auf gemeinsame Branches.
7. `git reset --hard`, `git clean -fd`, `git checkout .` verwerfen Arbeit: nur nach Rueckfrage.
8. Keine Geheimnisse committen. Hooks nicht mit `--no-verify` umgehen.
9. Mergen nur nach gruenen Checks und wenn der User es moechte.

## Fehlerbehandlung

| Fehler | Ursache | Loesung |
|---|---|---|
| `GitHub noch nicht verknuepft` | Konto nicht verbunden | `bh-github-connect` ausfuehren |
| `404` | Repo oder PR-Nummer falsch, oder kein Zugriff | Angaben pruefen |
| `422` | Branch existiert nicht | Branch zuerst pushen |
| Nicht mergebar | Konflikte | Lokal loesen, dann pushen |
| `403` | Konto ohne Schreibrecht | Besitzer fragen |
