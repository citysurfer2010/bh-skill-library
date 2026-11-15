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
- Ohne frische Zustimmung erlauben Banken nur 90 Tage (DKB: „Wrong transactions period requested“, z. B. bei Kautionskonten ohne Bewegung): spätere Abrufe gehen höchstens 89 Tage zurück, nur der erste Abruf direkt nach dem Verbinden weiter.
- Abruf ab dem letzten Bank-Umsatz minus 7 Tage Überlappung; der erste Abruf direkt nach dem Verbinden ab 01.01.2025 (die Tabelle endet 2024). Wie weit eine Bank zurück liefert, entscheidet sie; „Buchungen ab“ zeigt es je Konto.
- Jede Bank-Buchung trägt die Bank-ID (`bank_ref`); sie wird nie zweimal gebucht.
- Steht dieselbe Buchung schon aus einem CSV im Konto (gleicher Betrag, ±3 Tage), wird sie verknüpft statt neu angelegt. Ein CSV nach dem Bankabruf überspringt Zeilen mit gleichem Konto, Tag und Betrag.
- Kontoname: das Girokonto bekommt den bisherigen Namen (`comdirect`, `BBB`, `DKB`, `PayPal`), die comdirect-Karte `CD-CCM`, alles andere Bank plus IBAN-Ende. Girokonto heißt: Produktname der Bank enthält „Giro“ (comdirect meldet auch Tagesgeld als CACC, 15.11.2026: Tagesgeld bekam deshalb zuerst den Namen `comdirect`). Tagesgeld-, Spar- und Festgeldkonten bekommen nie den üblichen Namen, sondern ihre Art: „comdirect Tagesgeldkonto“, „… Festgeldkonto“, „… Sparkonto“ (bei zweien gleicher Art mit IBAN-Ende). Umbenennen zieht die Bank-Buchungen mit und führt sie mit CSV-Buchungen unter dem neuen Namen zusammen (das CSV behält seine Kategorie).
- Läuft die Zustimmung ab oder widerruft die Bank, bleibt der Fehler am Konto stehen und es wird nicht mehr automatisch abgerufen, bis neu verbunden ist.

## PayPal und Vorjahre

- PayPal-Aufladungen und -Abbuchungen („Bankgutschrift auf PayPal-Konto“, „Von Nutzer eingeleitete Abbuchung“, ACH-Rückbuchungen) werden beim PayPal-Import übersprungen: Sie stehen schon auf dem Bankkonto (dort Kategorie TRANS). Gezählt wird nur der echte Kauf auf dem PayPal-Konto.
- Es gelten nur die neuesten Kategorien (Tabelle 2025, Matti 15.11.2026). Vergangene Buchungen behalten ihre Kategorie, wenn es sie noch gibt; die alte Kategorie IMMO ist aufgeteilt: Darlehen/Kredit/Rate/BauGeld → IMMORATE, Gutschriften → IMMOEIN, Rest → IMMOAUS, jeweils mit Bemerkung „früher IMMO“.
- Alte Kontonamen der Tabellen: Comdirect → comdirect, BBBank/BBBank-Bezügekonto → BBB, KK Matti/Visa-Matti/comdirect CC Matti → CD-CCM, DKB Hauptkonto → DKB.

## Konten und Bereiche (15.11.2026)

- Jedes Konto hat einen Bereich: **Haushalt**, **Immobilien** oder **Treuhand**. Nur Haushalt zählt in Übersicht, Investments, Sparquote und „Zu prüfen“; die Buchungsliste zeigt standardmäßig nur Haushaltskonten, ein einzelnes Konto über `?account=`.
- Grund: Matti verknüpfte 21 DKB-Konten, darunter Mietenkonten je Wohnung und Kautions-Treuhandkonten. Mieten kämen sonst doppelt (im Haushalt zählt nur „Überschuss aus Immobilien“), Kautionen sind Geld der Mieter.
- Erste Einordnung aus der Bank: Verwendung ORGA oder „Treuhand/Kaution“ → Treuhand; „Mietenkonto“ oder „Geschäftskonto“ → Immobilien; sonst Haushalt. Eine Wahl der Person wird nie überschrieben.
- Neue Bankkonten mit eigener Beschreibung heißen danach („BLN, Musterwegstraße 20 - WE01“, Kürzel wie „XYZ - “ vorne entfernt; ein einzelnes Wort bekommt die Bank davor: „DKB Geschäftskonto“).
- Umbenennen nimmt alle Buchungen, die Bankverbindung und den Bereich mit. Ein vergebener Name wird abgelehnt; nur ein Bankkonto darf sich einem reinen CSV-Konto anschließen, und erst nach Rückfrage (Server antwortet 409 `code: merge`, die Seite fragt „zusammenführen?“ und schickt `merge: true`), weil sich das Zusammenführen nicht rückgängig machen lässt.
- Offene Buchungen von Immobilien- und Treuhandkonten erscheinen nur grau: sie sind keine Aufgabe für „Zu prüfen“.

## Geldtransfers und „extern rein/raus“ (Matti 15.11.2026)

- Zahlungen zwischen eigenen Konten sind Geldtransfer (TRANS), nie Einnahme oder Ausgabe. Wichtig ist, was extern rein- und rausgeht.
- Erkennung (`lib/transfers.js`), nach jedem CSV-Import, Bankabruf und beim Start: (1) Gegen-IBAN oder eine IBAN im Text gehört zu einem eigenen Konto (nicht dem eigenen); (2) ohne IBAN: gleicher Betrag mit umgekehrtem Vorzeichen auf zwei eigenen Konten innerhalb von 3 Tagen, nur wenn das Paar eindeutig ist und eine Seite einen Kontoinhaber nennt.
- Gesetzt wird nur bei offenen oder per Regel gebuchten Zeilen (`category_source` = transfer); manuelle und aus der Tabelle übernommene Kategorien bleiben.
- Übersicht: „Extern rein“ und „Extern raus“ = alle Haushaltsbuchungen des Jahres ohne Übertrag, auch noch nicht zugeordnete.

## Amazon (15.11.2026)

- Quelle: Dienst `bh-amazon` (Browser, siehe Skill bh-amazon). Matti meldet sich einmal unter „Importieren“ an; gespeichert wird nur die Sitzung.
- Zuordnung: Bestellnummer aus dem Verwendungszweck (94 % der Abbuchungen); sonst eine Amazon-Zahlung gleichen Betrags im Abstand von höchstens 4 Tagen, nur bei Amazon-Buchungen und nur bei genau einem Treffer.
- Erster Abruf ab 01.01.2021, danach täglich ab letzter Zahlung minus 10 Tage. Artikel je Bestellung höchstens 60 je Abruf, neueste zuerst; jede angefragte Bestellung gilt danach als erledigt.
- Anzeige: Buchungsliste „Amazon: ‹Artikel›“, Detail mit Artikeln und Links zum Produkt sowie Link zur Bestellung.

## Kontoart und Kontostände (15.11.2026)

- Kontoart je Konto: Privat (intern `haushalt`), Immobilien, Treuhand; eigene Spalte, Filter `?scope=` auf der Kontenseite.
- Kontostand je Bankkonto aus Enable Banking bei jedem Abruf: gebuchter Tagesendstand (CLBD) vor verfügbarem (ITAV/XPCD). Kennzahlen oben = Summe je Kontoart mit ältestem Stand-Datum; CSV-Konten haben keinen Stand und werden als „ohne Kontostand“ gezählt.
- Depots sind keine PSD2-Zahlungskonten und kommen nicht über Enable Banking; DKB-Depot geplant über FinTS im Skill bh-banking.
