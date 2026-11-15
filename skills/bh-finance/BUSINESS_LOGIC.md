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
