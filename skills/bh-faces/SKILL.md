---
name: bh-faces
description: Lokaler Gesichtsindex über die Familienfotos auf der Synology. Grundlage für KI-Alben wie „Wie Finn aufgewachsen ist“. Nutzen, wenn es um Personen auf den Familienfotos oder den Stand des Index geht.
---

# Skill: BH Faces

## Zweck

Findet Gesichter auf den Fotos aus `/Bilder` und legt je Gesicht einen Fingerabdruck ab, damit später nach Personen gesucht werden kann. Alles läuft auf dem eigenen Server.

## Werkzeuge

| Tool | Zweck |
|---|---|
| `faces_index_step` | Ein kleiner Schritt: ein Album einlesen oder ein Bild analysieren |
| `faces_status` | Fortschritt als Zahlen |

Beide sind nur für die Beamer-App freigegeben.

## Betrieb

Einrichten mit `setup/setup-faces.sh`. Den Takt gibt die Beamer-App vor (`apps/beamer/lib/face-indexer.js`).

Regeln und Grenzen: `BUSINESS_LOGIC.md`, `LIMITATIONS.md`.
