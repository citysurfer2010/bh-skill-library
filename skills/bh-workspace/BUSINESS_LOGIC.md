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
