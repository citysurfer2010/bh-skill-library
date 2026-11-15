# Business Logic: BH Finanzen

## Regeln (Matti, 15.11.2026)

- Vorlage ist die Tabelle „Finanzreport_2024“ mit ihren 36 Kategorien und Arten (Einnahmen, Ausgaben, Investment, Rücklagen, Übertrag, Auslagen).
- Die Daten bleiben auf dem BH-Server. Nichts wird in die Tabelle zurückgeschrieben.

## Kategorien lernen

- Gelernt wird nur aus Entscheidungen der Person: übernommene Kategorien aus der Tabelle und Zuordnungen in der App.
- Eine Gegenpartei wird erst automatisch zugeordnet, wenn sie mindestens zweimal gleich und nie anders gebucht wurde. Sonst landet die Buchung mit Vorschlag unter „Zu prüfen“.

## Auswertung

- Überschuss = Einnahmen + Ausgaben (Ausgaben sind negativ).
- Sparquote = (Investment + Rücklagen) / Einnahmen.
- Überträge zwischen eigenen Konten zählen weder als Einnahme noch als Ausgabe.
- Nicht zugeordnete Buchungen erscheinen als eigene Zeile „Noch nicht zugeordnet“.

## Dubletten

Eine Buchung ist doppelt, wenn Konto, Tag, Betrag und Text gleich sind. Gleiche Zeilen in einer Datei sind echte Buchungen und werden über ihre Reihenfolge unterschieden.

## Bankabruf (Enable Banking, 15.11.2026)

- Nur lesend, nur gebuchte Umsätze. Automatisch höchstens alle 20 Stunden je Konto, „Jetzt abrufen“ jederzeit.
- Abruf ab dem letzten Bank-Umsatz minus 7 Tage Überlappung; der erste Abruf direkt nach dem Verbinden ab 01.01.2025 (die Tabelle endet 2024). Wie weit eine Bank zurück liefert, entscheidet sie; „Buchungen ab“ zeigt es je Konto.
- Jede Bank-Buchung trägt die Bank-ID (`bank_ref`); sie wird nie zweimal gebucht.
- Steht dieselbe Buchung schon aus einem CSV im Konto (gleicher Betrag, ±3 Tage), wird sie verknüpft statt neu angelegt. Ein CSV nach dem Bankabruf überspringt Zeilen mit gleichem Konto, Tag und Betrag.
- Kontoname: Girokonto bekommt den bisherigen Namen (`comdirect`, `BBB`, `PayPal`), die comdirect-Karte `CD-CCM`, alles andere Bank plus IBAN-Ende. Umbenennen zieht die Bank-Buchungen mit und führt sie mit CSV-Buchungen unter dem neuen Namen zusammen (das CSV behält seine Kategorie).
- Läuft die Zustimmung ab oder widerruft die Bank, bleibt der Fehler am Konto stehen und es wird nicht mehr automatisch abgerufen, bis neu verbunden ist.
