# Finanzen: Bekannte Einschränkungen

## Priorität
- Kritisch: Datenverlust, Sicherheit, funktionaler Ausfall
- Wichtig: UX, Skalierung, Performance
- Später: nice-to-have

## Module

| Modul | Datei | Offene Punkte |
|-------|-------|---------------|
| Umgestellte Darlehenskonten | `lib/loans.js`, Tabelle `loan_aliases` | Vergibt eine Bank einem Darlehen eine neue Kontonummer (PSD 10/2025), wird die neue Nummer von Hand als Alias der alten eingetragen; danach zählen Raten und Auszüge beider Nummern zum Darlehen. Abgelöste Darlehen, die nicht mehr in der Tabelle stehen, bleiben als „ohne Darlehen“ gezählt. |
| Darlehensauszüge | `lib/loan-statements.js` | Ein PDF mit mehreren Auszügen wird an jeder „IBAN für dieses Konto“ geteilt (Signal Iduna); andere Banken mit mehreren Konten in einem PDF werden noch als ein Auszug gelesen. Gilt die Tabelle (Portfolioübersicht) als neuer als der letzte Auszug, zählt trotzdem der Auszug, weil das Tabellendatum der Importtag ist. |
| Vermögen | `lib/wealth.js` | Marktwerte nur heutige (kein Verlauf), ab „Besitzer seit“. Restschuld zwischen Jahresauszügen gleichmäßig verteilt. Konten zählen erst ab ihrer ersten Buchung; der Verlauf beginnt, wenn alle Konten mit Bankstand Buchungen haben (Immobilienkonten derzeit ab 01/2025, ältere Auszüge liegen im Drive bei den Steuerunterlagen). Konten ohne Bankstand (CSV) zählen nicht. Depot und Sonstiges nur, soweit eingetragen. |
| Mieten oder Kaufen | `public/components/fin-rentbuy.js` | Zins über die ganze Laufzeit gleich (kein Anschlusszins), keine Wertentwicklung der Wohnung, keine Mietsteigerung, keine Steuern; Kaufnebenkosten sind verloren und werden nicht auf Jahre verteilt. Freier Cashflow und Sparraten trägt man selbst ein (stehen nur in der Adresse, nicht in der Datenbank). |
| Wohnkosten | `lib/housing.js` | Vermieter = häufigster Empfänger unter „Wohnung“ auf Privatkonten; Miete = Betrag, der im Jahr mindestens 3-mal gezahlt wurde, jede andere Zahlung an den Vermieter gilt als Nebenkostenabrechnung. Ändert sich die Miete im November/Dezember (unter 3 Zahlungen im Jahr), zählen diese Monate vorübergehend als Abrechnung. Energie nur bei bekannten Versorgern (Stadtwerke, Vattenfall, GASAG …). Ein Umzug (neuer Vermieter) wird noch nicht getrennt dargestellt. |

## Steuern (22.11.2026)

- Noch keine Steuer-Zuordnung je Kategorie, keine Anlage-V-Vorlage je Wohnung und Jahr, kein Export für die Steuerberatung, keine Fristenübersicht. Vorgehen und Ziel: [TAX.md](TAX.md), Abschnitt 5.

## Prozess

Neue Einschränkung erkannt: sofort hier eintragen, nicht merken. Bei Umsetzung mit Datum nach „Erledigt“ verschieben.
Details zu einem Modul: `docs/limitations/<modul>.md`.
