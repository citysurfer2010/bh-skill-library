# Beamer: Produktkontext und Entscheidungen

> Das **Warum**: UX-Prinzipien, Fachregeln, Lessons Learned.
> Das Wie steht in DEVELOPMENT.md, was fehlt in LIMITATIONS.md.

## 1. Produktvision
Den Samsung-Beamer im Wohnzimmer ohne Fernbedienung und Terminal bedienen: Stimmungsvideos, Radio, YouTube, Text, Webseiten, Apps.

## 2. Zielgruppe
Alle angemeldeten BH-Nutzer (Familie, 2–3 Personen); keine Admin-Funktionen.

## 3. UX-Prinzipien
Ein Klick bis zum Bild. Jede Aktion zeigt sofort ihren Zustand (Lädt, Toast, aktive Kachel). Am Handy nutzbar wie eine Fernbedienung.

## 4. Fachregeln
Der Browser schickt nur Kennungen; Videos und Sender stehen in `lib/catalog.js`. Ausschalten nur über `/api/power`, nie als Taste.

## 5. Integrationen
Nur das zentrale MCP-Gateway (Server `beamer`, Skill `bh-beamer`, Token `app/bh-apps`). Dieselben Werkzeuge nutzt opencode.

## 6. Architektur-Entscheidungen
_(Nur Entscheidungen mit Auswirkung auf das Produkt.)_

## 7. Lessons Learned
Noch keine.

## 8. Bewusst nicht umgesetzt
Freie Stream-Adressen in der Radio-Liste (nur Katalog).

## 9. Kontext je Modul
_(Geschäftslogik, Konstanten, Quellen je Modul.)_

## 10. Changelog der Produkt-Entscheidungen
| Datum | Was | Warum |
|-------|-----|-------|
|       |     |       |
