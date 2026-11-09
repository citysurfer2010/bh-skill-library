# Business Logic: BH OpenCode

## Regeln (Matti, 09.11.2026)

- Jeder neue User bekommt dieselbe Konfiguration, ohne dass jemand etwas einrichten muss.
- OpenCode kennt seine Umgebung, seine Rechte und seine Grenzen.
- Gearbeitet wird wie mit Claude Code: Regeln, Pre- und Post-Hooks, automatisches Pushen, englischer Code.
- Das Web-App-Gerüst ist ein Angebot. Spiele und andere freie Anwendungen dürfen abweichen und eine eigene Oberfläche haben.

## Automatisches Pushen

- Gepusht wird, wenn OpenCode mit einer Aufgabe fertig ist und es neue Commits gibt.
- Nur auf Branches außer `main` und `master`, nur mit Remote `origin`, nie mit `--force`.
- OpenCode committet selbst nach jeder Aufgabe. Das Plugin committet nicht, weil es keine sinnvolle Nachricht schreiben kann.
- Findet die Prüfung ein mögliches Geheimnis in den neuen Commits, wird nicht gepusht und der User gewarnt.

## Pushes auf main

Der erste Push in ein neues, leeres Repo darf auf `main` gehen. Sobald `main` beim Remote existiert, laufen Änderungen über einen Branch und einen Pull Request.
