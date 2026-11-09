# Business Logic: BH Workspace

## Regeln (Matti, 09.11.2026)

- Jede Registrierung legt automatisch einen Container für den User an.
- Solange er baut, zeigt die Web-App „Umgebung wird vorbereitet …“.
- Jeder User hat eine eigene Subdomain und legt je App selbst die Route fest.

## Sicherheit

- Der Aufbau läuft als root auf dem Host und liest nur die User-Liste. Keine Web-App bekommt Docker-Rechte.
- Das Web-Terminal verbindet nur mit dem Container, der zur angemeldeten E-Mail gehört.
- Das Web-Terminal teilt sich Netze mit den Containern. Deshalb prüft es ein Geheimnis vom Web-Eingang; ohne das kann niemand eine Identität vortäuschen.
- WebSocket und Schreibzugriffe gelten nur von der eigenen Seite, weil User-Apps auf Subdomains derselben Website laufen.
- Wer sich abmeldet, verliert offene Terminals spätestens nach 5 Minuten.
- Das Sitzungs-Cookie der Plattform wird nie an User-Apps weitergegeben.
- Hochgeladene Bilder werden nur als echte Bildtypen ausgeliefert, nie als SVG.

## Öffentliche Apps und Sicherheits-Wächter (Matti, 09.11.2026)

- Eine App ist standardmäßig nur nach Anmeldung erreichbar. Öffentlich wird sie nur auf Wunsch und nur nach bestandener Prüfung.
- Der User gibt dafür Route und App-Ordner an: `bh-route public /spiel ~/projects/spiel`.
- Der Wächter (`bh-workspace-guard`, alle 5 Minuten) prüft:
  1. Geheimnisse im Code mit gitleaks, ohne Netz und schreibgeschützt.
  2. Sensible Dateien im App-Ordner (`.env`, Schlüssel, Datenbanken).
  3. Zugriff auf das KI- oder MCP-Gateway, weil Fremde sonst Kosten auslösen könnten.
  4. Von außen abrufbar: `.env`, `.git`, Quelldateien und Geheimnisse in der Seite.
- Code wird neu geprüft, wenn sich Dateien ändern, die Live-Abfragen laufen jedes Mal.
- Bei einem Fund verliert die App die öffentliche Freigabe sofort und ist wieder nur mit Anmeldung erreichbar. Gemeldet werden Regel und Datei, nie der gefundene Wert.
- Öffentliche Routen sind auf 20 Anfragen je Sekunde und Besucher begrenzt.
