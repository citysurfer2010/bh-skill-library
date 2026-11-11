# Coding-Rules der BH Platform

Gilt für opencode und alle anderen Coding-Agenten in diesem Repo und in den Devboxen.

## Sprache

Englisch sind: Routen und URLs samt Query-Parametern, Dateinamen, Bezeichner, Code-Kommentare, Beschreibungen von MCP-Tools und Parametern, Commit- und PR-Texte. Das gilt auch für deutsche Fachbegriffe in Namen.

Deutsch bleiben nur Texte, die Nutzer sehen: Oberflächen, Fehlermeldungen an Nutzer und Dokumentation wie `SKILL.md`, `BUSINESS_LOGIC.md` und `LIMITATIONS.md`.

Schon geteilte deutsche Pfade leiten mit 301 auf den englischen Pfad um.

## Versionierung

Skills, Apps und ihre Dateien tragen die Version `JJ.M.N`, zum Beispiel `26.11.1`.

- `JJ` ist das Jahr, zweistellig.
- `M` ist der Monat, ohne führende Null: November `11`, September `9`.
- `N` zählt die Versionen innerhalb des Monats und beginnt in jedem Monat wieder bei `1`.

Jede veröffentlichte Änderung an einem Skill oder einer App erhöht deren `N` um 1, im selben Commit. Die erste Änderung in einem neuen Monat setzt Jahr und Monat neu und `N` auf `1`. Versionen werden je Skill geführt, nicht für das ganze Repo.

Die Version steht an diesen Stellen und muss überall gleich sein:

| Art | Datei und Feld |
|---|---|
| Skill | `skills/<skill>/manifest.json`, Feld `version` |
| Skill mit Server | `server/package.json` und in `server/server.js` Kopfzeile, `serverInfo` und Startmeldung |
| App | `apps/<app>/package.json` |
| Dienst | `skills/<dienst>/manifest.json`, Feld `version`, und `services/<dienst>/package.json` |
| Dienst | `skills/<dienst>/manifest.json`, Feld `version`, und `services/<dienst>/package.json` |
| BH Home | `skills/bh-beamer/app/config.xml`, Attribut `version` |

Das Jahr ist zweistellig und der Monat ohne Null, weil Tizen-Apps in den ersten beiden Stellen höchstens 255 erlauben und npm keine führenden Nullen zulässt. `scripts/validate.sh` prüft Format und Gleichheit.
